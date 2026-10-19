import { router } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../../hooks/useWorkspace';
import {
    createCustomColumnAction,
    createDependencyAction,
    createResourceAction,
    createTaskAction,
    deleteCustomColumnAction,
    deleteDependencyAction,
    deleteResourceAction,
    deleteTaskAction,
    patchCalendarAction,
    patchCustomColumnAction,
    patchDependencyAction,
    patchProjectAction,
    patchResourceAction,
    patchTaskAction,
    reorderTasksAction,
} from '../../lib/actions';
import { api, displayName, displayColor } from '../../lib/api';
import { addDays, diffDays, today, uid } from '../../lib/dates';
import { buildRows, dayWidth, ROW_HEIGHT } from '../../lib/gantt';
import MenuBar from '../../components/MenuBar';
import Toolbar from '../../components/Toolbar';
import TaskList from '../../components/TaskList';
import GanttChart from '../../components/GanttChart';
import ResourcesChart from '../../components/ResourcesChart';
import PertChart from '../../components/PertChart';
import ContextMenu from '../../components/ContextMenu';
import TaskPropertiesDialog from '../../components/dialogs/TaskPropertiesDialog';
import ResourcesDialog from '../../components/dialogs/ResourcesDialog';
import ProjectDialog from '../../components/dialogs/ProjectDialog';
import SettingsDialog from '../../components/dialogs/SettingsDialog';
import HelpDialog from '../../components/dialogs/HelpDialog';

const DEFAULT_COLOR = '#3b82f6';

export default function Workspace({ state: initialState }) {
    const ws = useWorkspace(initialState);
    const { state, view } = ws;

    const [tab, setTab] = useState('gantt');
    const [zoom, setZoom] = useState(3);
    const [viewStart, setViewStart] = useState(() => addDays(view.project_start || today(), -3).toISOString().slice(0, 10));
    const [selectedId, setSelectedId] = useState(null);
    const [collapsed, setCollapsed] = useState({});
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [showCritical, setShowCritical] = useState(true);
    const [clipboard, setClipboard] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [dialog, setDialog] = useState(null); // task | resources | project | settings | help
    const [dialogTaskId, setDialogTaskId] = useState(null);
    const [dialogResourceId, setDialogResourceId] = useState(null);
    const [settings, setSettings] = useState({
        date_format: initialState.project.date_format || 'DD MMM YYYY',
        font_size: 14,
        bar_color: DEFAULT_COLOR,
    });

    const listRef = useRef(null);
    const timelineRef = useRef(null);
    const searchRef = useRef(null);
    const syncing = useRef(false);

    const px = dayWidth(zoom);
    const rows = useMemo(
        () => buildRows(view.tasks, { collapsed, query }),
        [view.tasks, collapsed, query],
    );

    const rangeStart = useMemo(() => {
        const projectStart = view.project_start || today();
        const earliest = view.tasks.reduce(
            (acc, task) => (task.begin_date < acc ? task.begin_date : acc),
            projectStart,
        );
        const candidate = addDays(earliest, -5).toISOString().slice(0, 10);
        return candidate < viewStart ? candidate : viewStart;
    }, [view.tasks, view.project_start, viewStart]);

    const rangeEnd = useMemo(() => {
        const projectEnd = view.project_end || today();
        const latest = view.tasks.reduce(
            (acc, task) => (task.end_date > acc ? task.end_date : acc),
            projectEnd,
        );
        return addDays(latest, 14).toISOString().slice(0, 10);
    }, [view.tasks, view.project_end]);

    const totalDays = Math.max(30, diffDays(rangeStart, rangeEnd) + 1);

    // -------------------------------------------------------- aksi kegiatan
    const patchTask = useCallback((id, patch) => ws.run(patchTaskAction(ws.state, id, patch)), [ws]);

    const addTask = useCallback((draft = {}) => {
        const parentId = draft.parent_id !== undefined
            ? draft.parent_id
            : (selectedId && rows.find((row) => row.id === selectedId)?.isSummary ? selectedId : null);
        const siblings = ws.state.tasks.filter((task) => (task.parent_id || null) === (parentId || null));
        const action = createTaskAction(ws.state, {
            begin_date: today(),
            duration: 1,
            position: siblings.length,
            ...draft,
            parent_id: parentId,
        });
        setSelectedId(action.createdId);
        return ws.run(action);
    }, [rows, selectedId, ws]);

    const removeTask = useCallback((id) => ws.run(deleteTaskAction(ws.state, id)), [ws]);

    const openTaskDialog = useCallback((id) => {
        setDialogTaskId(id);
        setDialog('task');
        ws.setEditingTask(id);
    }, [ws]);

    const closeDialog = useCallback(() => {
        if (dialog === 'task') ws.setEditingTask(null);
        setDialog(null);
        setDialogTaskId(null);
        setDialogResourceId(null);
    }, [dialog, ws]);

    // -------------------------------------------------------- aksi resource
    const saveResource = useCallback((resource) => {
        const exists = ws.state.resources.some((item) => item.id === resource.id);
        if (exists) return ws.run(patchResourceAction(ws.state, resource.id, resource));
        const action = createResourceAction(ws.state, resource);
        setDialogResourceId(action.createdId);
        return ws.run(action);
    }, [ws]);

    const removeResource = useCallback((id) => ws.run(deleteResourceAction(ws.state, id)), [ws]);

    // ------------------------------------------------------ kolom tambahan
    const createCustomColumn = useCallback(
        (draft) => ws.run(createCustomColumnAction(ws.state, draft)), [ws]);
    const patchCustomColumn = useCallback(
        (id, patch) => ws.run(patchCustomColumnAction(ws.state, id, patch)), [ws]);
    const deleteCustomColumn = useCallback(
        (id) => ws.run(deleteCustomColumnAction(ws.state, id)), [ws]);

    // --------------------------------------------------------- papan klip
    const copyTask = useCallback((id, cut = false) => {
        const source = ws.state.tasks.find((task) => task.id === id);
        if (!source) return;
        setClipboard({ task: { ...source, id: null }, cut });
    }, [ws.state.tasks]);

    const pasteTask = useCallback(() => {
        if (!clipboard) return;
        const { task } = clipboard;
        addTask({
            ...task,
            id: uid(),
            name: clipboard.cut ? task.name : `${task.name} (salinan)`,
            parent_id: selectedId && rows.find((row) => row.id === selectedId)?.isSummary ? selectedId : null,
        });
        if (clipboard.cut) {
            removeTask(task.id);
            setClipboard(null);
        }
    }, [addTask, clipboard, removeTask, rows, selectedId]);

    // ------------------------------------------------------- urutan & tingkat
    const reorder = useCallback((dragId, targetId, position) => {
        if (dragId === targetId) return;
        const tasks = ws.state.tasks;
        const dragTask = tasks.find((task) => task.id === dragId);
        const target = tasks.find((task) => task.id === targetId);
        if (!dragTask || !target) return;

        const parentId = position === 'inside' ? targetId : (target.parent_id || null);
        if (parentId === dragId) return;

        const siblings = tasks
            .filter((task) => (task.parent_id || null) === parentId && task.id !== dragId)
            .sort((a, b) => a.position - b.position);

        const index = siblings.findIndex((task) => task.id === targetId);
        const insertAt = position === 'before' ? index : index + 1;
        siblings.splice(Math.max(0, insertAt), 0, { ...dragTask, parent_id: parentId });

        const items = [
            ...siblings.map((task, order) => ({ id: task.id, parent_id: parentId, position: order })),
            ...tasks
                .filter((task) => !siblings.some((sibling) => sibling.id === task.id))
                .map((task) => ({ id: task.id, parent_id: task.parent_id || null, position: task.position })),
        ];
        ws.run(reorderTasksAction(ws.state, items));
    }, [ws]);

    const setLevel = useCallback((id, direction) => {
        const tasks = ws.state.tasks;
        const task = tasks.find((item) => item.id === id);
        if (!task) return;

        const siblings = tasks
            .filter((item) => (item.parent_id || null) === (task.parent_id || null))
            .sort((a, b) => a.position - b.position);
        const index = siblings.findIndex((item) => item.id === id);

        if (direction === 'in') {
            if (index === 0) return;
            const newParent = siblings[index - 1];
            const children = tasks.filter((item) => (item.parent_id || null) === newParent.id);
            reorder(id, newParent.id, 'inside');
            void children;
        } else {
            if (!task.parent_id) return;
            const parent = tasks.find((item) => item.id === task.parent_id);
            if (!parent) return;
            const items = tasks
                .filter((item) => (item.parent_id || null) === (parent.parent_id || null))
                .map((item) => ({ id: item.id, parent_id: item.parent_id || null, position: item.position }));
            items.push({ id, parent_id: parent.parent_id || null, position: parent.position + 1 });
            ws.run(reorderTasksAction(ws.state, items));
        }
    }, [reorder, ws]);

    // ------------------------------------------------------------ dependensi
    const addDependency = useCallback((taskId, predecessorId, type = 'FS', delay = 0) => {
        if (taskId === predecessorId) return;
        const exists = ws.state.dependencies.find(
            (dep) => dep.task_id === taskId && dep.predecessor_id === predecessorId,
        );
        if (exists) return;
        ws.run(createDependencyAction(ws.state, { task_id: taskId, predecessor_id: predecessorId, type, delay }));
    }, [ws]);

    const removeDependency = useCallback(
        (id) => ws.run(deleteDependencyAction(ws.state, id)),
        [ws],
    );

    const patchDependency = useCallback(
        (id, patch) => ws.run(patchDependencyAction(ws.state, id, patch)),
        [ws],
    );

    // ----------------------------------------------------------- gerak batang
    const moveTask = useCallback((id, newBegin) => {
        const task = view.tasks.find((item) => item.id === id);
        if (!task || task.begin_date === newBegin) return;
        const shift = diffDays(task.begin_date, newBegin);
        // Geser manual: tandai manual_begin supaya kegiatan tidak ikut
        // berubah saat predecessor-nya disesuaikan (kecuali ditarik lagi).
        patchTask(id, { begin_date: newBegin, manual_begin: true });
        void shift;
    }, [patchTask, view.tasks]);

    const resizeTask = useCallback((id, newEnd) => {
        const task = view.tasks.find((item) => item.id === id);
        if (!task || task.end_date === newEnd) return;
        if (diffDays(task.begin_date, newEnd) < 0) return;
        const calendar = null;
        void calendar;
        patchTask(id, { end_date: newEnd });
    }, [patchTask, view.tasks]);

    const setProgress = useCallback((id, progress) => {
        patchTask(id, { progress: Math.max(0, Math.min(100, Math.round(progress))) });
    }, [patchTask]);

    // ------------------------------------------------------------ dialog lain
    const openProjectDialog = () => setDialog('project');
    const openResourcesDialog = (resourceId = null) => {
        setDialogResourceId(resourceId);
        setDialog('resources');
    };

    const saveSettings = (next) => {
        setSettings(next);
        ws.run(patchProjectAction(ws.state, { date_format: next.date_format }));
        setDialog(null);
    };

    const newProject = () => router.visit('/');
    const openProject = () => router.visit('/');
    const doSaveAs = async () => {
        const name = window.prompt('Simpan sebagai (nama proyek baru):', `${ws.state.project.name} (salinan)`);
        if (!name) return;
        try {
            const payload = await api.post(`/api/projects/${ws.state.project.id}/duplicate`, { name });
            router.visit(`/projects/${payload.id}`);
        } catch (error) {
            ws.setNotice({ type: 'error', text: error.message });
        }
    };
    const doExport = async (format) => {
        try {
            const response = await fetch(`/api/projects/${ws.state.project.id}/export/${format}`, {
                headers: { 'X-Client-Id': 'export' },
            });
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${ws.state.project.name}.${format}`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            ws.setNotice({ type: 'error', text: error.message });
        }
    };
    const doPrint = () => window.print();

    const goToday = () => setViewStart(addDays(today(), -3).toISOString().slice(0, 10));
    const goPast = () => setViewStart((current) => addDays(current, -21).toISOString().slice(0, 10));
    const goFuture = () => setViewStart((current) => addDays(current, 21).toISOString().slice(0, 10));

    const toggleCritical = () => setShowCritical((value) => !value);

    const zoomIn = () => setZoom((value) => Math.max(1, value - 1));
    const zoomOut = () => setZoom((value) => Math.min(DAY_COUNT, value + 1));
    const DAY_COUNT = 5;

    // ------------------------------------------------------------ pintasan
    useEffect(() => {
        const onKeyDown = (event) => {
            const tag = event.target.tagName;
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
            const ctrl = event.ctrlKey || event.metaKey;

            if (ctrl && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                setSearchOpen(true);
                setTimeout(() => searchRef.current?.focus(), 0);
                return;
            }
            if (ctrl && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                event.preventDefault();
                ws.undo();
                return;
            }
            if (ctrl && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
                event.preventDefault();
                ws.redo();
                return;
            }
            if (ctrl && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (event.shiftKey) doSaveAs();
                else ws.reload();
                return;
            }
            if (ctrl && event.key.toLowerCase() === 'p') {
                event.preventDefault();
                doPrint();
                return;
            }
            if (ctrl && event.key.toLowerCase() === 'o') {
                event.preventDefault();
                openProject();
                return;
            }
            if (ctrl && event.key.toLowerCase() === 'n') {
                event.preventDefault();
                newProject();
                return;
            }
            if (ctrl && event.key.toLowerCase() === 'q') {
                event.preventDefault();
                openProject();
                return;
            }
            if (event.key === 'F5') {
                event.preventDefault();
                ws.reload();
                return;
            }
            if (typing) return;

            if (event.key === 'Delete' && selectedId) {
                event.preventDefault();
                removeTask(selectedId);
            } else if (event.key === 'Tab' && selectedId) {
                event.preventDefault();
                setLevel(selectedId, event.shiftKey ? 'out' : 'in');
            } else if (event.key === 'Escape') {
                setContextMenu(null);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [removeTask, selectedId, setLevel, ws]);

    // ------------------------------------------------------- sinkron scroll
    const syncFromTimeline = useCallback(() => {
        if (syncing.current) return;
        syncing.current = true;
        if (listRef.current && timelineRef.current) {
            listRef.current.scrollTop = timelineRef.current.scrollTop;
        }
        requestAnimationFrame(() => { syncing.current = false; });
    }, []);

    const syncFromList = useCallback(() => {
        if (syncing.current) return;
        syncing.current = true;
        if (listRef.current && timelineRef.current) {
            timelineRef.current.scrollTop = listRef.current.scrollTop;
        }
        requestAnimationFrame(() => { syncing.current = false; });
    }, []);

    const openContextMenu = useCallback((event, target) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ x: event.clientX, y: event.clientY, target });
    }, []);

    const menuItems = {
        onNewTask: () => addTask({}),
        onNewSubtask: () => {
            if (!selectedId) return;
            addTask({ parent_id: selectedId });
        },
        onTaskProperties: () => selectedId && openTaskDialog(selectedId),
        onDeleteTask: () => selectedId && removeTask(selectedId),
        onCut: () => selectedId && copyTask(selectedId, true),
        onCopy: () => selectedId && copyTask(selectedId, false),
        onPaste: pasteTask,
        onUndo: ws.undo,
        onRedo: ws.redo,
        onRefresh: ws.reload,
        onSearch: () => {
            setSearchOpen(true);
            setTimeout(() => searchRef.current?.focus(), 0);
        },
        onSettings: () => setDialog('settings'),
        onHelp: () => setDialog('help'),
        onProperties: openProjectDialog,
        onNew: newProject,
        onOpen: openProject,
        onSaveAs: doSaveAs,
        onExport: doExport,
        onPrint: doPrint,
        onQuit: openProject,
        onResources: () => openResourcesDialog(),
        onNewResource: () => openResourcesDialog(null),
        view: {
            tab,
            setTab,
            zoom,
            zoomIn,
            zoomOut,
            goToday,
            goPast,
            goFuture,
            showCritical,
            toggleCritical,
        },
        canUndo: ws.hasHistory(),
        canRedo: ws.hasRedo(),
        selectedId,
    };

    const editingTaskIds = Object.values(ws.editing).map((value) => value.task_id).filter(Boolean);

    return (
        <div
            className="flex h-screen flex-col bg-slate-100 text-slate-800 select-none"
            style={{ fontSize: settings.font_size }}
            data-connection={ws.connection}
        >
            <MenuBar items={menuItems} state={state} />
            <Toolbar
                items={menuItems}
                searchOpen={searchOpen}
                setSearchOpen={setSearchOpen}
                query={query}
                setQuery={setQuery}
                searchRef={searchRef}
                tab={tab}
                setTab={setTab}
            />

            <div className="flex min-h-0 flex-1">
                {tab === 'gantt' && (
                    <>
                        <div ref={listRef} className="w-[430px] shrink-0 overflow-y-auto border-r border-slate-300 bg-white" onScroll={syncFromList}>
                            <TaskList
                                rows={rows}
                                state={state}
                                view={view}
                                settings={settings}
                                selectedId={selectedId}
                                setSelectedId={setSelectedId}
                                collapsed={collapsed}
                                setCollapsed={setCollapsed}
                                patchTask={patchTask}
                                openTaskDialog={openTaskDialog}
                                openContextMenu={openContextMenu}
                                reorder={reorder}
                                editingTaskIds={editingTaskIds}
                                query={query}
                                showCritical={showCritical}
                            />
                        </div>
                        <div ref={timelineRef} className="relative min-w-0 flex-1 overflow-auto" onScroll={syncFromTimeline}>
                            <GanttChart
                                rows={rows}
                                state={state}
                                view={view}
                                settings={settings}
                                px={px}
                                rangeStart={rangeStart}
                                totalDays={totalDays}
                                selectedId={selectedId}
                                setSelectedId={setSelectedId}
                                openTaskDialog={openTaskDialog}
                                openContextMenu={openContextMenu}
                                moveTask={moveTask}
                                resizeTask={resizeTask}
                                setProgress={setProgress}
                                addDependency={addDependency}
                                showCritical={showCritical}
                                editingTaskIds={editingTaskIds}
                                zoom={zoom}
                            />
                        </div>
                    </>
                )}

                {tab === 'resources' && (
                    <>
                        <div ref={listRef} className="w-[430px] shrink-0 overflow-y-auto border-r border-slate-300 bg-white" onScroll={syncFromList}>
                            <ResourcesChart
                                state={state}
                                view={view}
                                openResourcesDialog={openResourcesDialog}
                                settings={settings}
                            />
                        </div>
                        <div ref={timelineRef} className="relative min-w-0 flex-1 overflow-auto" onScroll={syncFromTimeline}>
                            <ResourcesChart
                                state={state}
                                view={view}
                                mode="timeline"
                                px={px}
                                rangeStart={rangeStart}
                                totalDays={totalDays}
                                settings={settings}
                                showCritical={showCritical}
                            />
                        </div>
                    </>
                )}

                {tab === 'pert' && (
                    <div className="min-w-0 flex-1 overflow-auto bg-slate-50">
                        <PertChart
                            state={state}
                            view={view}
                            showCritical={showCritical}
                            setSelectedId={setSelectedId}
                            openTaskDialog={openTaskDialog}
                            settings={settings}
                        />
                    </div>
                )}
            </div>

            {contextMenu && (
                <ContextMenu
                    menu={contextMenu}
                    state={state}
                    onClose={() => setContextMenu(null)}
                    onAction={(action) => {
                        const target = contextMenu.target;
                        setContextMenu(null);
                        if (target?.type === 'task') setSelectedId(target.id);
                        if (action === 'new') addTask({});
                        if (action === 'subtask') addTask({ parent_id: target.id });
                        if (action === 'properties') openTaskDialog(target.id);
                        if (action === 'delete') removeTask(target.id);
                        if (action === 'copy') copyTask(target.id, false);
                        if (action === 'cut') copyTask(target.id, true);
                        if (action === 'paste') pasteTask();
                        if (action === 'indent') setLevel(target.id, 'in');
                        if (action === 'outdent') setLevel(target.id, 'out');
                        if (action === 'new-resource') openResourcesDialog(null);
                        if (action === 'edit-resource') openResourcesDialog(target.id);
                    }}
                />
            )}

            {dialog === 'task' && (
                <TaskPropertiesDialog
                    state={state}
                    view={view}
                    taskId={dialogTaskId}
                    onClose={closeDialog}
                    patchTask={patchTask}
                    addDependency={addDependency}
                    removeDependency={removeDependency}
                    patchDependency={patchDependency}
                />
            )}
            {dialog === 'resources' && (
                <ResourcesDialog
                    state={state}
                    view={view}
                    resourceId={dialogResourceId}
                    onClose={closeDialog}
                    onSave={saveResource}
                    onDelete={removeResource}
                    onCreateColumn={createCustomColumn}
                    onPatchColumn={patchCustomColumn}
                    onDeleteColumn={deleteCustomColumn}
                />
            )}
            {dialog === 'project' && (
                <ProjectDialog
                    state={state}
                    onClose={closeDialog}
                    patchProject={(patch) => ws.run(patchProjectAction(ws.state, patch))}
                    patchCalendar={(patch) => ws.run(patchCalendarAction(ws.state, patch))}
                />
            )}
            {dialog === 'settings' && (
                <SettingsDialog settings={settings} onClose={() => setDialog(null)} onSave={saveSettings} />
            )}
            {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}

            {ws.notice && (
                <div
                    className={`fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded px-4 py-2 text-sm text-white shadow-lg ${
                        ws.notice.type === 'error' ? 'bg-red-600' : 'bg-slate-800'
                    }`}
                >
                    {ws.notice.text}
                </div>
            )}
        </div>
    );
}
