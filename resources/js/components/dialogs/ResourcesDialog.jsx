import { useEffect, useState } from 'react';
import { uid } from '../../lib/dates';

/**
 * Dialog "Resources": tab General (Name, Phone, Mail, Default role, Standard rate),
 * Days off, Custom Columns (FR-35..FR-39).
 */
export default function ResourcesDialog({
    state, view, resourceId, onClose, onSave, onDelete,
    onCreateColumn, onPatchColumn, onDeleteColumn,
}) {
    const existing = state.resources.find((item) => item.id === resourceId);
    const [tab, setTab] = useState('general');
    const [form, setForm] = useState(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState({ name: '', type: 'text' });
    const [editingId, setEditingId] = useState(null);
    const [editDraft, setEditDraft] = useState({ name: '', type: 'text' });

    useEffect(() => {
        setForm(existing
            ? {
                id: existing.id,
                name: existing.name,
                phone: existing.phone || '',
                email: existing.email || '',
                default_role: existing.default_role || '',
                standard_rate: existing.standard_rate || 0,
                color: existing.color || '',
                days_off: (existing.days_off || []).map((day) => ({ ...day })),
                custom_values: { ...(existing.custom_values || {}) },
            }
            : {
                id: null,
                name: '',
                phone: '',
                email: '',
                default_role: '',
                standard_rate: 0,
                color: '',
                days_off: [],
                custom_values: {},
            });
        setTab('general');
        setAdding(false);
        setEditingId(null);
        setDraft({ name: '', type: 'text' });
    }, [resourceId]);

    if (!form) return null;

    const update = (patch) => setForm((current) => ({ ...current, ...patch }));

    // Definisi kolom tambahan bersifat proyek (PRD: CustomColumn), nilai per resource.
    const columns = (state.custom_columns || []).filter((column) => column.target === 'resource');

    const valueInput = (column) => {
        const value = (form.custom_values || {})[column.id];
        const setValue = (next) => update({ custom_values: { ...(form.custom_values || {}), [column.id]: next } });

        if (column.type === 'boolean') {
            return (
                <input
                    type="checkbox"
                    checked={value === true || value === 'true'}
                    onChange={(e) => setValue(e.target.checked)}
                />
            );
        }
        if (column.type === 'number') {
            return (
                <input
                    type="number"
                    className={input}
                    value={value ?? ''}
                    onChange={(e) => setValue(e.target.value === '' ? null : Number(e.target.value))}
                />
            );
        }
        if (column.type === 'date') {
            return (
                <input
                    type="date"
                    className={input}
                    value={value || ''}
                    onChange={(e) => setValue(e.target.value || null)}
                />
            );
        }
        return <input type="text" className={input} value={value ?? ''} onChange={(e) => setValue(e.target.value)} />;
    };

    const saveDraftColumn = () => {
        if (!draft.name.trim()) {
            window.alert('Nama kolom wajib diisi.');
            return;
        }
        onCreateColumn({ name: draft.name.trim(), type: draft.type, target: 'resource' });
        setDraft({ name: '', type: 'text' });
        setAdding(false);
    };

    const saveEditColumn = (column) => {
        if (!editDraft.name.trim()) {
            window.alert('Nama kolom wajib diisi.');
            return;
        }
        onPatchColumn(column.id, { name: editDraft.name.trim(), type: editDraft.type });
        setEditingId(null);
    };

    const removeColumn = (column) => {
        const message = `Hapus kolom "${column.name}" beserta nilainya pada semua resource?`;
        if (!window.confirm(message)) return;
        onDeleteColumn(column.id);
        if (editingId === column.id) setEditingId(null);
    };

    const submit = () => {
        if (!form.name.trim()) {
            window.alert('Nama resource wajib diisi.');
            return;
        }
        onSave({
            ...(form.id ? { id: form.id } : {}),
            name: form.name.trim(),
            phone: form.phone || null,
            email: form.email || null,
            default_role: form.default_role || null,
            standard_rate: Number(form.standard_rate) || 0,
            color: form.color || null,
            days_off: form.days_off.filter((day) => day.start_date),
            custom_values: form.custom_values || {},
        });
        onClose();
    };

    const remove = () => {
        if (!existing) return;
        const assigned = view.tasks.filter((task) => (task.resource_ids || []).includes(existing.id));
        const message = assigned.length
            ? `Resource "${existing.name}" terlibat dalam ${assigned.length} kegiatan. Hapus resource ini?`
            : `Hapus resource "${existing.name}"?`;
        if (!window.confirm(message)) return;
        onDelete(existing.id);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onMouseDown={onClose}>
            <div className="w-full max-w-2xl rounded bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                    <h3 className="font-semibold">Resources</h3>
                    <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
                </div>

                <div className="flex border-b border-slate-200 px-5 pt-2">
                    {[['general', 'General'], ['days', 'Days off'], ['columns', 'Custom Columns']].map(([id, label]) => (
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
                    {tab === 'general' && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Name" required className="col-span-2">
                                <input className={input} value={form.name} onChange={(e) => update({ name: e.target.value })} />
                            </Field>
                            <Field label="Phone">
                                <input className={input} value={form.phone} onChange={(e) => update({ phone: e.target.value })} />
                            </Field>
                            <Field label="Mail">
                                <input className={input} value={form.email} onChange={(e) => update({ email: e.target.value })} />
                            </Field>
                            <Field label="Default role">
                                <select className={input} value={form.default_role} onChange={(e) => update({ default_role: e.target.value })}>
                                    <option value="">— pilih peran —</option>
                                    <option value="analis">Analis</option>
                                    <option value="desainer">Desainer</option>
                                    <option value="programmer">Programmer</option>
                                    <option value="penguji">Penguji</option>
                                    <option value="manajer">Manajer proyek</option>
                                    <option value="lainnya">Lainnya</option>
                                </select>
                            </Field>
                            <Field label="Standard rate (gaji / hari)">
                                <input
                                    type="number"
                                    min={0}
                                    className={input}
                                    value={form.standard_rate}
                                    onChange={(e) => update({ standard_rate: e.target.value })}
                                />
                            </Field>
                            <Field label="Warna" className="col-span-2">
                                <input type="color" className={input + ' h-9 p-1'} value={form.color || '#3b82f6'} onChange={(e) => update({ color: e.target.value })} />
                            </Field>
                        </div>
                    )}

                    {tab === 'days' && (
                        <div>
                            <div className="mb-2 text-slate-500">Cuti atau hari libur pribadi anggota tim (FR-38).</div>
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs text-slate-500">
                                        <th className="py-1">Mulai</th>
                                        <th className="py-1">Selesai</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.days_off.map((day, index) => (
                                        <tr key={index} className="border-t border-slate-100">
                                            <td className="py-1.5">
                                                <input
                                                    type="date"
                                                    className={input}
                                                    value={day.start_date || ''}
                                                    onChange={(e) => update({
                                                        days_off: form.days_off.map((item, i) => (i === index ? { ...item, start_date: e.target.value } : item)),
                                                    })}
                                                />
                                            </td>
                                            <td className="py-1.5">
                                                <input
                                                    type="date"
                                                    className={input}
                                                    value={day.end_date || ''}
                                                    onChange={(e) => update({
                                                        days_off: form.days_off.map((item, i) => (i === index ? { ...item, end_date: e.target.value } : item)),
                                                    })}
                                                />
                                            </td>
                                            <td className="py-1.5 text-right">
                                                <button
                                                    type="button"
                                                    className="text-red-600 hover:underline"
                                                    onClick={() => update({ days_off: form.days_off.filter((_, i) => i !== index) })}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {form.days_off.length === 0 && (
                                        <tr><td colSpan={3} className="py-3 text-slate-400">Belum ada cuti.</td></tr>
                                    )}
                                </tbody>
                            </table>
                            <button
                                type="button"
                                className="mt-3 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                                onClick={() => update({
                                    days_off: [...form.days_off, { id: uid(), start_date: '', end_date: '' }],
                                })}
                            >
                                + Add
                            </button>
                        </div>
                    )}

                    {tab === 'columns' && (
                        <div>
                            <div className="mb-2 text-slate-500">
                                Kolom tambahan buatan pengguna (FR-39). Definisi kolom berlaku untuk semua resource;
                                nilai pada resource ini disimpan saat tombol Ok.
                            </div>
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs text-slate-500">
                                        <th className="py-1">Name</th>
                                        <th className="w-32 py-1">Type</th>
                                        <th className="py-1">Value</th>
                                        <th className="w-32 py-1" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {columns.map((column) => (
                                        editingId === column.id ? (
                                            <tr key={column.id} className="border-t border-slate-100">
                                                <td className="py-1.5">
                                                    <input
                                                        className={input}
                                                        value={editDraft.name}
                                                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                                                    />
                                                </td>
                                                <td className="py-1.5">
                                                    <select
                                                        className={input}
                                                        value={editDraft.type}
                                                        onChange={(e) => setEditDraft({ ...editDraft, type: e.target.value })}
                                                    >
                                                        {TYPE_OPTIONS.map(([id, label]) => (
                                                            <option key={id} value={id}>{label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="py-1.5 text-xs text-slate-400">—</td>
                                                <td className="whitespace-nowrap py-1.5 text-right">
                                                    <button
                                                        type="button"
                                                        className="text-blue-600 hover:underline"
                                                        onClick={() => saveEditColumn(column)}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="ml-2 text-slate-500 hover:underline"
                                                        onClick={() => setEditingId(null)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : (
                                            <tr key={column.id} className="border-t border-slate-100">
                                                <td className="py-1.5">{column.name}</td>
                                                <td className="py-1.5 text-xs text-slate-500">
                                                    {TYPE_OPTIONS.find(([id]) => id === column.type)?.[1] || column.type}
                                                </td>
                                                <td className="py-1.5">{valueInput(column)}</td>
                                                <td className="whitespace-nowrap py-1.5 text-right">
                                                    <button
                                                        type="button"
                                                        className="text-blue-600 hover:underline"
                                                        onClick={() => {
                                                            setEditingId(column.id);
                                                            setEditDraft({ name: column.name, type: column.type });
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="ml-2 text-red-600 hover:underline"
                                                        onClick={() => removeColumn(column)}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    ))}
                                    {columns.length === 0 && !adding && (
                                        <tr>
                                            <td colSpan={4} className="py-3 text-slate-400">
                                                Belum ada kolom. Klik "+ Add column" untuk menambah.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {adding ? (
                                <div className="mt-3 flex items-end gap-2 rounded border border-slate-200 p-3">
                                    <Field label="Name" className="flex-1">
                                        <input
                                            className={input}
                                            autoFocus
                                            placeholder="mis. Tingkat pengalaman"
                                            value={draft.name}
                                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                        />
                                    </Field>
                                    <Field label="Type" className="w-36">
                                        <select
                                            className={input}
                                            value={draft.type}
                                            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                                        >
                                            {TYPE_OPTIONS.map(([id, label]) => (
                                                <option key={id} value={id}>{label}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <button
                                        type="button"
                                        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
                                        onClick={saveDraftColumn}
                                    >
                                        Save
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                                        onClick={() => setAdding(false)}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="mt-3 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                                    onClick={() => setAdding(true)}
                                >
                                    + Add column
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                    <div>
                        {existing && (
                            <button type="button" className="rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={remove}>
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
                        <button type="button" className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white" onClick={submit}>Ok</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const input = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none';

const TYPE_OPTIONS = [
    ['text', 'Text'],
    ['number', 'Number'],
    ['date', 'Date'],
    ['boolean', 'Checkbox'],
];

function Field({ label, children, className = '', required }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1 block text-xs font-medium text-slate-500">
                {label} {required && <span className="text-red-500">*</span>}
            </span>
            {children}
        </label>
    );
}
