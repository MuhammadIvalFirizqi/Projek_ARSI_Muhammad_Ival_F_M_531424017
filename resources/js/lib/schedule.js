/**
 * Mesin penjadwalan di sisi klien — cerminan persis dari
 * App\Services\ScheduleEngine + App\Services\WorkingCalendar (PRD bagian 8).
 *
 * Dijalankan setiap kali ada perubahan agar respons tampil < 100 ms,
 * sementara Laravel tetap menjadi sumber kebenaran.
 */

import { addDays, compare, dayOfWeek, diffDays, formatDate, maxDate, minDate, parseDate } from './dates';

const MAX_STEPS = 5000;

export class WorkingCalendar {
    constructor(weekendDays = [0, 6], weekendsWork = false, holidays = [], holidayEnabled = true) {
        this.weekendDays = (weekendDays || [0, 6]).map(Number);
        this.weekendsWork = !!weekendsWork;
        this.holidayEnabled = holidayEnabled;
        this.oneOff = new Set();
        this.recurring = new Set();

        if (holidayEnabled) {
            (holidays || []).forEach((holiday) => {
                const date = typeof holiday === 'string' ? holiday : holiday.date;
                if (!date) return;
                const type = typeof holiday === 'string' ? 'one-off' : holiday.type || 'one-off';
                if (type === 'recurring') this.recurring.add(String(date).slice(5));
                else this.oneOff.add(String(date).slice(0, 10));
            });
        }
    }

    static fromCalendar(calendar) {
        if (!calendar) return new WorkingCalendar([0, 6], false, [], false);
        return new WorkingCalendar(
            calendar.weekend_days || [0, 6],
            !!calendar.weekends_work,
            calendar.holidays || [],
            (calendar.holiday_mode || 'none') === 'custom',
        );
    }

    isWeekend(date) {
        return this.weekendDays.includes(dayOfWeek(date));
    }

    isHoliday(date) {
        if (!this.holidayEnabled) return false;
        const key = String(date).slice(0, 10);
        return this.oneOff.has(key) || this.recurring.has(key.slice(5));
    }

    isWorkingDay(date) {
        if (!this.weekendsWork && this.isWeekend(date)) return false;
        if (this.isHoliday(date)) return false;
        return true;
    }

    #shift(date, step) {
        let cursor = typeof date === 'string' ? parseDate(date) : date;
        for (let i = 0; i < MAX_STEPS; i++) {
            cursor = addDays(cursor, step);
            const key = formatDate(cursor);
            if (this.isWorkingDay(key)) return key;
        }
        return formatDate(cursor);
    }

    nextWorkingDay(date) {
        return this.#shift(date, 1);
    }

    prevWorkingDay(date) {
        return this.#shift(date, -1);
    }

    shiftWorkingDays(date, amount) {
        let cursor = date;
        for (let i = 0; i < amount; i++) cursor = this.nextWorkingDay(cursor);
        return cursor;
    }

    shiftWorkingDaysBack(date, amount) {
        let cursor = date;
        for (let i = 0; i < amount; i++) cursor = this.prevWorkingDay(cursor);
        return cursor;
    }

    normalizeStart(date) {
        let cursor = date;
        for (let i = 0; i < MAX_STEPS; i++) {
            if (this.isWorkingDay(cursor)) return cursor;
            cursor = this.nextWorkingDay(cursor);
        }
        return cursor;
    }

    addDuration(begin, duration) {
        if (duration <= 1) return begin;
        return this.shiftWorkingDays(begin, duration - 1);
    }

    countWorkingDays(begin, end) {
        const start = parseDate(begin);
        const stop = parseDate(end);
        if (compare(stop, start) < 0) return 0;
        let count = 0;
        let cursor = start;
        let guard = 0;
        while (compare(cursor, stop) <= 0 && guard++ < 200000) {
            if (this.isWorkingDay(formatDate(cursor))) count++;
            cursor = addDays(cursor, 1);
        }
        return count;
    }

    durationBetween(begin, end) {
        return Math.max(1, this.countWorkingDays(begin, end));
    }

    eachDay(from, to) {
        const days = [];
        let cursor = parseDate(from);
        const stop = parseDate(to);
        let guard = 0;
        while (compare(cursor, stop) <= 0 && guard++ < 40000) {
            days.push(formatDate(cursor));
            cursor = addDays(cursor, 1);
        }
        return days;
    }
}

function topoSort(nodes, preds) {
    const indeg = {};
    nodes.forEach((id) => { indeg[id] = 0; });
    nodes.forEach((id) => {
        (preds[id] || []).forEach((dep) => {
            if (indeg[id] !== undefined && indeg[dep.predecessor_id] !== undefined && dep.predecessor_id !== id) {
                indeg[id]++;
            }
        });
    });

    const queue = nodes.filter((id) => indeg[id] === 0);
    const order = [];
    const seen = new Set();

    while (queue.length) {
        const id = queue.shift();
        if (seen.has(id)) continue;
        seen.add(id);
        order.push(id);

        Object.keys(preds).forEach((taskId) => {
            preds[taskId].forEach((dep) => {
                if (dep.predecessor_id !== id || seen.has(taskId)) return;
                indeg[taskId]--;
                if (indeg[taskId] === 0) queue.push(taskId);
            });
        });
    }

    nodes.forEach((id) => {
        if (!seen.has(id)) order.push(id);
    });

    return order;
}

function parentOrder(children) {
    const depth = (id) => {
        let max = 0;
        (children[id] || []).forEach((child) => {
            if (children[child]) max = Math.max(max, 1 + depth(child));
        });
        return max;
    };

    return Object.keys(children).sort((a, b) => depth(b) - depth(a));
}

function workingDayDiff(calendar, from, to) {
    if (from === to) return 0;
    if (compare(to, from) > 0) {
        let count = 0;
        let cursor = from;
        let guard = 0;
        while (compare(cursor, to) < 0 && guard++ < 100000) {
            cursor = calendar.nextWorkingDay(cursor);
            if (compare(cursor, to) > 0) break;
            count++;
        }
        return count;
    }
    return -workingDayDiff(calendar, to, from);
}

/**
 * @param {Array} tasks daftar kegiatan (state.tasks)
 * @param {Array} deps daftar dependensi (state.dependencies)
 * @param {WorkingCalendar} calendar
 * @returns {{tasks: Record<string,{begin_date:string,end_date:string,duration:number,critical:boolean}>, critical:string[], project_start:string|null, project_end:string|null}}
 */
export function computeSchedule(tasks, deps, calendar) {
    const list = (tasks || []).map((task) => ({
        id: task.id,
        parent_id: task.parent_id || null,
        begin_date: task.begin_date,
        end_date: task.end_date,
        duration: Number(task.duration ?? 1),
        milestone: !!task.milestone,
        manual_begin: !!task.manual_begin,
    }));

    if (!list.length) {
        return { tasks: {}, critical: [], project_start: null, project_end: null };
    }

    const byId = {};
    const children = {};
    const preds = {};
    const succs = {};

    list.forEach((task) => { byId[task.id] = task; });
    list.forEach((task) => {
        if (task.parent_id && byId[task.parent_id]) {
            (children[task.parent_id] ||= []).push(task.id);
        }
    });

    (deps || []).forEach((dep) => {
        if (dep.task_id === dep.predecessor_id) return;
        if (!byId[dep.task_id] || !byId[dep.predecessor_id]) return;
        (preds[dep.task_id] ||= []).push(dep);
        (succs[dep.predecessor_id] ||= []).push(dep);
    });

    const isSummary = (id) => !!(children[id] && children[id].length);

    const begin = {};
    const end = {};
    const duration = {};

    const leafIds = list.map((task) => task.id).filter((id) => !isSummary(id));

    topoSort(leafIds, preds).forEach((id) => {
        const task = byId[id];
        let start = calendar.normalizeStart(task.begin_date);

        let candidate = null;
        (preds[id] || []).forEach((dep) => {
            const predBegin = begin[dep.predecessor_id] ?? byId[dep.predecessor_id].begin_date;
            const predEnd = end[dep.predecessor_id] ?? byId[dep.predecessor_id].end_date;
            const delay = Number(dep.delay || 0);

            const value = dep.type === 'SS'
                ? calendar.shiftWorkingDays(predBegin, delay)
                : (() => {
                    const afterFinish = calendar.nextWorkingDay(predEnd);
                    const withDelay = calendar.shiftWorkingDays(predEnd, delay);
                    return compare(withDelay, afterFinish) > 0 ? withDelay : afterFinish;
                })();

            if (candidate === null || compare(value, candidate) > 0) candidate = value;
        });

        if (candidate !== null && (!task.manual_begin || compare(candidate, start) > 0)) start = candidate;
        start = calendar.normalizeStart(start);

        if (task.milestone) {
            begin[id] = start;
            end[id] = start;
            duration[id] = 0;
            return;
        }

        const dur = Math.max(1, task.duration || 1);
        begin[id] = start;
        end[id] = calendar.addDuration(start, dur);
        duration[id] = dur;
    });

    parentOrder(children).forEach((parentId) => {
        const childIds = children[parentId].filter((cid) => begin[cid]);
        if (!childIds.length) return;
        let min = null;
        let max = null;
        childIds.forEach((cid) => {
            min = min === null ? begin[cid] : minDate(min, begin[cid]);
            max = max === null ? end[cid] : maxDate(max, end[cid]);
        });
        begin[parentId] = min;
        end[parentId] = max;
        duration[parentId] = Math.max(1, calendar.countWorkingDays(min, max));
    });

    list.forEach((task) => {
        if (begin[task.id]) return;
        begin[task.id] = calendar.normalizeStart(task.begin_date);
        end[task.id] = calendar.addDuration(begin[task.id], Math.max(0, task.duration || 1));
        duration[task.id] = task.duration || 1;
    });

    const projectEnd = Object.values(end).reduce((acc, value) => (acc === null ? value : maxDate(acc, value)), null);
    const projectStartValue = Object.values(begin).reduce((acc, value) => (acc === null ? value : minDate(acc, value)), null);

    const critical = criticalPath(calendar, begin, end, duration, children, succs, projectEnd);

    const result = {};
    list.forEach((task) => {
        result[task.id] = {
            begin_date: begin[task.id],
            end_date: end[task.id],
            duration: duration[task.id],
            critical: critical.includes(task.id),
        };
    });

    return { tasks: result, critical, project_start: projectStartValue, project_end: projectEnd };
}

function criticalPath(calendar, begin, end, duration, children, succs, projectEnd) {
    const ids = Object.keys(begin);
    if (!ids.length) return [];

    const LS = {};
    const LF = {};
    ids.forEach((id) => { LF[id] = projectEnd; });

    for (let pass = 0; pass <= ids.length; pass++) {
        let changed = false;
        ids.forEach((id) => {
            const dur = Math.max(0, duration[id]);
            let lf = projectEnd;
            let lsObserved = null;

            (succs[id] || []).forEach((dep) => {
                const succ = dep.task_id;
                if (LS[succ] === undefined) return;
                const delay = Number(dep.delay || 0);

                if (dep.type === 'SS') {
                    const cand = calendar.shiftWorkingDaysBack(LS[succ], delay);
                    if (lsObserved === null || compare(cand, lsObserved) < 0) lsObserved = cand;
                } else {
                    const cand = calendar.shiftWorkingDaysBack(LS[succ], Math.max(1, delay));
                    if (compare(cand, lf) < 0) lf = cand;
                }
            });

            let ls = dur <= 0 ? lf : calendar.shiftWorkingDaysBack(lf, dur - 1);
            if (lsObserved !== null && compare(lsObserved, ls) < 0) ls = lsObserved;

            const computedLf = calendar.addDuration(ls, dur);
            if (LS[id] !== ls || LF[id] !== computedLf) changed = true;
            LF[id] = computedLf;
            LS[id] = ls;
        });
        if (!changed) break;
    }

    const critical = [];
    ids.forEach((id) => {
        if (workingDayDiff(calendar, begin[id], LS[id]) <= 0) critical.push(id);
    });

    Object.entries(children).forEach(([parentId, childIds]) => {
        if (childIds.some((cid) => critical.includes(cid))) critical.push(parentId);
    });

    return [...new Set(critical)];
}

/**
 * Gabungkan hasil engine dengan state proyek -> daftar kegiatan siap render.
 */
export function withSchedule(state, calendar) {
    const cal = calendar || WorkingCalendar.fromCalendar(state.calendar);
    const computed = computeSchedule(state.tasks, state.dependencies, cal);
    const tasks = (state.tasks || []).map((task) => {
        const info = computed.tasks[task.id];
        return info ? { ...task, ...info } : task;
    });
    return { ...state, tasks, project_start: computed.project_start, project_end: computed.project_end };
}
