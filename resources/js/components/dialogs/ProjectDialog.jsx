import { useState } from 'react';
import { DAY_NAMES, uid } from '../../lib/dates';

/**
 * Dialog properti proyek (FR-06) sekaligus pengaturan kalender kerja
 * (FR-11..FR-15): weekend, aturan weekend, dan hari libur.
 */
export default function ProjectDialog({ state, onClose, patchProject, patchCalendar }) {
    const [tab, setTab] = useState('general');
    const [form, setForm] = useState({
        name: state.project.name || '',
        organization: state.project.organization || '',
        web_url: state.project.web_url || '',
        description: state.project.description || '',
        start_date: state.project.start_date || '',
        date_format: state.project.date_format || 'DD MMM YYYY',
    });
    const [calendar, setCalendar] = useState({
        weekend_days: [...(state.calendar.weekend_days || [0, 6])],
        weekends_work: !!state.calendar.weekends_work,
        holiday_mode: state.calendar.holiday_mode || 'none',
        holidays: (state.calendar.holidays || []).map((holiday) => ({ ...holiday, id: holiday.id || uid() })),
    });

    const update = (patch) => setForm((current) => ({ ...current, ...patch }));
    const updateCalendar = (patch) => setCalendar((current) => ({ ...current, ...patch }));

    const toggleWeekend = (day) => updateCalendar({
        weekend_days: calendar.weekend_days.includes(day)
            ? calendar.weekend_days.filter((value) => value !== day)
            : [...calendar.weekend_days, day].sort((a, b) => a - b),
    });

    const submit = () => {
        const projectPatch = {};
        ['name', 'organization', 'web_url', 'description', 'start_date', 'date_format'].forEach((key) => {
            const value = (form[key] || '').trim ? form[key] : form[key];
            if (value !== state.project[key]) projectPatch[key] = form[key];
        });
        if (Object.keys(projectPatch).length) patchProject(projectPatch);

        const calendarPatch = {};
        if (JSON.stringify(calendar.weekend_days) !== JSON.stringify(state.calendar.weekend_days)) {
            calendarPatch.weekend_days = calendar.weekend_days;
        }
        if (calendar.weekends_work !== !!state.calendar.weekends_work) calendarPatch.weekends_work = calendar.weekends_work;
        if (calendar.holiday_mode !== state.calendar.holiday_mode) calendarPatch.holiday_mode = calendar.holiday_mode;
        const normalise = (list) => JSON.stringify(
            list.map((item) => ({ name: item.name || '', date: item.date, type: item.type || 'one-off' }))
                .sort((a, b) => String(a.date).localeCompare(String(b.date))),
        );
        if (normalise(calendar.holidays) !== normalise(state.calendar.holidays || [])) {
            calendarPatch.holidays = calendar.holidays.map((item) => ({
                name: item.name || 'Hari libur',
                date: item.date,
                type: item.type || 'one-off',
            }));
        }
        if (Object.keys(calendarPatch).length) patchCalendar(calendarPatch);

        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onMouseDown={onClose}>
            <div className="w-full max-w-2xl rounded bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                    <h3 className="font-semibold">Project properties</h3>
                    <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
                </div>

                <div className="flex border-b border-slate-200 px-5 pt-2">
                    {[['general', 'General'], ['calendar', 'Kalender kerja']].map(([id, label]) => (
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

                <div className="max-h-[60vh] overflow-y-auto px-5 py-4 text-sm">
                    {tab === 'general' ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Nama proyek" className="col-span-2">
                                <input className={input} value={form.name} onChange={(e) => update({ name: e.target.value })} />
                            </Field>
                            <Field label="Organisasi">
                                <input className={input} value={form.organization} onChange={(e) => update({ organization: e.target.value })} />
                            </Field>
                            <Field label="Alamat web">
                                <input className={input} value={form.web_url} onChange={(e) => update({ web_url: e.target.value })} />
                            </Field>
                            <Field label="Deskripsi" className="col-span-2">
                                <textarea className={input + ' h-24 resize-none'} value={form.description} onChange={(e) => update({ description: e.target.value })} />
                            </Field>
                            <Field label="Tanggal mulai">
                                <input type="date" className={input} value={form.start_date} onChange={(e) => update({ start_date: e.target.value })} />
                            </Field>
                            <Field label="Format tanggal">
                                <select className={input} value={form.date_format} onChange={(e) => update({ date_format: e.target.value })}>
                                    <option value="DD MMM YYYY">31 Jan 2026 (DD MMM YYYY)</option>
                                    <option value="YYYY-MM-DD">2026-01-31 (YYYY-MM-DD)</option>
                                    <option value="DD/MM/YYYY">31/01/2026 (DD/MM/YYYY)</option>
                                    <option value="MMMM DD, YYYY">January 31, 2026</option>
                                    <option value="DDDD, DD MMM YYYY">Sen, 31 Jan 2026</option>
                                </select>
                            </Field>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div>
                                <div className="mb-2 font-medium">Choose weekend</div>
                                <div className="flex flex-wrap gap-4">
                                    {DAY_NAMES.map((day, index) => (
                                        <label key={day} className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={calendar.weekend_days.includes(index)}
                                                onChange={() => toggleWeekend(index)}
                                            />
                                            {day}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="mb-2 font-medium">On weekends</div>
                                <label className="mr-4 flex items-center gap-2">
                                    <input
                                        type="radio"
                                        checked={!calendar.weekends_work}
                                        onChange={() => updateCalendar({ weekends_work: false })}
                                    />
                                    No task can run
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        checked={calendar.weekends_work}
                                        onChange={() => updateCalendar({ weekends_work: true })}
                                    />
                                    All tasks run as on other days
                                </label>
                            </div>

                            <div>
                                <div className="mb-2 font-medium">Holiday calendar</div>
                                <label className="mr-4 flex items-center gap-2">
                                    <input
                                        type="radio"
                                        checked={calendar.holiday_mode === 'none'}
                                        onChange={() => updateCalendar({ holiday_mode: 'none' })}
                                    />
                                    None
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        checked={calendar.holiday_mode === 'custom'}
                                        onChange={() => updateCalendar({ holiday_mode: 'custom' })}
                                    />
                                    Custom
                                </label>

                                {calendar.holiday_mode === 'custom' && (
                                    <div className="mt-3 rounded border border-slate-200">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-left text-xs text-slate-500">
                                                <tr>
                                                    <th className="px-3 py-2">Nama</th>
                                                    <th className="px-3 py-2">Tanggal</th>
                                                    <th className="px-3 py-2">Tipe</th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {calendar.holidays.map((holiday, index) => (
                                                    <tr key={holiday.id || index} className="border-t border-slate-100">
                                                        <td className="px-2 py-1">
                                                            <input
                                                                className={input}
                                                                value={holiday.name || ''}
                                                                onChange={(e) => updateCalendar({
                                                                    holidays: calendar.holidays.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)),
                                                                })}
                                                            />
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <input
                                                                type="date"
                                                                className={input}
                                                                value={holiday.date || ''}
                                                                onChange={(e) => updateCalendar({
                                                                    holidays: calendar.holidays.map((item, i) => (i === index ? { ...item, date: e.target.value } : item)),
                                                                })}
                                                            />
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <select
                                                                className={input}
                                                                value={holiday.type || 'one-off'}
                                                                onChange={(e) => updateCalendar({
                                                                    holidays: calendar.holidays.map((item, i) => (i === index ? { ...item, type: e.target.value } : item)),
                                                                })}
                                                            >
                                                                <option value="one-off">One-off</option>
                                                                <option value="recurring">Recurring</option>
                                                            </select>
                                                        </td>
                                                        <td className="px-2 py-1 text-right">
                                                            <button
                                                                type="button"
                                                                className="text-red-600 hover:underline"
                                                                onClick={() => updateCalendar({ holidays: calendar.holidays.filter((_, i) => i !== index) })}
                                                            >
                                                                Delete
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {calendar.holidays.length === 0 && (
                                                    <tr><td colSpan={4} className="px-3 py-3 text-slate-400">Belum ada hari libur.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                        <div className="border-t border-slate-200 px-3 py-2">
                                            <button
                                                type="button"
                                                className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                                                onClick={() => updateCalendar({
                                                    holidays: [...calendar.holidays, { id: uid(), name: '', date: state.project.start_date || '', type: 'one-off' }],
                                                })}
                                            >
                                                + Add
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded bg-slate-50 p-3 text-xs text-slate-500">
                                Perubahan kalender langsung menjalankan ulang mesin penjadwalan: seluruh tanggal selesai
                                kegiatan dihitung kembali sesuai weekend dan hari libur.
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
                    <button type="button" className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
                    <button type="button" className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white" onClick={submit}>Ok</button>
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
