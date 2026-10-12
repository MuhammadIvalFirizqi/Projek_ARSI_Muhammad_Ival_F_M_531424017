import { useMemo, useState } from 'react';
import { addDays, diffDays, formatDisplayDate } from '../lib/dates';
import { ROW_HEIGHT } from '../lib/gantt';

/**
 * Resources Chart (FR-23): daftar anggota tim + beban kerja pada timeline.
 * Penugasan pada hari cuti ditandai sebagai bentrok (PRD bagian 8).
 */
export default function ResourcesChart({
    state, view, mode = 'list', px = 16, rangeStart, totalDays = 60,
    openResourcesDialog, settings, showCritical,
}) {
    const [selected, setSelected] = useState(null);
    const resources = state.resources;

    // Pengaman: chart tidak boleh gagal render hanya karena prop opsi belum terkirim.
    const opts = {
        date_format: settings?.date_format || 'DD MMM YYYY',
        bar_color: settings?.bar_color || '#3b82f6',
    };

    const days = useMemo(() => {
        if (mode !== 'timeline') return [];
        const list = [];
        let cursor = rangeStart;
        for (let i = 0; i < totalDays; i++) {
            list.push(cursor);
            cursor = addDays(cursor, 1).toISOString().slice(0, 10);
        }
        return list;
    }, [mode, rangeStart, totalDays]);

    const isWeekendOrHoliday = (day) => {
        const date = new Date(`${day}T00:00:00Z`);
        const weekday = date.getUTCDay();
        const weekend = (state.calendar?.weekend_days || [0, 6]).includes(weekday);
        const holidays = state.calendar?.holidays || [];
        const holiday = (state.calendar?.holiday_mode === 'custom')
            && holidays.some((item) => (item.type === 'recurring'
                ? item.date.slice(5) === day.slice(5)
                : item.date === day));
        return holiday || (weekend && !state.calendar?.weekends_work);
    };

    const inRange = (dayOff, day) => day >= dayOff.start_date && day <= dayOff.end_date;

    if (mode !== 'timeline') {
        return (
            <div className="min-w-full">
                <div className="sticky top-0 z-10 flex border-b border-slate-300 bg-slate-100 text-xs font-semibold text-slate-600">
                    <div className="flex-1 px-3 py-2">Name</div>
                    <div className="w-[130px] px-2 py-2">Default role</div>
                </div>

                <div className="pb-6">
                    <button
                        type="button"
                        className="m-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                        onClick={() => openResourcesDialog(null)}
                    >
                        + Resource baru
                    </button>

                    {resources.length === 0 && (
                        <div className="px-3 py-4 text-sm text-slate-400">
                            Belum ada anggota tim. Tambahkan resource lalu tugaskan ke kegiatan.
                        </div>
                    )}

                    {resources.map((resource) => {
                        const assigned = view.tasks.filter((task) => (task.resource_ids || []).includes(resource.id));
                        const conflicts = assigned.filter((task) => resource.days_off.some(
                            (dayOff) => dayOff.start_date <= task.end_date && dayOff.end_date >= task.begin_date,
                        ));
                        return (
                            <div
                                key={resource.id}
                                onClick={() => setSelected(resource.id)}
                                onDoubleClick={() => openResourcesDialog(resource.id)}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    openResourcesDialog(resource.id);
                                }}
                                className={`flex h-[30px] cursor-pointer items-center border-b border-slate-100 text-sm ${
                                    selected === resource.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                                }`}
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: resource.color || opts.bar_color }} />
                                    <span className="truncate">{resource.name}</span>
                                    <span className="text-xs text-slate-400">{assigned.length} kegiatan</span>
                                    {conflicts.length > 0 && (
                                        <span className="rounded bg-red-100 px-1 text-[10px] text-red-700" title="Ada penugasan pada hari cuti">
                                            ⚠ bentrok
                                        </span>
                                    )}
                                </div>
                                <div className="w-[130px] truncate px-2 text-slate-500">{resource.default_role || '—'}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    const width = totalDays * px;

    return (
        <div className="relative" style={{ width, minWidth: '100%' }}>
            <div className="sticky top-0 z-30 flex border-b border-slate-300 bg-slate-100" style={{ height: 48 }}>
                {days.map((day) => (
                    <div
                        key={day}
                        className={`border-r text-center text-[10px] leading-[46px] ${
                            isWeekendOrHoliday(day) ? 'bg-slate-300/70 text-slate-600' : 'border-slate-200 text-slate-500'
                        }`}
                        style={{ width: px }}
                    >
                        {px >= 14 ? new Date(`${day}T00:00:00Z`).getUTCDate() : ''}
                    </div>
                ))}
            </div>

            <div className="relative" style={{ height: Math.max(resources.length * ROW_HEIGHT + 40, 200) }}>
                {days.map((day, index) => (
                    isWeekendOrHoliday(day) ? (
                        <div key={day} className="absolute top-0 bottom-0 bg-slate-200/60" style={{ left: index * px, width: px }} />
                    ) : null
                ))}

                {resources.map((resource, rowIndex) => {
                    const top = rowIndex * ROW_HEIGHT;
                    const assigned = view.tasks.filter((task) => (task.resource_ids || []).includes(resource.id));

                    return (
                        <div key={resource.id} className="absolute left-0 right-0 border-b border-slate-100" style={{ top, height: ROW_HEIGHT }}>
                            {resource.days_off.map((dayOff, index) => {
                                const from = diffDays(rangeStart, dayOff.start_date);
                                const to = diffDays(rangeStart, dayOff.end_date);
                                if (to < 0 || from > totalDays) return null;
                                return (
                                    <div
                                        key={index}
                                        className="absolute inset-y-0 bg-amber-200/70"
                                        style={{ left: Math.max(0, from) * px, width: (Math.min(totalDays, to + 1) - Math.max(0, from)) * px }}
                                        title={`Cuti: ${formatDisplayDate(dayOff.start_date, opts.date_format)} – ${formatDisplayDate(dayOff.end_date, opts.date_format)}`}
                                    />
                                );
                            })}

                            {assigned.map((task) => {
                                const from = diffDays(rangeStart, task.begin_date);
                                const to = diffDays(rangeStart, task.end_date);
                                if (to < 0 || from > totalDays) return null;
                                const conflict = resource.days_off.some(
                                    (dayOff) => dayOff.start_date <= task.end_date && dayOff.end_date >= task.begin_date,
                                );
                                const left = Math.max(0, from) * px;
                                const right = Math.min(totalDays, to + 1) * px;
                                return (
                                    <div
                                        key={task.id}
                                        className="absolute flex items-center overflow-hidden rounded-sm px-1 text-[10px] leading-none text-white"
                                        style={{
                                            left,
                                            width: Math.max(6, right - left),
                                            top: ROW_HEIGHT / 2 - 7,
                                            height: 14,
                                            background: conflict ? '#dc2626' : (task.color || opts.bar_color),
                                            border: conflict ? '1px solid #7f1d1d' : '1px solid rgba(15,23,42,.35)',
                                        }}
                                        title={`${resource.name} mengerjakan ${task.name}${conflict ? ' — BENTROK dengan hari cuti' : ''}`}
                                    >
                                        {(right - left) > 40 ? task.name : conflict ? '⚠' : ''}
                                    </div>
                                );
                            })}

                            {showCritical && assigned.some((task) => task.critical) && (
                                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-red-600">kritis</span>
                            )}
                        </div>
                    );
                })}

                {resources.length === 0 && (
                    <div className="p-6 text-sm text-slate-400">Belum ada resource.</div>
                )}
            </div>
        </div>
    );
}
