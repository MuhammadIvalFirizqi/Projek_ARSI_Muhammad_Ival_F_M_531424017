/** Konstanta bersama antara Task List dan Schedule Display agar selalu sejajar (FR-49). */

export const ROW_HEIGHT = 30;
export const HEADER_HEIGHT = 48;
export const DAY_WIDTHS = [44, 26, 16, 10, 6]; // level zoom 1..5 (px per hari)

export function dayWidth(zoom) {
    return DAY_WIDTHS[Math.min(DAY_WIDTHS.length - 1, Math.max(0, zoom - 1))];
}

/**
 * Susun kegiatan menjadi baris datar bertingkat (pohon sub-kegiatan).
 */
export function buildRows(tasks, { collapsed = {}, query = '' } = {}) {
    const list = tasks || [];
    const childrenOf = (parentId) => list
        .filter((task) => (task.parent_id || null) === parentId)
        .sort((a, b) => (a.position - b.position) || String(a.name).localeCompare(String(b.name)));

    const needle = (query || '').trim().toLowerCase();
    const matches = needle
        ? new Set(list.filter((task) => String(task.name).toLowerCase().includes(needle)).map((task) => task.id))
        : null;

    const rows = [];
    const walk = (parentId, depth) => {
        childrenOf(parentId).forEach((task) => {
            const kids = childrenOf(task.id);
            const isSummary = kids.length > 0;
            const hidden = needle
                ? !matches.has(task.id) && !hasMatchingDescendant(task.id, matches, list)
                : !!collapsed[task.id];

            if (!hidden) {
                rows.push({
                    id: task.id,
                    task,
                    depth,
                    isSummary,
                    childCount: kids.length,
                    hasChildren: isSummary,
                });
            }

            if (!hidden && isSummary && (!needle || true)) {
                if (!needle && collapsed[task.id]) return;
                walk(task.id, depth + 1);
            }
        });
    };

    walk(null, 0);
    return rows;
}

function hasMatchingDescendant(taskId, matches, list) {
    const kids = list.filter((task) => task.parent_id === taskId);
    if (!kids.length) return false;
    if (kids.some((kid) => matches.has(kid.id))) return true;
    return kids.some((kid) => hasMatchingDescendant(kid.id, matches, list));
}

/** Geometri batang pada timeline. */
export function barGeometry(task, rangeStart, px) {
    const startIndex = diffIndex(rangeStart, task.begin_date);
    const endIndex = diffIndex(rangeStart, task.end_date);
    const span = Math.max(1, endIndex - startIndex + 1);
    return {
        x: startIndex * px,
        width: Math.max(px * 0.6, span * px),
        startIndex,
        span,
    };
}

function diffIndex(from, to) {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    return Math.round((b - a) / 86400000);
}

export { diffIndex };
