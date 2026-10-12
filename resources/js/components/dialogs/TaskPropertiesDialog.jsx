import { useEffect, useState } from 'react';
import { formatDisplayDate } from '../../lib/dates';

/**
 * Dialog "Properties for task": tab General, Predecessors, Resources,
 * Custom Columns + area Edit Notes (FR-27..FR-34, FR-42).
 */
export default function TaskPropertiesDialog({
    state, view, taskId, onClose, patchTask, addDependency, removeDependency, patchDependency,
}) {
    const task = view.tasks.find((item) => item.id === taskId);
    const [tab, setTab] = useState('general');
    const [form, setForm] = useState(null);
    const [newPred, setNewPred] = useState({ task_id: '', type: 'FS', delay: 0 });

    useEffect(() => {
        if (!task) return;
        setForm({
            name: task.name,
            milestone: !!task.milestone,
            begin_date: task.begin_date,
            end_date: task.end_date,
            duration: task.duration,
            constraint: task.constraint || '',
            priority: task.priority || 'Normal',
            progress: task.progress ?? 0,
            show_in_timeline: task.show_in_timeline !== false,
            shape: task.shape || 'bar',
            color: task.color || '',
            web_link: task.web_link || '',
            notes: task.notes || '',
            resource_ids: [...(task.resource_ids || [])],
        });
        setTab('general');
    }, [taskId]);

    if (!task || !form) return null;

    const update = (patch) => setForm((current) => ({ ...current, ...patch }));

    const incoming = state.dependencies.filter((dep) => dep.task_id === task.id);
    const outgoing = state.dependencies.filter((dep) => dep.predecessor_id === task.id);

    const submit = () => {
        const patch = {};
        ['name', 'milestone', 'begin_date', 'priority', 'constraint', 'show_in_timeline',
            'shape', 'color', 'web_link', 'notes'].forEach((key) => {
            if (form[key] !== task[key]) patch[key] = form[key];
        });
        if (Number(form.progress) !== task.progress) patch.progress = Number(form.progress);

        const durationChanged = Number(form.duration) !== task.duration;
        const endChanged = form.end_date !== task.end_date;
        const beginChanged = form.begin_date !== task.begin_date;

        if (beginChanged) {
            patch.begin_date = form.begin_date;
            // Tanggal mulai diubah manual: tandai manual_begin (PRD bagian 8, aturan 5).
            patch.manual_begin = true;
        }

        if (form.milestone) {
            if (task.duration !== 0) patch.duration = 0;
        } else if (durationChanged) {
            patch.duration = Number(form.duration);
        } else if (endChanged && !durationChanged) {
            // End date dihitung ulang oleh server dari Begin + Durasi (FR-30)
            patch.end_date = form.end_date;
        }

        if (JSON.stringify([...form.resource_ids].sort()) !== JSON.stringify([...(task.resource_ids || [])].sort())) {
            patch.resource_ids = form.resource_ids;
        }

        if (Object.keys(patch).length) patchTask(task.id, patch);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onMouseDown={onClose}>
            <div
                className="w-full max-w-3xl rounded bg-white shadow-xl"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                    <h3 className="font-semibold">Properties for task</h3>
                    <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
                </div>

                <div className="flex border-b border-slate-200 px-5 pt-2">
                    {[
                        ['general', 'General'],
                        ['predecessors', 'Predecessors'],
                        ['resources', 'Resources'],
                        ['columns', 'Custom Columns'],
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTab(id)}
                            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                                tab === id ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex max-h-[65vh] overflow-hidden">
                    <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
                        {tab === 'general' && (
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <Field label="Name" className="col-span-2">
                                    <input className={input} value={form.name} onChange={(e) => update({ name: e.target.value })} />
                                </Field>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={form.milestone}
                                        onChange={(e) => update({ milestone: e.target.checked })}
                                    />
                                    Milestone
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={form.show_in_timeline}
                                        onChange={(e) => update({ show_in_timeline: e.target.checked })}
                                    />
                                    Show in timeline
                                </label>
                                <Field label="Begin date">
                                    <input type="date" className={input} value={form.begin_date} onChange={(e) => update({ begin_date: e.target.value })} />
                                </Field>
                                <Field label="End date (otomatis dari durasi)">
                                    <input type="date" className={input} value={form.end_date} onChange={(e) => update({ end_date: e.target.value })} />
                                </Field>
                                <Field label="Duration (hari kerja)">
                                    <input
                                        type="number"
                                        min={0}
                                        className={input}
                                        value={form.duration}
                                        disabled={form.milestone}
                                        onChange={(e) => update({ duration: Number(e.target.value) })}
                                    />
                                </Field>
                                <Field label="Progress (%)">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={form.progress}
                                            onChange={(e) => update({ progress: Number(e.target.value) })}
                                            className="flex-1"
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            className={input + ' w-20'}
                                            value={form.progress}
                                            onChange={(e) => update({ progress: Number(e.target.value) })}
                                        />
                                    </div>
                                </Field>
                                <Field label="Additional constraint">
                                    <select className={input} value={form.constraint} onChange={(e) => update({ constraint: e.target.value })}>
                                        <option value="">None</option>
                                        <option value="ASAP">As soon as possible</option>
                                        <option value="ALAP">As late as possible</option>
                                        <option value="must-start">Must start on</option>
                                    </select>
                                </Field>
                                <Field label="Priority">
                                    <select className={input} value={form.priority} onChange={(e) => update({ priority: e.target.value })}>
                                        <option>High</option>
                                        <option>Normal</option>
                                        <option>Low</option>
                                    </select>
                                </Field>
                                <Field label="Shape">
                                    <select className={input} value={form.shape} onChange={(e) => update({ shape: e.target.value })}>
                                        <option value="bar">Bar</option>
                                        <option value="circle">Circle</option>
                                        <option value="triangle">Triangle</option>
                                    </select>
                                </Field>
                                <Field label="Colors">
                                    <input type="color" className={input + ' h-9 p-1'} value={form.color || '#3b82f6'} onChange={(e) => update({ color: e.target.value })} />
                                </Field>
                                <Field label="Web Link" className="col-span-2">
                                    <input className={input} value={form.web_link} placeholder="https://" onChange={(e) => update({ web_link: e.target.value })} />
                                </Field>
                            </div>
                        )}

                        {tab === 'predecessors' && (
                            <div className="space-y-3 text-sm">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-left text-xs text-slate-500">
                                            <th className="py-1">Predecessor</th>
                                            <th className="py-1">Hubungan</th>
                                            <th className="py-1">Delay (hari kerja)</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {incoming.map((dep) => {
                                            const predecessor = view.tasks.find((item) => item.id === dep.predecessor_id);
                                            return (
                                                <tr key={dep.id} className="border-t border-slate-100">
                                                    <td className="py-1.5">{predecessor?.name || '—'}</td>
                                                    <td className="py-1.5">
                                                        <select
                                                            className={input}
                                                            value={dep.type}
                                                            onChange={(e) => patchDependency(dep.id, { type: e.target.value })}
                                                        >
                                                            <option value="FS">Finish-to-Start</option>
                                                            <option value="SS">Start-to-Start</option>
                                                        </select>
                                                    </td>
                                                    <td className="py-1.5">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            className={input}
                                                            value={dep.delay}
                                                            onChange={(e) => patchDependency(dep.id, { delay: Number(e.target.value) })}
                                                        />
                                                    </td>
                                                    <td className="py-1.5 text-right">
                                                        <button type="button" className="text-red-600 hover:underline" onClick={() => removeDependency(dep.id)}>
                                                            Hapus
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {incoming.length === 0 && (
                                            <tr><td colSpan={4} className="py-3 text-slate-400">Belum ada predecessor.</td></tr>
                                        )}
                                    </tbody>
                                </table>

                                <div className="rounded border border-slate-200 p-3">
                                    <div className="mb-2 font-medium">Tambah dependensi</div>
                                    <div className="flex items-end gap-2">
                                        <label className="flex-1">
                                            <span className="mb-1 block text-xs text-slate-500">Kegiatan lain</span>
                                            <select
                                                className={input}
                                                value={newPred.task_id}
                                                onChange={(e) => setNewPred({ ...newPred, task_id: e.target.value })}
                                            >
                                                <option value="">— pilih kegiatan —</option>
                                                {view.tasks
                                                    .filter((item) => item.id !== task.id)
                                                    .map((item) => (
                                                        <option key={item.id} value={item.id}>{item.name}</option>
                                                    ))}
                                            </select>
                                        </label>
                                        <label className="w-44">
                                            <span className="mb-1 block text-xs text-slate-500">Hubungan</span>
                                            <select className={input} value={newPred.type} onChange={(e) => setNewPred({ ...newPred, type: e.target.value })}>
                                                <option value="FS">Finish-to-Start</option>
                                                <option value="SS">Start-to-Start</option>
                                            </select>
                                        </label>
                                        <label className="w-28">
                                            <span className="mb-1 block text-xs text-slate-500">Delay</span>
                                            <input
                                                type="number"
                                                min={0}
                                                className={input}
                                                value={newPred.delay}
                                                onChange={(e) => setNewPred({ ...newPred, delay: Number(e.target.value) })}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            disabled={!newPred.task_id}
                                            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40"
                                            onClick={() => {
                                                addDependency(task.id, newPred.task_id, newPred.type, newPred.delay);
                                                setNewPred({ task_id: '', type: 'FS', delay: 0 });
                                            }}
                                        >
                                            Tambah
                                        </button>
                                    </div>
                                    {outgoing.length > 0 && (
                                        <div className="mt-3 text-xs text-slate-500">
                                            Kegiatan ini menjadi predecessor untuk: {' '}
                                            {outgoing.map((dep) => view.tasks.find((item) => item.id === dep.task_id)?.name).join(', ')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {tab === 'resources' && (
                            <div className="space-y-2 text-sm">
                                <div className="text-slate-500">Tugaskan satu atau beberapa anggota tim ke kegiatan ini (FR-32).</div>
                                {state.resources.map((resource) => {
                                    const checked = form.resource_ids.includes(resource.id);
                                    return (
                                        <label key={resource.id} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => update({
                                                    resource_ids: checked
                                                        ? form.resource_ids.filter((id) => id !== resource.id)
                                                        : [...form.resource_ids, resource.id],
                                                })}
                                            />
                                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: resource.color || '#3b82f6' }} />
                                            <span className="flex-1">{resource.name}</span>
                                            <span className="text-xs text-slate-400">{resource.default_role || '—'}</span>
                                        </label>
                                    );
                                })}
                                {state.resources.length === 0 && (
                                    <div className="text-slate-400">Belum ada resource. Tambahkan lewat menu Resource.</div>
                                )}
                            </div>
                        )}

                        {tab === 'columns' && (
                            <div className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                                Kolom tambahan buatan pengguna (Custom Columns) merupakan fitur Rilis 2.0 (P2) dan belum
                                tersedia pada versi ini.
                            </div>
                        )}
                    </div>

                    <aside className="w-64 shrink-0 border-l border-slate-200 bg-slate-50 p-4">
                        <div className="mb-2 text-sm font-medium">Edit Notes</div>
                        <textarea
                            className="h-56 w-full resize-none rounded border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                            value={form.notes}
                            placeholder="Catatan kegiatan…"
                            onChange={(e) => update({ notes: e.target.value })}
                        />
                        <div className="mt-3 text-xs text-slate-400">
                            Dibuat: {formatDisplayDate(task.begin_date, state.project.date_format)}
                        </div>
                    </aside>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                    <span className="text-xs text-slate-400">Perubahan langsung disimpan ke server</span>
                    <div className="flex gap-2">
                        <button type="button" className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="button" className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white" onClick={submit}>
                            Ok
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const input = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none';

function Field({ label, children, className = '' }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
            {children}
        </label>
    );
}
