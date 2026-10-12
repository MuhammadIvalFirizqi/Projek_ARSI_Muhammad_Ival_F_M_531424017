import { useState } from 'react';
import { formatDisplayDate, parseDate } from '../lib/dates';
import { ROW_HEIGHT } from '../lib/gantt';

/**
 * Panel kiri: daftar kegiatan (Name, Begin date, End date) dengan edit langsung
 * pada sel (FR-47), drag and drop urutan (FR-48), dan menu klik kanan (FR-52).
 */
export default function TaskList({
    rows, view, settings, selectedId, setSelectedId, collapsed, setCollapsed,
    patchTask, openTaskDialog, openContextMenu, reorder, editingTaskIds, query,
    showCritical = true,
}) {
    const [editing, setEditing] = useState(null); // {id, field}
    const [drag, setDrag] = useState(null); // {id, over, position}
    const fmt = settings.date_format;

    const commit = (task, field, value) => {
        setEditing(null);
        if (field === 'name') {
            if (value.trim() && value !== task.name) patchTask(task.id, { name: value.trim() });
            return;
        }
        if (field === 'begin_date') {
            if (!parseDate(value)) return;
            // Tanggal mulai diubah manual: tandai manual_begin (PRD bagian 8, aturan 5).
            if (value !== task.begin_date) patchTask(task.id, { begin_date: value, manual_begin: true });
            return;
        }
        if (field === 'end_date') {
            if (!parseDate(value)) return;
            if (value !== task.end_date) patchTask(task.id, { end_date: value });
            return;
        }
        if (field === 'duration') {
            const amount = Number(value);
            if (!Number.isNaN(amount) && amount >= 0 && amount !== task.duration) {
                patchTask(task.id, { duration: amount });
            }
        }
    };

    const onDrop = () => {
        if (drag && drag.over && drag.position) {
            reorder(drag.id, drag.over, drag.position);
        }
        setDrag(null);
    };

    return (
        <div className="min-w-full">
            <div className="sticky top-0 z-10 flex border-b border-slate-300 bg-slate-100 text-xs font-semibold text-slate-600">
                <div className="flex-1 px-3 py-2">Name</div>
                <div className="w-[104px] px-2 py-2 text-right">Begin date</div>
                <div className="w-[104px] px-2 py-2 text-right">End date</div>
                <div className="w-[46px] px-2 py-2 text-right">Dur</div>
            </div>

            <div className="pb-6">
                {rows.length === 0 && (
                    <div className="p-6 text-sm text-slate-400">
                        {query ? 'Tidak ada kegiatan yang cocok.' : 'Belum ada kegiatan. Klik kanan untuk menambah.'}
                    </div>
                )}

                {rows.map((row) => {
                    const task = view.tasks.find((item) => item.id === row.id) || row.task;
                    const isSelected = selectedId === row.id;
                    const isBeingEdited = editingTaskIds.includes(row.id);
                    const editingName = editing && editing.id === row.id && editing.field === 'name';

                    return (
                        <div
                            key={row.id}
                            data-task-id={row.id}
                            draggable={editing?.id !== row.id}
                            onDragStart={(event) => {
                                setDrag({ id: row.id, over: null, position: null });
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', row.id);
                            }}
                            onDragOver={(event) => {
                                if (!drag || drag.id === row.id) return;
                                event.preventDefault();
                                const box = event.currentTarget.getBoundingClientRect();
                                const ratio = (event.clientY - box.top) / box.height;
                                const position = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside';
                                setDrag((current) => (current ? { ...current, over: row.id, position } : current));
                            }}
                            onDrop={(event) => { event.preventDefault(); onDrop(); }}
                            onDragEnd={() => setDrag(null)}
                            onClick={() => setSelectedId(row.id)}
                            onDoubleClick={(event) => {
                                if (!editing) {
                                    event.stopPropagation();
                                    openTaskDialog(row.id);
                                }
                            }}
                            onContextMenu={(event) => openContextMenu(event, { type: 'task', id: row.id })}
                            style={{ height: ROW_HEIGHT }}
                            className={`group relative flex cursor-pointer items-center border-b border-slate-100 text-sm ${
                                isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                            } ${drag?.over === row.id && drag.position === 'before' ? 'border-t-2 border-t-blue-500' : ''}
                              ${drag?.over === row.id && drag.position === 'after' ? 'border-b-2 border-b-blue-500' : ''}
                              ${drag?.over === row.id && drag.position === 'inside' ? 'bg-blue-100' : ''}`}
                        >
                            <div className="flex min-w-0 flex-1 items-center px-2" style={{ paddingLeft: 8 + row.depth * 16 }}>
                                {row.hasChildren ? (
                                    <button
                                        type="button"
                                        className="mr-1 h-4 w-4 shrink-0 rounded text-[10px] leading-none text-slate-500 hover:bg-slate-200"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setCollapsed((current) => ({ ...current, [row.id]: !current[row.id] }));
                                        }}
                                    >
                                        {collapsed[row.id] ? '▸' : '▾'}
                                    </button>
                                ) : (
                                    <span className="mr-1 h-4 w-4 shrink-0 text-center text-[10px] leading-4 text-slate-400">
                                        {task.milestone ? '◆' : '•'}
                                    </span>
                                )}

                                <span
                                    className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                                    style={{ background: task.color || settings.bar_color, opacity: row.isSummary ? 0.45 : 1 }}
                                />

                                {editingName ? (
                                    <input
                                        autoFocus
                                        defaultValue={task.name}
                                        className="min-w-0 flex-1 rounded border border-blue-400 px-1 py-0.5 text-sm outline-none"
                                        onClick={(event) => event.stopPropagation()}
                                        onBlur={(event) => commit(task, 'name', event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') commit(task, 'name', event.target.value);
                                            if (event.key === 'Escape') setEditing(null);
                                        }}
                                    />
                                ) : (
                                    <span
                                        className={`min-w-0 flex-1 truncate ${row.isSummary ? 'font-semibold text-slate-700' : ''} ${
                                            showCritical && task.critical && !task.color ? 'text-red-600' : ''
                                        }`}
                                        onDoubleClick={(event) => {
                                            event.stopPropagation();
                                            setEditing({ id: row.id, field: 'name' });
                                        }}
                                        title={task.name}
                                    >
                                        {task.name}
                                        {task.milestone && <span className="ml-1 text-xs text-slate-400">(milestone)</span>}
                                        {task.progress > 0 && (
                                            <span className="ml-1.5 text-xs text-slate-400">{task.progress}%</span>
                                        )}
                                    </span>
                                )}

                                {isBeingEdited && (
                                    <span className="ml-1 shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-700" title="Sedang diedit pengguna lain">
                                        ✎
                                    </span>
                                )}
                            </div>

                            <DateCell
                                value={task.begin_date}
                                display={formatDisplayDate(task.begin_date, fmt)}
                                editing={editing && editing.id === row.id && editing.field === 'begin_date'}
                                onEdit={() => setEditing({ id: row.id, field: 'begin_date' })}
                                onCommit={(value) => commit(task, 'begin_date', value)}
                                onCancel={() => setEditing(null)}
                                width={104}
                            />
                            <DateCell
                                value={task.end_date}
                                display={formatDisplayDate(task.end_date, fmt)}
                                editing={editing && editing.id === row.id && editing.field === 'end_date'}
                                onEdit={() => setEditing({ id: row.id, field: 'end_date' })}
                                onCommit={(value) => commit(task, 'end_date', value)}
                                onCancel={() => setEditing(null)}
                                width={104}
                            />
                            <div
                                className="w-[46px] cursor-text px-2 py-1 text-right text-slate-500 hover:bg-slate-100"
                                onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    setEditing({ id: row.id, field: 'duration' });
                                }}
                            >
                                {editing && editing.id === row.id && editing.field === 'duration' ? (
                                    <input
                                        autoFocus
                                        type="number"
                                        min={0}
                                        defaultValue={task.duration}
                                        className="w-full rounded border border-blue-400 px-1 text-right text-sm outline-none"
                                        onClick={(event) => event.stopPropagation()}
                                        onBlur={(event) => commit(task, 'duration', event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') commit(task, 'duration', event.target.value);
                                            if (event.key === 'Escape') setEditing(null);
                                        }}
                                    />
                                ) : (
                                    task.duration
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function DateCell({ value, display, editing, onEdit, onCommit, onCancel, width }) {
    return (
        <div
            className="cursor-text px-2 py-1 text-right text-slate-600 hover:bg-slate-100"
            style={{ width }}
            onDoubleClick={(event) => { event.stopPropagation(); onEdit(); }}
        >
            {editing ? (
                <input
                    autoFocus
                    type="date"
                    defaultValue={value || ''}
                    className="w-full rounded border border-blue-400 px-1 text-right text-sm outline-none"
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => onCommit(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') onCommit(event.target.value);
                        if (event.key === 'Escape') onCancel();
                    }}
                />
            ) : (
                display
            )}
        </div>
    );
}
