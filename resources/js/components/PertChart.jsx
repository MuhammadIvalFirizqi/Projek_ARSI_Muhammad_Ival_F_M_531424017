import { useMemo } from 'react';
import { formatDisplayDate } from '../lib/dates';

const NODE_W = 190;
const NODE_H = 92;
const GAP_X = 90;
const GAP_Y = 26;
const PAD = 30;

/**
 * PERT chart / network diagram (FR-24): setiap kegiatan menjadi node berisi
 * nama, Start, End, Duration, dihubungkan panah sesuai dependensi.
 * Kegiatan jalur kritis disorot (FR-26).
 */
export default function PertChart({
    state, view, showCritical, setSelectedId, openTaskDialog, settings,
}) {
    const layout = useMemo(() => {
        const tasks = view.tasks || [];
        if (!tasks.length) return { nodes: [], edges: [], width: 600, height: 300 };

        const preds = {};
        tasks.forEach((task) => { preds[task.id] = []; });
        state.dependencies.forEach((dep) => {
            if (preds[dep.task_id] && preds[dep.predecessor_id]) preds[dep.task_id].push(dep.predecessor_id);
        });

        const layer = {};
        const resolve = (id, guard = new Set()) => {
            if (layer[id] !== undefined) return layer[id];
            if (guard.has(id)) return 0;
            guard.add(id);
            const parents = preds[id] || [];
            const value = parents.length
                ? Math.max(...parents.map((parent) => resolve(parent, guard) + 1))
                : 0;
            layer[id] = value;
            return value;
        };
        tasks.forEach((task) => resolve(task.id));

        const columns = {};
        tasks.forEach((task) => {
            const depth = layer[task.id] || 0;
            (columns[depth] ||= []).push(task);
        });
        Object.values(columns).forEach((column) => {
            column.sort((a, b) => (a.position - b.position) || String(a.name).localeCompare(String(b.name)));
        });

        const positions = {};
        const depths = Object.keys(columns).map(Number).sort((a, b) => a - b);
        let maxRows = 0;
        depths.forEach((depth) => {
            maxRows = Math.max(maxRows, columns[depth].length);
            columns[depth].forEach((task, index) => {
                positions[task.id] = {
                    x: PAD + depth * (NODE_W + GAP_X),
                    y: PAD + index * (NODE_H + GAP_Y),
                    task,
                };
            });
        });

        const edges = state.dependencies
            .filter((dep) => positions[dep.task_id] && positions[dep.predecessor_id])
            .map((dep) => ({ ...dep, from: positions[dep.predecessor_id], to: positions[dep.task_id] }));

        const width = PAD * 2 + (depths.length ? (Math.max(...depths) + 1) * (NODE_W + GAP_X) : NODE_W);
        const height = PAD * 2 + maxRows * (NODE_H + GAP_Y);

        return { nodes: Object.values(positions), edges, width, height };
    }, [view.tasks, state.dependencies]);

    if (!view.tasks.length) {
        return <div className="p-10 text-sm text-slate-400">Belum ada kegiatan untuk ditampilkan pada PERT chart.</div>;
    }

    return (
        <div className="relative min-h-full p-4" style={{ width: layout.width + 32, height: layout.height + 32 }}>
            <div className="mb-3 text-sm text-slate-500">
                PERT chart · {view.tasks.length} kegiatan · {state.dependencies.length} dependensi
                {showCritical && <span className="ml-3 text-red-600">■ jalur kritis tersorot</span>}
            </div>

            <div className="relative" style={{ width: layout.width, height: layout.height }}>
                <svg className="absolute inset-0" width={layout.width} height={layout.height}>
                    <defs>
                        <marker id="pert-arrow" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto">
                            <path d="M0,0 L8,3.5 L0,7 Z" fill="#475569" />
                        </marker>
                        <marker id="pert-arrow-critical" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto">
                            <path d="M0,0 L8,3.5 L0,7 Z" fill="#dc2626" />
                        </marker>
                    </defs>
                    {layout.edges.map((edge) => {
                        const x1 = edge.from.x + NODE_W;
                        const y1 = edge.from.y + NODE_H / 2;
                        const x2 = edge.to.x;
                        const y2 = edge.to.y + NODE_H / 2;
                        const critical = showCritical && edge.from.task.critical && edge.to.task.critical;
                        const midX = (x1 + x2) / 2;
                        const d = x2 > x1
                            ? `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2 - 6} ${y2}`
                            : `M ${x1} ${y1} H ${x1 + 30} V ${(y1 + y2) / 2} H ${x2 - 40} V ${y2} H ${x2 - 6}`;
                        return (
                            <path
                                key={edge.id}
                                d={d}
                                fill="none"
                                stroke={critical ? '#dc2626' : '#475569'}
                                strokeWidth={1.4}
                                strokeDasharray={edge.type === 'SS' ? '5 4' : undefined}
                                markerEnd={`url(#${critical ? 'pert-arrow-critical' : 'pert-arrow'})`}
                            />
                        );
                    })}
                </svg>

                {layout.nodes.map(({ x, y, task }) => {
                    const critical = showCritical && task.critical;
                    return (
                        <div
                            key={task.id}
                            onDoubleClick={() => openTaskDialog(task.id)}
                            onClick={() => setSelectedId(task.id)}
                            className="absolute cursor-pointer rounded border-2 bg-white shadow-sm hover:shadow-md"
                            style={{
                                left: x,
                                top: y,
                                width: NODE_W,
                                height: NODE_H,
                                borderColor: critical ? '#dc2626' : (task.color || '#94a3b8'),
                            }}
                            title={task.notes || task.name}
                        >
                            <div
                                className="truncate rounded-t px-2 py-1 text-xs font-semibold text-white"
                                style={{ background: critical ? '#dc2626' : (task.color || settings.bar_color) }}
                            >
                                {task.name}
                            </div>
                            <div className="space-y-0.5 px-2 py-1 text-[11px] leading-tight text-slate-600">
                                <div>Start: {formatDisplayDate(task.begin_date, settings.date_format)}</div>
                                <div>End: {formatDisplayDate(task.end_date, settings.date_format)}</div>
                                <div className="flex justify-between">
                                    <span>Duration: {task.duration} hari</span>
                                    <span>{task.progress}%</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
