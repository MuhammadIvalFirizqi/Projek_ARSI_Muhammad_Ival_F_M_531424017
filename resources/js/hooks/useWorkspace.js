import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { api, request, clientId, displayName, displayColor } from '../lib/api';
import { withSchedule } from '../lib/schedule';

const MAX_HISTORY = 100; // PRD: undo/redo minimal 50 langkah

window.Pusher = window.Pusher || Pusher;

let echoInstance = null;

function getEcho() {
    if (echoInstance) return echoInstance;
    echoInstance = new Echo({
        broadcaster: 'reverb',
        key: import.meta.env.VITE_REVERB_APP_KEY,
        wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
        wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8082),
        wssPort: Number(import.meta.env.VITE_REVERB_PORT || 8082),
        forceTLS: (import.meta.env.VITE_REVERB_SCHEME || 'http') === 'https',
        enabledTransports: ['ws', 'wss'],
    });
    return echoInstance;
}

const asArray = (value) => (Array.isArray(value) ? value : [value]);

export function useWorkspace(initialState) {
    const [state, setState] = useState(initialState);
    const [saveStatus, setSaveStatus] = useState('saved'); // saved | saving | error
    const [connection, setConnection] = useState('connecting'); // connecting | connected | disconnected
    const [notice, setNotice] = useState(null);
    const [presence, setPresence] = useState({}); // clientId -> {name, color, lastSeen}
    const [editing, setEditing] = useState({}); // clientId -> {task_id, name}
    const [revision, setRevision] = useState(initialState.revision || 0);

    const stateRef = useRef(state);
    const undoStack = useRef([]);
    const redoStack = useRef([]);
    const busy = useRef(false);

    stateRef.current = state;

    /** Tampilan turunan (tanggal & jalur kritis) dihitung ulang setiap perubahan. */
    const view = useMemo(() => withSchedule(state), [state]);

    const pushHistory = useCallback((action) => {
        undoStack.current.push(action);
        if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
        redoStack.current = [];
    }, []);

    /** Terapkan satu langkah request: optimistis dulu, lalu konfirmasi server. */
    const runStep = useCallback(async (steps) => {
        const list = asArray(steps);
        const localSteps = list.filter((item) => item.apply && item.method !== 'noop');
        const noop = list.find((item) => item.method === 'noop');

        if (localSteps.length || noop) {
            setState((current) => {
                let next = current;
                localSteps.forEach((item) => { next = item.apply(next); });
                if (noop) next = noop.apply(next);
                return next;
            });
        }

        const remote = list.filter((item) => item.method !== 'noop' && item.apply);
        if (!remote.length && !list.some((item) => item.method === 'POST')) return null;

        setSaveStatus('saving');
        let lastState = null;
        try {
            for (const item of list) {
                if (item.method === 'noop') continue;
                const payload = await request(item.method, item.url, item.body);
                if (payload?.state) lastState = payload.state;
            }
            if (lastState) {
                setState(lastState);
                setRevision(lastState.revision ?? 0);
            }
            setSaveStatus('saved');
        } catch (error) {
            setSaveStatus('error');
            setNotice({ type: 'error', text: error.message });
            throw error;
        }
        return lastState;
    }, []);

    /** Jalankan aksi {fwd, bwd} dan catat ke riwayat undo. */
    const run = useCallback(async (action) => {
        if (!action) return null;
        pushHistory(action);
        busy.current = true;
        try {
            return await runStep(action.fwd);
        } finally {
            busy.current = false;
        }
    }, [pushHistory, runStep]);

    const undo = useCallback(async () => {
        const action = undoStack.current.pop();
        if (!action) return;
        redoStack.current.push(action);
        try {
            await runStep(action.bwd);
        } catch (error) {
            undoStack.current.push(action);
        }
    }, [runStep]);

    const redo = useCallback(async () => {
        const action = redoStack.current.pop();
        if (!action) return;
        undoStack.current.push(action);
        try {
            await runStep(action.fwd);
        } catch (error) {
            redoStack.current.push(action);
        }
    }, [runStep]);

    const canUndo = undoStack.current.length > 0;
    const canRedo = redoStack.current.length > 0;

    const reload = useCallback(async () => {
        try {
            const payload = await api.get(`/api/projects/${initialState.project.id}/export/json`);
            setState(payload);
            setRevision(payload.revision ?? 0);
            setSaveStatus('saved');
        } catch (error) {
            setNotice({ type: 'error', text: error.message });
        }
    }, [initialState.project.id]);

    // ------------------------------------------------------------- realtime
    const editingTaskRef = useRef(null);

    useEffect(() => {
        const projectId = initialState.project.id;
        let channel = null;

        try {
            const echo = getEcho();
            const pusher = echo.connector.pusher;
            if (pusher?.connection) {
                setConnection(pusher.connection.state === 'connected' ? 'connected' : 'connecting');
                pusher.connection.bind('state_change', ({ current, previous }) => {
                    setConnection(current === 'connected' ? 'connected'
                        : current === 'failed' || current === 'disconnected' ? 'disconnected' : 'connecting');
                    // FR-57: setelah koneksi pulih, ambil perubahan yang terlewat
                    // selama putus (server sumber kebenaran).
                    if (current === 'connected'
                        && (previous === 'disconnected' || previous === 'failed')) {
                        reload();
                    }
                });
            }

            channel = echo.channel(`project.${projectId}`);

            channel.listen('.changed', (event) => {
                if (event.client_id === clientId) {
                    setRevision(event.revision);
                    return;
                }
                // Server sumber kebenaran: ganti seluruh state (last-write-wins, FR-58)
                setState(event.state);
                setRevision(event.revision);
                if (event.action && event.action !== 'updated') {
                    setNotice({
                        type: 'info',
                        text: `${event.object_type} diperbarui oleh ${event.client_id}`,
                    });
                }
            });

            channel.listen('.presence', (event) => {
                const id = event.client_id;
                if (id === clientId) return;
                const payload = event.payload || {};

                if (event.event === 'leave') {
                    setPresence((current) => {
                        const next = { ...current };
                        delete next[id];
                        return next;
                    });
                    setEditing((current) => {
                        const next = { ...current };
                        delete next[id];
                        return next;
                    });
                    return;
                }

                if (payload.name) {
                    setPresence((current) => ({
                        ...current,
                        [id]: {
                            name: payload.name,
                            color: payload.color || '#3b82f6',
                            lastSeen: Date.now(),
                        },
                    }));
                }

                if (event.event === 'editing') {
                    setEditing((current) => ({
                        ...current,
                        [id]: { task_id: payload.task_id || null, name: payload.name || '' },
                    }));
                } else if (event.event === 'clear_editing') {
                    setEditing((current) => {
                        const next = { ...current };
                        delete next[id];
                        return next;
                    });
                }
            });
        } catch (error) {
            setConnection('disconnected');
        }

        return () => {
            try {
                if (channel) getEcho().leave(`project.${projectId}`);
            } catch (error) {
                /* diabaikan */
            }
        };
    }, [initialState.project.id]);

    // ---------------------------------------------------------- kehadiran
    const sendPresence = useCallback(async (event, extra = {}) => {
        try {
            await api.post(`/api/projects/${initialState.project.id}/presence`, {
                event,
                name: displayName.get() || 'Pengunjung',
                color: displayColor.get(),
                ...extra,
            });
        } catch (error) {
            /* kehadiran bersifat pelengkap */
        }
    }, [initialState.project.id]);

    useEffect(() => {
        sendPresence('join');
        const heartbeat = setInterval(() => sendPresence('ping'), 10000);
        const prune = setInterval(() => {
            setPresence((current) => {
                const next = {};
                Object.entries(current).forEach(([id, value]) => {
                    if (Date.now() - value.lastSeen < 30000) next[id] = value;
                });
                return next;
            });
        }, 5000);

        const onUnload = () => {
            const name = displayName.get() || 'Pengunjung';
            navigator.sendBeacon?.(
                `/api/projects/${initialState.project.id}/presence`,
                new Blob([JSON.stringify({ event: 'leave', name })], { type: 'application/json' }),
            );
        };
        window.addEventListener('beforeunload', onUnload);

        return () => {
            clearInterval(heartbeat);
            clearInterval(prune);
            window.removeEventListener('beforeunload', onUnload);
            sendPresence('leave');
        };
    }, [sendPresence, initialState.project.id]);

    /** Beri tahu orang lain bahwa Anda sedang mengedit kegiatan tertentu (FR-60). */
    const setEditingTask = useCallback((taskId) => {
        if (editingTaskRef.current === taskId) return;
        editingTaskRef.current = taskId;
        if (taskId) sendPresence('editing', { task_id: taskId });
        else sendPresence('clear_editing');
    }, [sendPresence]);

    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(timer);
    }, [notice]);

    return {
        state,
        view,
        setState,
        revision,
        saveStatus,
        connection,
        notice,
        setNotice,
        presence,
        editing,
        run,
        undo,
        redo,
        canUndo,
        canRedo,
        reload,
        sendPresence,
        setEditingTask,
        hasHistory: () => undoStack.current.length > 0,
        hasRedo: () => redoStack.current.length > 0,
    };
}
