/**
 * Utilitas tanggal (string YYYY-MM-DD, dihitung di UTC agar bebas zona waktu).
 */

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const MONTH_NAMES = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
export const MONTH_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

export function parseDate(value) {
    if (!value) return null;
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date) {
    if (!date) return '';
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function addDays(value, amount) {
    const date = typeof value === 'string' ? parseDate(value) : value;
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + amount);
    return next;
}

export function dayOfWeek(value) {
    const date = typeof value === 'string' ? parseDate(value) : value;
    return date.getUTCDay();
}

export function compare(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

export function minDate(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
}

export function maxDate(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
}

/** Selisih hari kalender (b - a). */
export function diffDays(a, b) {
    const from = typeof a === 'string' ? parseDate(a) : a;
    const to = typeof b === 'string' ? parseDate(b) : b;
    return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** Format tanggal mengikuti pengaturan proyek. */
export function formatDisplayDate(value, pattern = 'DD MMM YYYY') {
    const date = typeof value === 'string' ? parseDate(value) : value;
    if (!date) return '';
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const yyyy = String(date.getUTCFullYear());
    const mon = MONTH_SHORT[date.getUTCMonth()];
    const monFull = MONTH_NAMES[date.getUTCMonth()];
    const wd = DAY_SHORT[date.getUTCDay()];

    return pattern
        .replace('YYYY', yyyy)
        .replace('YY', yyyy.slice(2))
        .replace('MMMM', monFull)
        .replace('MMM', mon)
        .replace('MM', String(date.getUTCMonth() + 1).padStart(2, '0'))
        .replace('DDDD', wd)
        .replace('DD', dd)
        .replace('D', String(date.getUTCDate()));
}

export function today() {
    const now = new Date();
    return formatDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** UUID v4 untuk id yang dibuat di klien. */
export function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
