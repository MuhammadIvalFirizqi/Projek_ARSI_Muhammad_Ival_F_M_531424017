/**
 * Geometri rute panah dependensi untuk Gantt & PERT chart (FR-46).
 *
 * Kepala panah (SVG marker) selalu mengikuti arah dari segmen terakhir sebuah
 * path. Karena itu setiap rute di sini dijamin:
 *   - segmen terakhir selalu lurus ke kanan dan cukup panjang untuk kepala
 *     panah, sehingga kepala panah tidak pernah menimpa garisnya sendiri;
 *   - ujung panah selalu mendarat tepat di tepi kiri batang/node tujuan;
 *   - sudut belokan dibulatkan agar tidak terlihat kaku.
 *
 * Catatan penting: pada Gantt, kegiatan yang berurutan (mis. selesai tgl 23,
 * mulai tgl 24) punya jarak antar batang tepat 0px karena lebar batang sudah
 * sehari penuh. Untuk kasus itu ruas masuk "dipinjam" dari badan batang
 * sumber — bagian itu tertutup batang jadi tidak terlihat — bukan memutar
 * lewat jalur memutar yang janggal.
 */

/** Ruas lurus ideal yang disisakan untuk kepala panah. */
export const ARROW_RUN = 16;
/** Di bawah ruas masuk sepanjang ini dipakai kepala panah kecil. */
export const COMPACT_RUN = 9;
/** Ruas keluar dari ujung batang sumber sebelum berbelok. */
export const STUB = 12;
/** Radius pembulatan sudut belokan. */
export const CORNER_RADIUS = 6;

/**
 * Ubah poligon menjadi path SVG dengan sudut-sudut yang dibulatkan.
 * Titik yang berimpit (ruas nol panjang) dibuang agar tidak ada sudut degenerate.
 */
export function roundedPath(points, radius = CORNER_RADIUS) {
    const cleaned = [];
    points.forEach(([x, y]) => {
        const last = cleaned[cleaned.length - 1];
        if (last && Math.abs(last[0] - x) < 0.01 && Math.abs(last[1] - y) < 0.01) return;
        cleaned.push([x, y]);
    });
    if (cleaned.length < 2) return '';

    const fmt = (value) => Math.round(value * 100) / 100;
    let d = `M ${fmt(cleaned[0][0])} ${fmt(cleaned[0][1])}`;
    for (let i = 1; i < cleaned.length - 1; i += 1) {
        const [px, py] = cleaned[i - 1];
        const [cx, cy] = cleaned[i];
        const [nx, ny] = cleaned[i + 1];
        const inLength = Math.hypot(cx - px, cy - py);
        const outLength = Math.hypot(nx - cx, ny - cy);
        const r = Math.min(radius, inLength / 2, outLength / 2);
        if (r <= 0) {
            d += ` L ${fmt(cx)} ${fmt(cy)}`;
            continue;
        }
        d += ` L ${fmt(cx - ((cx - px) / inLength) * r)} ${fmt(cy - ((cy - py) / inLength) * r)}`;
        d += ` Q ${fmt(cx)} ${fmt(cy)} ${fmt(cx + ((nx - cx) / outLength) * r)} ${fmt(cy + ((ny - cy) / outLength) * r)}`;
    }
    const [ex, ey] = cleaned[cleaned.length - 1];
    d += ` L ${fmt(ex)} ${fmt(ey)}`;
    return d;
}

/**
 * Rute ortogonal dari ujung batang sumber (x1, y1) ke tepi kiri batang
 * tujuan (x2, y2). Selalu menghasilkan segmen akhir lurus ke kanan, berapa
 * pun kecilnya jarak antara kedua kegiatan.
 *
 * @param {number} laneOffset jarak jalur memutar dari baris tujuan
 *   (diambil dari ruang kosong di bawah/atas baris tersebut)
 * @param {number} sourceWidth lebar batang sumber (untuk meminjam ruang masuk)
 * @returns {{ d: string, compact: boolean }} rute path dan apakah pakai
 *   kepala panah kecil (untuk ruas masuk yang sempit)
 */
export function dependencyRoute(
    x1, y1, x2, y2,
    {
        arrowRun = ARROW_RUN, stub = STUB, laneOffset = 12,
        radius = CORNER_RADIUS, sourceWidth = 0,
    } = {},
) {
    const gap = x2 - x1;
    const laneY = y1 === y2
        ? y2 + laneOffset
        : y2 + Math.sign(y2 - y1) * laneOffset;

    // benar-benar bertumpuk (kegiatan saling menimpa): ruang masuk tak ada
    // sama sekali, jadi rute memutar dulu lewat jalur di sisi baris tujuan
    if (gap < 0) {
        return {
            d: roundedPath([
                [x1, y1],
                [x1, laneY],
                [x2 - arrowRun, laneY],
                [x2 - arrowRun, y2],
                [x2, y2],
            ], radius),
            compact: false,
        };
    }

    // cukup ruang: belok dekat tujuan agar ruas panah tetap penuh
    if (gap >= arrowRun) {
        return {
            d: roundedPath([[x1, y1], [x2 - arrowRun, y1], [x2 - arrowRun, y2], [x2, y2]], radius),
            compact: false,
        };
    }

    // berdekatan — termasuk yang berurutan (celah tanggal 1 hari) karena lebar
    // batang sudah sehari penuh sehingga jarak antar batang tepat 0px.
    // Ruas masuknya dipinjam dari badan batang sumber: horizontal pertama ada
    // di belakang batang sumber sehingga tak terlihat, yang terlihat hanya
    // belokan rapi lalu masuk lurus — tanpa putaran memutar yang janggal.
    const run = entryRun(gap, sourceWidth, arrowRun);
    const compact = run < COMPACT_RUN;
    // sudut hanya dibulatkan kalau sisa ruasnya masih muat untuk kepala panah
    const corner = Math.min(radius, Math.max(0, run - (compact ? 6 : 9)));
    return {
        d: roundedPath([[x1, y1], [x2 - run, y1], [x2 - run, y2], [x2, y2]], corner),
        compact,
    };
}

/*
 * Urutan percabangan di atas (dari yang paling longgar):
 *   gap >= stub + arrowRun : keluar-stub, belok dekat sumber
 *   gap >= arrowRun        : belok dekat tujuan
 *   gap >= 0               : belok di ujung sumber, ruas masuk dipinjam dari
 *                            badan batang sumber (tertutup batang, tak terlihat)
 *   gap <  0               : bertumpuk, memutar lewat sisi baris tujuan
 * Fungsi `entryRun` di bawah menghitung ruas masuk untuk tiga kasus gap >= 0.
 */
export function entryRun(gap, sourceWidth, arrowRun = ARROW_RUN) {
    return Math.max(4, Math.min(arrowRun, gap + Math.max(0, sourceWidth - 2)));
}
