/**
 * Setiap perubahan didefinisikan sebagai pasangan langkah:
 *  - fwd: apa yang dilakukan saat dieksekusi (juga dipakai untuk redo)
 *  - bwd: langkah pembaliknya (dipakai untuk undo)
 *
 * Keduanya membawa request HTTP + fungsi penerapan lokal, sehingga undo/redo
 * berlaku untuk perubahan milik pengguna sendiri dan ikut disiarkan (FR-63).
 */

import { uid } from './dates';

const projectUrl = (state) => `/api/projects/${state.project.id}`;

const applyPatch = (items, id, values) => items.map((item) => (item.id === id ? { ...item, ...values } : item));

const step = (method, url, body, apply) => ({ method, url, body, apply });

// ---------------------------------------------------------------- kegiatan

export function createTaskAction(state, draft) {
    const task = {
        id: draft.id || uid(),
        parent_id: draft.parent_id ?? null,
        name: draft.name ?? 'Kegiatan baru',
        milestone: !!draft.milestone,
        begin_date: draft.begin_date || state.project.start_date,
        end_date: draft.end_date || draft.begin_date || state.project.start_date,
        duration: draft.duration ?? 1,
        constraint: draft.constraint ?? null,
        priority: draft.priority || 'Normal',
        progress: draft.progress ?? 0,
        show_in_timeline: draft.show_in_timeline ?? true,
        shape: draft.shape || 'bar',
        color: draft.color ?? null,
        web_link: draft.web_link ?? null,
        notes: draft.notes ?? null,
        position: draft.position ?? state.tasks.length,
        critical: false,
        resource_ids: draft.resource_ids || [],
    };

    const remove = (current) => ({
        ...current,
        tasks: current.tasks.filter((item) => item.id !== task.id && item.parent_id !== task.id),
        dependencies: current.dependencies.filter(
            (dep) => dep.task_id !== task.id && dep.predecessor_id !== task.id,
        ),
    });

    return {
        fwd: step('POST', `${projectUrl(state)}/tasks`, task, (current) => ({
            ...current,
            tasks: [...current.tasks, task],
        })),
        bwd: step('DELETE', `${projectUrl(state)}/tasks/${task.id}`, undefined, remove),
        createdId: task.id,
    };
}

export function patchTaskAction(state, id, patch) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return null;
    const before = {};
    Object.keys(patch).forEach((key) => { before[key] = task[key]; });

    return {
        fwd: step('PUT', `${projectUrl(state)}/tasks/${id}`, patch,
            (current) => ({ ...current, tasks: applyPatch(current.tasks, id, patch) })),
        bwd: step('PUT', `${projectUrl(state)}/tasks/${id}`, before,
            (current) => ({ ...current, tasks: applyPatch(current.tasks, id, before) })),
    };
}

export function deleteTaskAction(state, id) {
    const removedIds = new Set();
    const collect = (taskId) => {
        removedIds.add(taskId);
        state.tasks.filter((task) => task.parent_id === taskId).forEach((child) => collect(child.id));
    };
    collect(id);

    const removedTasks = state.tasks.filter((task) => removedIds.has(task.id));
    const removedDeps = state.dependencies.filter(
        (dep) => removedIds.has(dep.task_id) || removedIds.has(dep.predecessor_id),
    );
    const localDelete = (current) => ({
        ...current,
        tasks: current.tasks.filter((task) => !removedIds.has(task.id)),
        dependencies: current.dependencies.filter(
            (dep) => !removedIds.has(dep.task_id) && !removedIds.has(dep.predecessor_id),
        ),
    });

    const ordered = [...removedTasks].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));

    return {
        fwd: step('DELETE', `${projectUrl(state)}/tasks/${id}`, undefined, localDelete),
        // Undo: pulihkan seluruh kegiatan (termasuk sub-kegiatan) lalu dependensinya.
        bwd: [
            ...ordered.map((task) => step('POST', `${projectUrl(state)}/tasks`, task, null)),
            ...removedDeps.map((dep) => step('POST', `${projectUrl(state)}/dependencies`, dep, null)),
            step('noop', null, null, (current) => ({
                ...current,
                tasks: [...current.tasks, ...removedTasks],
                dependencies: [
                    ...current.dependencies.filter(
                        (dep) => !removedDeps.some((removed) => removed.id === dep.id),
                    ),
                    ...removedDeps,
                ],
            })),
        ],
    };
}

export function reorderTasksAction(state, items) {
    const before = state.tasks.map((task) => ({
        id: task.id, parent_id: task.parent_id, position: task.position,
    }));

    const apply = (current) => ({
        ...current,
        tasks: current.tasks.map((task) => {
            const item = items.find((entry) => entry.id === task.id);
            return item ? { ...task, parent_id: item.parent_id ?? null, position: item.position } : task;
        }),
    });

    const revert = (current) => ({
        ...current,
        tasks: current.tasks.map((task) => {
            const item = before.find((entry) => entry.id === task.id);
            return item ? { ...task, parent_id: item.parent_id, position: item.position } : task;
        }),
    });

    return {
        fwd: step('POST', `${projectUrl(state)}/tasks/reorder`, { items }, apply),
        bwd: step('POST', `${projectUrl(state)}/tasks/reorder`, { items: before }, revert),
    };
}

// ------------------------------------------------------------- dependensi

export function createDependencyAction(state, draft) {
    const dep = {
        id: draft.id || uid(),
        task_id: draft.task_id,
        predecessor_id: draft.predecessor_id,
        type: draft.type || 'FS',
        delay: draft.delay ?? 0,
    };

    return {
        fwd: step('POST', `${projectUrl(state)}/dependencies`, dep,
            (current) => ({ ...current, dependencies: [...current.dependencies, dep] })),
        bwd: step('DELETE', `${projectUrl(state)}/dependencies/${dep.id}`, undefined,
            (current) => ({
                ...current,
                dependencies: current.dependencies.filter((item) => item.id !== dep.id),
            })),
    };
}

export function patchDependencyAction(state, id, patch) {
    const dependency = state.dependencies.find((item) => item.id === id);
    if (!dependency) return null;
    const before = {};
    Object.keys(patch).forEach((key) => { before[key] = dependency[key]; });

    return {
        fwd: step('PUT', `${projectUrl(state)}/dependencies/${id}`, patch,
            (current) => ({ ...current, dependencies: applyPatch(current.dependencies, id, patch) })),
        bwd: step('PUT', `${projectUrl(state)}/dependencies/${id}`, before,
            (current) => ({ ...current, dependencies: applyPatch(current.dependencies, id, before) })),
    };
}

export function deleteDependencyAction(state, id) {
    const dependency = state.dependencies.find((item) => item.id === id);
    if (!dependency) return null;

    return {
        fwd: step('DELETE', `${projectUrl(state)}/dependencies/${id}`, undefined,
            (current) => ({
                ...current,
                dependencies: current.dependencies.filter((item) => item.id !== id),
            })),
        bwd: step('POST', `${projectUrl(state)}/dependencies`, dependency,
            (current) => ({ ...current, dependencies: [...current.dependencies, dependency] })),
    };
}

// ---------------------------------------------------------------- resource

export function createResourceAction(state, draft) {
    const resource = {
        id: draft.id || uid(),
        name: draft.name ?? 'Anggota baru',
        phone: draft.phone ?? null,
        email: draft.email ?? null,
        default_role: draft.default_role ?? null,
        standard_rate: draft.standard_rate ?? 0,
        color: draft.color ?? null,
        days_off: draft.days_off || [],
        assignments: [],
    };

    return {
        fwd: step('POST', `${projectUrl(state)}/resources`, resource,
            (current) => ({ ...current, resources: [...current.resources, resource] })),
        bwd: step('DELETE', `${projectUrl(state)}/resources/${resource.id}`, undefined,
            (current) => ({
                ...current,
                resources: current.resources.filter((item) => item.id !== resource.id),
                tasks: current.tasks.map((task) => ({
                    ...task,
                    resource_ids: task.resource_ids.filter((rid) => rid !== resource.id),
                })),
            })),
        createdId: resource.id,
    };
}

export function patchResourceAction(state, id, patch) {
    const resource = state.resources.find((item) => item.id === id);
    if (!resource) return null;
    const before = {};
    Object.keys(patch).forEach((key) => { before[key] = resource[key]; });

    return {
        fwd: step('PUT', `${projectUrl(state)}/resources/${id}`, patch,
            (current) => ({ ...current, resources: applyPatch(current.resources, id, patch) })),
        bwd: step('PUT', `${projectUrl(state)}/resources/${id}`, before,
            (current) => ({ ...current, resources: applyPatch(current.resources, id, before) })),
    };
}

export function deleteResourceAction(state, id) {
    const resource = state.resources.find((item) => item.id === id);
    if (!resource) return null;

    return {
        fwd: step('DELETE', `${projectUrl(state)}/resources/${id}`, undefined,
            (current) => ({
                ...current,
                resources: current.resources.filter((item) => item.id !== id),
                tasks: current.tasks.map((task) => ({
                    ...task,
                    resource_ids: task.resource_ids.filter((rid) => rid !== id),
                })),
            })),
        bwd: step('POST', `${projectUrl(state)}/resources`, resource,
            (current) => ({ ...current, resources: [...current.resources, resource] })),
    };
}

// ----------------------------------------------------- kalender & proyek

const CALENDAR_KEYS = ['weekend_days', 'weekends_work', 'holiday_mode', 'holidays'];

export function patchCalendarAction(state, patch) {
    const before = {};
    CALENDAR_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(patch, key)) before[key] = state.calendar[key];
    });

    return {
        fwd: step('PUT', projectUrl(state), patch,
            (current) => ({ ...current, calendar: { ...current.calendar, ...patch } })),
        bwd: step('PUT', projectUrl(state), before,
            (current) => ({ ...current, calendar: { ...current.calendar, ...before } })),
    };
}

const PROJECT_KEYS = ['name', 'organization', 'web_url', 'description', 'start_date', 'date_format'];

export function patchProjectAction(state, patch) {
    const before = {};
    Object.keys(patch).forEach((key) => { before[key] = state.project[key]; });

    return {
        fwd: step('PUT', projectUrl(state), patch,
            (current) => ({ ...current, project: { ...current.project, ...patch } })),
        bwd: step('PUT', projectUrl(state), before,
            (current) => ({ ...current, project: { ...current.project, ...before } })),
    };
}

export { PROJECT_KEYS, CALENDAR_KEYS };
