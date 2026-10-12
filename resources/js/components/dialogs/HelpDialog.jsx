/** Menu Help (FR-40): panduan penggunaan dan informasi versi aplikasi. */
export default function HelpDialog({ onClose }) {
    const shortcuts = [
        ['Ctrl+N', 'Proyek baru'],
        ['Ctrl+O', 'Buka daftar proyek'],
        ['Ctrl+S', 'Simpan ulang / muat state terbaru'],
        ['Ctrl+Shift+S', 'Save As (salin proyek)'],
        ['Ctrl+P', 'Print / pratinjau cetak'],
        ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
        ['Ctrl+F', 'Cari kegiatan'],
        ['F5', 'Refresh'],
        ['Delete', 'Hapus kegiatan terpilih'],
        ['Tab / Shift+Tab', 'Turunkan / naikkan tingkat sub-kegiatan'],
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onMouseDown={onClose}>
            <div className="w-full max-w-2xl rounded bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                    <h3 className="font-semibold">Help · Panduan penggunaan</h3>
                    <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
                </div>

                <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4 text-sm text-slate-700">
                    <section>
                        <h4 className="mb-1 font-semibold">Alur membuat jadwal</h4>
                        <ol className="list-decimal space-y-1 pl-5">
                            <li>Pilih <b>Project &gt; New</b>, isi nama, organisasi, alamat web, dan deskripsi, lalu atur kalender kerja.</li>
                            <li>Tambahkan kegiatan lewat <b>Task &gt; New Task</b> atau klik kanan pada daftar kegiatan.</li>
                            <li>Buka <b>Task Properties</b> untuk mengatur tanggal, durasi, prioritas, dan progress.</li>
                            <li>Tentukan predecessor (Finish-to-Start / Start-to-Start) beserta delay hari kerja pada tab Predecessors.</li>
                            <li>Tambahkan resource lewat menu <b>Resource</b> lalu tugaskan lewat tab Resources.</li>
                            <li>Periksa hasil pada tab <b>Gantt</b>, <b>Resources Chart</b>, dan <b>PERT chart</b>.</li>
                        </ol>
                    </section>

                    <section>
                        <h4 className="mb-1 font-semibold">Interaksi langsung pada timeline</h4>
                        <ul className="list-disc space-y-1 pl-5">
                            <li>Taruh kursor pada batang: geser batang untuk mengubah tanggal mulai.</li>
                            <li>Tarik tepi kanan batang untuk mengubah durasi.</li>
                            <li>Tarik penanda progres di dalam batang untuk mengubah persentase.</li>
                            <li>Tarik lingkaran kecil di ujung kanan batang ke kegiatan lain untuk membuat dependensi.</li>
                            <li>Klik dua kali sel Name / Begin date / End date untuk mengedit langsung.</li>
                            <li>Klik dua kali batang untuk membuka Task Properties.</li>
                        </ul>
                    </section>

                    <section>
                        <h4 className="mb-1 font-semibold">Kolaborasi real-time</h4>
                        <p className="text-slate-600">
                            Semua orang yang membuka proyek yang sama melihat perubahan seketika lewat WebSocket.
                            Nama tampilan dan warna Anda muncul di status bar; kegiatan yang sedang diedit pengguna lain
                            ditandai ikon ✎. Bila koneksi terputus, status berubah menjadi <i>Terputus</i> dan perubahan
                            dikirim ulang setelah tersambung kembali.
                        </p>
                    </section>

                    <section>
                        <h4 className="mb-1 font-semibold">Pintasan keyboard</h4>
                        <table className="w-full text-sm">
                            <tbody>
                                {shortcuts.map(([key, description]) => (
                                    <tr key={key} className="border-b border-slate-100">
                                        <td className="w-40 py-1 font-mono text-xs text-slate-500">{key}</td>
                                        <td className="py-1">{description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section className="rounded bg-slate-50 p-3 text-xs text-slate-500">
                        Aplikasi Manajemen Proyek Sistem Informasi (Gantt Chart) · versi 1.0 (MVP) ·
                        Draft PRD v2.0, 8 Oktober 2026 · Sistem acuan: GanttProject 2.7 · Laravel + Inertia React +
                        Laravel Reverb.
                    </section>
                </div>

                <div className="flex justify-end border-t border-slate-200 px-5 py-3">
                    <button type="button" className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white" onClick={onClose}>
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}
