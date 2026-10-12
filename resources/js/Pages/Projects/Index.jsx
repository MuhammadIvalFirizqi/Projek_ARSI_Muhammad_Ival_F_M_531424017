import { router } from '@inertiajs/react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { DAY_NAMES, formatDisplayDate, today, uid } from '../../lib/dates';

const EMPTY_FORM = {
    name: '',
    organization: '',
    web_url: '',
    description: '',
    start_date: today(),
    use_template: true,
    weekend_days: [0, 6],
    weekends_work: false,
    holiday_mode: 'none',
    holidays: [],
};

export default function Index({ projects = [] }) {
    const [wizardOpen, setWizardOpen] = useState(false);
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(EMPTY_FORM);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const update = (patch) => setForm((current) => ({ ...current, ...patch }));

    const toggleWeekend = (day) => {
        const days = form.weekend_days.includes(day)
            ? form.weekend_days.filter((value) => value !== day)
            : [...form.weekend_days, day];
        update({ weekend_days: days.sort() });
    };

    const addHoliday = () => update({
        holidays: [...form.holidays, { id: uid(), name: '', date: form.start_date, type: 'one-off' }],
    });

    const setHoliday = (index, patch) => update({
        holidays: form.holidays.map((holiday, i) => (i === index ? { ...holiday, ...patch } : holiday)),
    });

    const removeHoliday = (index) => update({ holidays: form.holidays.filter((_, i) => i !== index) });

    const submit = async () => {
        setSaving(true);
        setError(null);
        try {
            const payload = await api.post('/api/projects', {
                ...form,
                holidays: form.holiday_mode === 'custom' ? form.holidays : [],
            });
            router.visit(`/projects/${payload.id}`);
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    const removeProject = async (project) => {
        if (!window.confirm(`Hapus proyek "${project.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
        try {
            await api.delete(`/api/projects/${project.id}`);
            router.reload({ only: ['projects'] });
        } catch (err) {
            window.alert(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800">
            <header className="border-b border-slate-300 bg-white px-8 py-5">
                <h1 className="text-xl font-semibold">Aplikasi Manajemen Proyek Sistem Informasi</h1>
                <p className="text-sm text-slate-500">
                    Gantt chart interaktif dan real-time · tanpa login · data tersimpan di server
                </p>
            </header>

            <main className="mx-auto max-w-5xl px-8 py-8">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-lg font-medium">Daftar proyek</h2>
                    <button
                        type="button"
                        onClick={() => { setForm(EMPTY_FORM); setStep(1); setWizardOpen(true); }}
                        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        + Proyek Baru (Ctrl+N)
                    </button>
                </div>

                {projects.length === 0 ? (
                    <div className="rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                        Belum ada proyek tersimpan. Klik <span className="font-medium text-slate-700">Proyek Baru</span>{' '}
                        untuk membuat jadwal pertama Anda.
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {projects.map((project) => (
                            <li
                                key={project.id}
                                className="flex items-center justify-between rounded border border-slate-300 bg-white px-5 py-4 shadow-sm"
                            >
                                <div>
                                    <div className="font-medium">{project.name}</div>
                                    <div className="text-sm text-slate-500">
                                        {project.organization || 'Tanpa organisasi'} · revisi {project.revision} ·
                                        diubah {formatDisplayDate(project.updated_at, 'DD MMM YYYY')}
                                    </div>
                                    {project.description && (
                                        <div className="mt-1 max-w-2xl text-sm text-slate-500">{project.description}</div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => router.visit(`/projects/${project.id}`)}
                                        className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
                                    >
                                        Buka
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeProject(project)}
                                        className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                                    >
                                        Hapus
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </main>

            {wizardOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
                    <div className="w-full max-w-2xl rounded bg-white shadow-xl">
                        <div className="border-b border-slate-200 px-6 py-4">
                            <div className="text-sm uppercase tracking-wide text-slate-400">
                                Langkah {step} dari 2
                            </div>
                            <h3 className="text-lg font-semibold">
                                {step === 1 ? 'Data proyek' : 'Pengaturan kalender kerja'}
                            </h3>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                            {error && (
                                <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {error}
                                </div>
                            )}

                            {step === 1 ? (
                                <div className="space-y-4">
                                    <Field label="Nama proyek" required>
                                        <input
                                            className={inputClass}
                                            value={form.name}
                                            onChange={(event) => update({ name: event.target.value })}
                                            placeholder="mis. Sistem Informasi PT XYZ"
                                        />
                                    </Field>
                                    <Field label="Nama organisasi">
                                        <input
                                            className={inputClass}
                                            value={form.organization}
                                            onChange={(event) => update({ organization: event.target.value })}
                                        />
                                    </Field>
                                    <Field label="Alamat web">
                                        <input
                                            className={inputClass}
                                            value={form.web_url}
                                            onChange={(event) => update({ web_url: event.target.value })}
                                            placeholder="https://"
                                        />
                                    </Field>
                                    <Field label="Deskripsi pembangunan perangkat lunak">
                                        <textarea
                                            className={inputClass + ' h-24 resize-none'}
                                            value={form.description}
                                            onChange={(event) => update({ description: event.target.value })}
                                        />
                                    </Field>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="Tanggal mulai proyek">
                                            <input
                                                type="date"
                                                className={inputClass}
                                                value={form.start_date}
                                                onChange={(event) => update({ start_date: event.target.value })}
                                            />
                                        </Field>
                                        <Field label="Template tahapan">
                                            <label className="flex h-10 items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={form.use_template}
                                                    onChange={(event) => update({ use_template: event.target.checked })}
                                                />
                                                Muat enam tahap standar (PRA, Analisis, Desain, Implementasi, Uji, Deploy)
                                            </label>
                                        </Field>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div>
                                        <div className="mb-2 font-medium">Choose weekend</div>
                                        <div className="flex flex-wrap gap-3">
                                            {DAY_NAMES.map((day, index) => (
                                                <label key={day} className="flex items-center gap-2 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.weekend_days.includes(index)}
                                                        onChange={() => toggleWeekend(index)}
                                                    />
                                                    {day}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="mb-2 font-medium">On weekends</div>
                                        <div className="space-y-1 text-sm">
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    checked={!form.weekends_work}
                                                    onChange={() => update({ weekends_work: false })}
                                                />
                                                No task can run
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    checked={form.weekends_work}
                                                    onChange={() => update({ weekends_work: true })}
                                                />
                                                All tasks run as on other days
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="mb-2 font-medium">Holiday calendar</div>
                                        <div className="mb-3 space-y-1 text-sm">
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    checked={form.holiday_mode === 'none'}
                                                    onChange={() => update({ holiday_mode: 'none' })}
                                                />
                                                None
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    checked={form.holiday_mode === 'custom'}
                                                    onChange={() => update({ holiday_mode: 'custom' })}
                                                />
                                                Custom
                                            </label>
                                        </div>

                                        {form.holiday_mode === 'custom' && (
                                            <div className="rounded border border-slate-200">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 text-left text-slate-500">
                                                        <tr>
                                                            <th className="px-3 py-2 font-medium">Nama</th>
                                                            <th className="px-3 py-2 font-medium">Tanggal</th>
                                                            <th className="px-3 py-2 font-medium">Tipe</th>
                                                            <th className="px-3 py-2" />
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {form.holidays.map((holiday, index) => (
                                                            <tr key={holiday.id} className="border-t border-slate-100">
                                                                <td className="px-2 py-1">
                                                                    <input
                                                                        className={inputClass}
                                                                        value={holiday.name}
                                                                        placeholder="Hari libur"
                                                                        onChange={(event) => setHoliday(index, { name: event.target.value })}
                                                                    />
                                                                </td>
                                                                <td className="px-2 py-1">
                                                                    <input
                                                                        type="date"
                                                                        className={inputClass}
                                                                        value={holiday.date}
                                                                        onChange={(event) => setHoliday(index, { date: event.target.value })}
                                                                    />
                                                                </td>
                                                                <td className="px-2 py-1">
                                                                    <select
                                                                        className={inputClass}
                                                                        value={holiday.type}
                                                                        onChange={(event) => setHoliday(index, { type: event.target.value })}
                                                                    >
                                                                        <option value="one-off">One-off</option>
                                                                        <option value="recurring">Recurring</option>
                                                                    </select>
                                                                </td>
                                                                <td className="px-2 py-1 text-right">
                                                                    <button
                                                                        type="button"
                                                                        className="text-red-600 hover:underline"
                                                                        onClick={() => removeHoliday(index)}
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {form.holidays.length === 0 && (
                                                            <tr>
                                                                <td colSpan={4} className="px-3 py-3 text-slate-400">
                                                                    Belum ada hari libur.
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                                <div className="border-t border-slate-200 px-3 py-2">
                                                    <button
                                                        type="button"
                                                        className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                                                        onClick={addHoliday}
                                                    >
                                                        + Add
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
                            <button
                                type="button"
                                className="rounded px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
                                onClick={() => (step === 1 ? setWizardOpen(false) : setStep(1))}
                            >
                                {step === 1 ? 'Batal' : 'Kembali'}
                            </button>
                            <div className="flex gap-2">
                                {step === 1 ? (
                                    <button
                                        type="button"
                                        disabled={!form.name.trim()}
                                        onClick={() => setStep(2)}
                                        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                                    >
                                        Selanjutnya
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={submit}
                                        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                                    >
                                        {saving ? 'Menyimpan…' : 'Selesai & Simpan'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const inputClass = 'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

function Field({ label, children, required }) {
    return (
        <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">
                {label} {required && <span className="text-red-500">*</span>}
            </span>
            {children}
        </label>
    );
}
