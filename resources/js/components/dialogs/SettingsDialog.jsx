import { useState } from 'react';

/** Settings (FR-21): format tanggal, ukuran font, warna batang. */
export default function SettingsDialog({ settings, onClose, onSave }) {
    const [form, setForm] = useState({ ...settings });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onMouseDown={onClose}>
            <div className="w-full max-w-md rounded bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                    <h3 className="font-semibold">Settings</h3>
                    <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
                </div>

                <div className="space-y-4 px-5 py-4 text-sm">
                    <label className="block">
                        <span className="mb-1 block font-medium text-slate-600">Format tanggal</span>
                        <select
                            className={input}
                            value={form.date_format}
                            onChange={(event) => setForm({ ...form, date_format: event.target.value })}
                        >
                            <option value="DD MMM YYYY">31 Jan 2026</option>
                            <option value="YYYY-MM-DD">2026-01-31</option>
                            <option value="DD/MM/YYYY">31/01/2026</option>
                            <option value="MMMM DD, YYYY">January 31, 2026</option>
                            <option value="DDDD, DD MMM YYYY">Sen, 31 Jan 2026</option>
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block font-medium text-slate-600">Ukuran font</span>
                        <select
                            className={input}
                            value={form.font_size}
                            onChange={(event) => setForm({ ...form, font_size: Number(event.target.value) })}
                        >
                            <option value={13}>Kecil</option>
                            <option value={14}>Normal</option>
                            <option value={16}>Besar</option>
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block font-medium text-slate-600">Warna batang bawaan</span>
                        <input
                            type="color"
                            className={input + ' h-9 p-1'}
                            value={form.bar_color}
                            onChange={(event) => setForm({ ...form, bar_color: event.target.value })}
                        />
                    </label>

                    <div className="rounded bg-slate-50 p-3 text-xs text-slate-500">
                        Pratinjau: <span className="font-medium" style={{ color: form.bar_color }}>Kegiatan contoh</span> ·
                        31 Jan 2026
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
                    <button type="button" className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={onClose}>Batal</button>
                    <button type="button" className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white" onClick={() => onSave(form)}>
                        Simpan
                    </button>
                </div>
            </div>
        </div>
    );
}

const input = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none';
