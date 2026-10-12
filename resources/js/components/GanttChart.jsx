import { useMemo, useRef, useState } from 'react';
import { addDays, diffDays, formatDisplayDate, parseDate, today } from '../lib/dates';
import { barGeometry, ROW_HEIGHT } from '../lib/gantt';
import { WorkingCalendar } from '../lib/schedule';

const MONTH_LABEL_HEIGHT = 20;

/**
 * Schedule Display: skala tanggal, kolom weekend/hari libur abu-abu (FR-16),
 * batang kegiatan yang bisa digeser (FR-43), tepi batang untuk durasi (FR-44),
 * penanda progres (FR-45), dan tarik garis untuk dependensi (FR-46).
 */
export default function GanttChart({
    rows, state, view, settings, px, rangeStart, totalDays, selectedId, setSelectedId,
    openTaskDialog, openContextMenu, moveTask, resizeTask, setProgress, addDependency,
    showCritical, editingTaskIds, zoom,
}) {
    const calendar = useMemo(() => WorkingCalendar.fromCalendar(state.calendar), [state.calendar]);
    const [preview, setPreview] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const dragRef = useRef(null);
    const svgRef = useRef(null);

    const days = useMemo(() => calendar.eachDay(rangeStart, addDays(rangeStart, totalDays - 1).toISOString().slice(0, 10)), [calendar, rangeStart, totalDays]);
    const rowIndex = useMemo(() => {
        const map = {};
        rows.forEach((row, index) => { map[row.id] = index; });
        return map;
    }, [rows]);

    const months = useMemo(() => {
        const list = [];
        days.forEach((day) => {
            const key = day.slice(0, 7);
            const last = list[list.length - 1];
            if (last && last.key === key) last.span += 1;
            else list.push({ key, span: 1, label: new Date(parseDate(day)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }) });
        });
        return list;
    }, [days]);

    const contentWidth = totalDays * px;
    const bodyHeight = Math.max(rows.length * ROW_HEIGHT + 40, 200);

    // ------------------------------------------------------- interaksi drag
    const beginDrag = (event, task, mode) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedId(task.id);

        if (mode === 'link') {
            let over = null;
            const onMove = (moveEvent) => {
                const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
                const bar = element?.closest?.('[data-task-id]');
                over = bar?.getAttribute('data-task-id') || null;
                setPreview({ mode: 'link', taskId: task.id, over });
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                setPreview(null);
                if (over && over !== task.id) addDependency(over, task.id, 'FS', 0);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            return;
        }

        const geometry = barGeometry(task, rangeStart, px);
        const state0 = { mode, taskId: task.id, startX: event.clientX, task, geometry, delta: 0, lastX: event.clientX };
        dragRef.current = state0;

        const onMove = (moveEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            drag.lastX = moveEvent.clientX;
            drag.delta = Math.round((moveEvent.clientX - drag.startX) / px);
            setPreview({ mode: drag.mode, taskId: task.id, delta: drag.delta, task: drag.task, geometry: drag.geometry, lastX: moveEvent.clientX });
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            const drag = dragRef.current;
            dragRef.current = null;
            setPreview(null);
            if (!drag) return;

            if (drag.mode === 'progress') {
                const width = Math.max(1, drag.geometry.width);
                const offset = drag.lastX - drag.startX;
                setProgress(drag.task.id, (offset / width) * 100);
                return;
            }

            if (drag.delta === 0) return;

            if (drag.mode === 'move') {
                let target = addDays(drag.task.begin_date, drag.delta).toISOString().slice(0, 10);
                if (!calendar.isWorkingDay(target)) target = calendar.nextWorkingDay(target);
                moveTask(drag.task.id, target);
            } else if (drag.mode === 'resize') {
                let target = addDays(drag.task.end_date, drag.delta).toISOString().slice(0, 10);
                if (diffDays(drag.task.begin_date, target) < 0) return;
                if (drag.delta > 0 && !calendar.isWorkingDay(target)) target = calendar.nextWorkingDay(target);
                resizeTask(drag.task.id, target);
            }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const showTooltip = (event, task) => {
        const box = event.currentTarget.getBoundingClientRect();
        const scroller = event.currentTarget.closest('.overflow-auto');
        const scrollerBox = scroller?.getBoundingClientRect();
        const resources = (task.resource_ids || [])
            .map((id) => state.resources.find((resource) => resource.id === id)?.name)
            .filter(Boolean);
        setTooltip({
            x: (scrollerBox ? box.left - scrollerBox.left + (scroller.scrollLeft || 0) : box.left) + box.width / 2,
            y: (scrollerBox ? box.top - scrollerBox.top + (scroller.scrollTop || 0) : box.top) - 8,
            task,
            resources,
        });
    };

    return (
        <div
            data-scroll-root
            className="relative"
            style={{ width: Math.max(contentWidth, 700), minWidth: '100%' }}
        >
            {/* ---------------------------------------------------- skala tanggal */}
            <div
                className="sticky top-0 z-30 border-b border-slate-300 bg-slate-100"
                style={{ height: 48 }}
            >
                <div className="flex" style={{ height: MONTH_LABEL_HEIGHT }}>
                    {months.map((month) => (
                        <div
                            key={month.key}
                            className="overflow-hidden whitespace-nowrap border-r border-slate-300 px-1 text-[11px] leading-5 text-slate-600"
                            style={{ width: month.span * px }}
                        >
                            {month.label}
                        </div>
                    ))}
                </div>
                <div className="flex" style={{ height: 48 - MONTH_LABEL_HEIGHT }}>
                    {days.map((day) => {
                        const working = calendar.isWorkingDay(day);
                        const isToday = day === today();
                        const date = parseDate(day);
                        return (
                            <div
                                key={day}
                                className={`border-r text-center text-[10px] leading-6 ${
                                    working ? 'border-slate-200 text-slate-500' : 'bg-slate-300/70 text-slate-600'
                                } ${isToday ? 'bg-blue-100 font-semibold text-blue-700' : ''}`}
                                style={{ width: px }}
                                title={formatDisplayDate(day, settings.date_format)}
                            >
                                {px >= 14 ? `${date.getUTCDate()}` : px >= 9 ? date.getUTCDate() : ''}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --------------------------------------------------------- badan */}
            <div className="relative" style={{ height: bodyHeight }}>
                {/* kolom weekend / hari libur */}
                {days.map((day) => {
                    if (calendar.isWorkingDay(day)) return null;
                    const index = diffDays(rangeStart, day);
                    return (
                        <div
                            key={`bg-${day}`}
                            className="absolute top-0 bottom-0 bg-slate-200/60"
                            style={{ left: index * px, width: px }}
                        />
                    );
                })}

                {/* garis baris agar sejajar dengan Task List */}
                {rows.map((row, index) => (
                    <div
                        key={`line-${row.id}`}
                        className={`absolute left-0 right-0 border-b border-slate-100 ${selectedId === row.id ? 'bg-blue-50/60' : ''}`}
                        style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                    />
                ))}

                {/* panah dependensi */}
                <svg className="pointer-events-none absolute inset-0 z-10" width={contentWidth} height={bodyHeight}>
                    <defs>
                        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                            <path d="M0,0 L7,3 L0,6 Z" fill="#64748b" />
                        </marker>
                        <marker id="arrow-critical" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                            <path d="M0,0 L7,3 L0,6 Z" fill="#dc2626" />
                        </marker>
                    </defs>
                    {state.dependencies.map((dep) => {
                        const fromIndex = rowIndex[dep.predecessor_id];
                        const toIndex = rowIndex[dep.task_id];
                        if (fromIndex === undefined || toIndex === undefined) return null;
                        const from = view.tasks.find((task) => task.id === dep.predecessor_id);
                        const to = view.tasks.find((task) => task.id === dep.task_id);
                        if (!from || !to) return null;

                        const fromGeom = barGeometry(from, rangeStart, px);
                        const toGeom = barGeometry(to, rangeStart, px);
                        const x1 = fromGeom.x + fromGeom.width;
                        const y1 = fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                        const x2 = toGeom.x;
                        const y2 = toIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                        const critical = showCritical && from.critical && to.critical;
                        const midX = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 12));
                        const d = x2 >= x1
                            ? `M ${x1} ${y1} H ${midX} V ${y2} H ${x2 - 4}`
                            : `M ${x1} ${y1} H ${x1 + 10} V ${(y1 + y2) / 2} H ${x2 - 14} V ${y2} H ${x2 - 4}`;
                        return (
                            <path
                                key={dep.id}
                                d={d}
                                fill="none"
                                stroke={critical ? '#dc2626' : '#64748b'}
                                strokeWidth={1.2}
                                strokeDasharray={dep.type === 'SS' ? '4 3' : undefined}
                                markerEnd={`url(#${critical ? 'arrow-critical' : 'arrow'})`}
                            />
                        );
                    })}
                </svg>

                {/* batang kegiatan */}
                {rows.map((row, index) => {
                    const task = view.tasks.find((item) => item.id === row.id) || row.task;
                    const geom = barGeometry(task, rangeStart, px);
                    const top = index * ROW_HEIGHT;
                    const isSelected = selectedId === row.id;
                    const critical = showCritical && task.critical;
                    const beingEdited = editingTaskIds.includes(row.id);
                    const hidden = task.show_in_timeline === false;

                    const drag = preview && preview.taskId === row.id ? preview : null;
                    let x = geom.x;
                    let width = geom.width;
                    if (drag && drag.mode === 'move') x = geom.x + drag.delta * px;
                    if (drag && drag.mode === 'resize') width = Math.max(px * 0.6, geom.width + drag.delta * px);

                    return (
                        <div
                            key={row.id}
                            data-task-id={row.id}
                            className="absolute z-20"
                            style={{ top, height: ROW_HEIGHT, left: 0, right: 0 }}
                            onContextMenu={(event) => openContextMenu(event, { type: 'task', id: row.id })}
                        >
                            {task.milestone ? (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    data-bar-id={row.id}
                                    onPointerDown={(event) => beginDrag(event, task, 'move')}
                                    onDoubleClick={() => openTaskDialog(row.id)}
                                    onMouseEnter={(event) => showTooltip(event, task)}
                                    onMouseLeave={() => setTooltip(null)}
                                    title={task.name}
                                    className="absolute cursor-grab"
                                    style={{
                                        left: x + geom.width / 2 - 7,
                                        top: ROW_HEIGHT / 2 - 7,
                                        width: 14,
                                        height: 14,
                                        transform: 'rotate(45deg)',
                                        background: critical ? '#dc2626' : (task.color || settings.bar_color),
                                        border: '1px solid #0f172a',
                                    }}
                                />
                            ) : row.isSummary ? (
                                <div
                                    data-bar-id={row.id}
                                    onPointerDown={(event) => beginDrag(event, task, 'move')}
                                    onDoubleClick={() => openTaskDialog(row.id)}
                                    onMouseEnter={(event) => showTooltip(event, task)}
                                    onMouseLeave={() => setTooltip(null)}
                                    className={`absolute cursor-grab ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                                    style={{ left: x, width, top: ROW_HEIGHT / 2 - 3 }}
                                >
                                    <div className="h-[6px] rounded-sm" style={{ background: critical ? '#dc2626' : '#475569' }} />
                                    <div className="absolute -top-1.5 left-0 h-3 w-[3px]" style={{ background: critical ? '#dc2626' : '#475569' }} />
                                    <div className="absolute -top-1.5 right-0 h-3 w-[3px]" style={{ background: critical ? '#dc2626' : '#475569' }} />
                                </div>
                            ) : (
                                <div
                                    data-bar-id={row.id}
                                    onPointerDown={(event) => beginDrag(event, task, 'move')}
                                    onDoubleClick={() => openTaskDialog(row.id)}
                                    onMouseEnter={(event) => showTooltip(event, task)}
                                    onMouseLeave={() => setTooltip(null)}
                                    className={`group absolute cursor-grab overflow-visible rounded-sm ${
                                        isSelected ? 'ring-2 ring-blue-500' : ''
                                    } ${beingEdited ? 'outline outline-2 outline-amber-400' : ''}`}
                                    style={{
                                        left: x,
                                        width,
                                        top: ROW_HEIGHT / 2 - 8,
                                        height: 16,
                                        background: hidden ? '#cbd5e1' : (critical ? '#dc2626' : (task.color || settings.bar_color)),
                                        opacity: hidden ? 0.6 : 1,
                                        border: '1px solid rgba(15,23,42,.35)',
                                    }}
                                >
                                    {/* progres */}
                                    <div
                                        className="absolute inset-y-0 left-0 bg-slate-900/35"
                                        style={{ width: `${task.progress}%` }}
                                    />
                                    {task.progress < 100 && (
                                        <div
                                            onPointerDown={(event) => beginDrag(event, task, 'progress')}
                                            className="absolute inset-y-0 w-2 cursor-ew-resize"
                                            style={{ left: `calc(${task.progress}% - 4px)` }}
                                            title="Geser untuk mengubah progress"
                                        />
                                    )}
                                    {/* tepi untuk mengubah durasi */}
                                    <div
                                        onPointerDown={(event) => beginDrag(event, task, 'resize')}
                                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/50"
                                    />
                                    {/* penanda buat dependensi */}
                                    <div
                                        onPointerDown={(event) => beginDrag(event, task, 'link')}
                                        className="absolute -right-1.5 top-1/2 hidden h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border border-slate-700 bg-white group-hover:block"
                                        title="Tarik ke kegiatan lain untuk membuat dependensi"
                                    />
                                    {width > 44 && (
                                        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 truncate text-[11px] leading-none text-white drop-shadow">
                                            {task.name}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* penanda garis kritis lain opsional dihilangkan agar ringan */}

                {tooltip && (
                    <div
                        className="pointer-events-none absolute z-40 w-64 rounded border border-slate-300 bg-white p-2 text-xs shadow-lg"
                        style={{ left: Math.max(4, tooltip.x - 128), top: Math.max(4, tooltip.y - 96) }}
                    >
                        <div className="font-semibold text-slate-800">{tooltip.task.name}</div>
                        <div className="mt-1 text-slate-600">
                            Mulai: {formatDisplayDate(tooltip.task.begin_date, settings.date_format)}<br />
                            Selesai: {formatDisplayDate(tooltip.task.end_date, settings.date_format)}<br />
                            Durasi: {tooltip.task.duration} hari kerja · Progress: {tooltip.task.progress}%<br />
                            Penanggung jawab: {tooltip.resources.length ? tooltip.resources.join(', ') : '—'}
                            {tooltip.task.critical && <><br /><span className="font-medium text-red-600">Jalur kritis</span></>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
