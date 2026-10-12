<?php

namespace App\Services;

/**
 * Mesin penjadwalan: menghitung ulang tanggal seluruh kegiatan,
 * dependensi (Finish-to-Start / Start-to-Start + delay), sub-kegiatan,
 * dan jalur kritis (critical path).
 *
 * Input murni array sehingga bisa diuji tanpa database.
 */
class ScheduleEngine
{
    private const MAX_STEPS = 5000;

    private WorkingCalendar $cal;
    private array $tasks;
    private array $deps;

    public function __construct(WorkingCalendar $calendar, array $tasks, array $dependencies)
    {
        $this->cal = $calendar;
        $this->tasks = array_values($tasks);
        $this->deps = array_values($dependencies);
    }

    /**
     * @return array{
     *   tasks: array<string, array{begin_date:string, end_date:string, duration:int, critical:bool}>,
     *   critical: string[],
     *   project_start: string|null,
     *   project_end: string|null
     * }
     */
    public function compute(): array
    {
        if ($this->tasks === []) {
            return ['tasks' => [], 'critical' => [], 'project_start' => null, 'project_end' => null];
        }

        $byId = [];
        $children = [];
        $preds = [];
        $succs = [];

        foreach ($this->tasks as $task) {
            $byId[$task['id']] = $task;
        }

        foreach ($this->tasks as $task) {
            $parentId = $task['parent_id'] ?? null;
            if ($parentId && isset($byId[$parentId])) {
                $children[$parentId][] = $task['id'];
            }
        }

        foreach ($this->deps as $dep) {
            $taskId = $dep['task_id'];
            $predId = $dep['predecessor_id'];
            if ($taskId === $predId || ! isset($byId[$taskId]) || ! isset($byId[$predId])) {
                continue;
            }
            $preds[$taskId][] = $dep;
            $succs[$predId][] = $dep;
        }

        $isSummary = fn (string $id): bool => isset($children[$id]) && $children[$id] !== [];

        $begin = [];
        $end = [];
        $duration = [];

        // --- Fase 1: kegiatan daun (leaf), urut topologis ---
        $leafIds = [];
        foreach (array_keys($byId) as $id) {
            if (! $isSummary($id)) {
                $leafIds[] = $id;
            }
        }

        foreach ($this->topoSort($leafIds, $preds) as $id) {
            $task = $byId[$id];
            $start = $this->cal->normalizeStart($this->fmt($task['begin_date']));

            $candidate = null;
            foreach ($preds[$id] ?? [] as $dep) {
                $predId = $dep['predecessor_id'];
                $predBegin = $begin[$predId] ?? $this->fmt($byId[$predId]['begin_date']);
                $predEnd = $end[$predId] ?? $this->fmt($byId[$predId]['end_date']);
                $delay = (int) ($dep['delay'] ?? 0);

                // FS: mulai paling cepat hari kerja berikutnya setelah predecessor selesai,
                // ditambah `delay` hari kerja (PRD bagian 8 & 13.4).
                $s = ($dep['type'] ?? 'FS') === 'SS'
                    ? $this->cal->shiftWorkingDays($predBegin, $delay)
                    : max(
                        $this->cal->nextWorkingDay($predEnd),
                        $this->cal->shiftWorkingDays($predEnd, $delay),
                    );

                if ($candidate === null || $s > $candidate) {
                    $candidate = $s;
                }
            }

            // Kegiatan yang tanggal mulainya diatur manual tetap pada tempatnya
            // (sampai predecessor menolaknya); kegiatan lain selalu mengikuti
            // predecessor-nya, maju maupun mundur.
            if ($candidate !== null
                && (empty($task['manual_begin']) || $candidate > $start)) {
                $start = $candidate;
            }
            $start = $this->cal->normalizeStart($start);

            if (! empty($task['milestone'])) {
                $begin[$id] = $start;
                $end[$id] = $start;
                $duration[$id] = 0;
                continue;
            }

            $dur = max(1, (int) ($task['duration'] ?? 1));
            $begin[$id] = $start;
            $end[$id] = $this->cal->addDuration($start, $dur);
            $duration[$id] = $dur;
        }

        // --- Fase 2: kegiatan induk (summary) = gabungan sub-kegiatannya ---
        foreach ($this->parentOrder($children) as $parentId) {
            $childIds = $children[$parentId];
            if (array_filter($childIds, fn ($cid) => isset($begin[$cid])) === []) {
                continue;
            }
            $min = null;
            $max = null;
            foreach ($childIds as $cid) {
                if (! isset($begin[$cid])) {
                    continue;
                }
                $min = ($min === null || $begin[$cid] < $min) ? $begin[$cid] : $min;
                $max = ($max === null || $end[$cid] > $max) ? $end[$cid] : $max;
            }
            if ($min === null) {
                continue;
            }
            $begin[$parentId] = $min;
            $end[$parentId] = $max;
            $duration[$parentId] = max(1, $this->cal->countWorkingDays($min, $max));
        }

        // Sisa kegiatan yang tidak terhitung (mis. induk tanpa anak terhitung)
        foreach ($this->tasks as $task) {
            $id = $task['id'];
            if (! isset($begin[$id])) {
                $begin[$id] = $this->cal->normalizeStart($this->fmt($task['begin_date']));
                $end[$id] = $this->cal->addDuration($begin[$id], max(0, (int) ($task['duration'] ?? 1)));
                $duration[$id] = (int) ($task['duration'] ?? 1);
            }
        }

        $projectEnd = max(array_values($end));
        $projectStart = min(array_values($begin));

        $critical = $this->criticalPath($begin, $end, $duration, $children, $succs, $projectEnd);

        $result = [];
        foreach ($this->tasks as $task) {
            $id = $task['id'];
            $result[$id] = [
                'begin_date' => $begin[$id],
                'end_date' => $end[$id],
                'duration' => $duration[$id],
                'critical' => in_array($id, $critical, true),
            ];
        }

        return [
            'tasks' => $result,
            'critical' => $critical,
            'project_start' => $projectStart,
            'project_end' => $projectEnd,
        ];
    }

    /**
     * Jalur kritis: forward-backward pass (CPM) dengan hari kerja.
     *
     * @return string[]
     */
    private function criticalPath(
        array $begin,
        array $end,
        array $duration,
        array $children,
        array $succs,
        string $projectEnd,
    ): array {
        $ids = array_keys($begin);
        if ($ids === []) {
            return [];
        }

        $LS = [];
        $LF = [];
        foreach ($ids as $id) {
            $LF[$id] = $projectEnd;
        }

        // Relaxasi berulang (aman terhadap siklus, konvergen)
        for ($pass = 0; $pass <= count($ids); $pass++) {
            $changed = false;
            foreach ($ids as $id) {
                $dur = max(0, $duration[$id]);

                $lf = $projectEnd;
                $lsObserved = null;

                foreach ($succs[$id] ?? [] as $dep) {
                    $succ = $dep['task_id'];
                    if (! isset($LS[$succ])) {
                        continue;
                    }
                    $delay = (int) ($dep['delay'] ?? 0);
                    if (($dep['type'] ?? 'FS') === 'SS') {
                        // Start id harus <= shiftBack(start successor, delay)
                        $cand = $this->cal->shiftWorkingDaysBack($LS[$succ], $delay);
                        $lsObserved = ($lsObserved === null || $cand < $lsObserved) ? $cand : $lsObserved;
                    } else {
                        // End id harus <= shiftBack(start successor, max(1, delay))
                        $cand = $this->cal->shiftWorkingDaysBack($LS[$succ], max(1, $delay));
                        $lf = $cand < $lf ? $cand : $lf;
                    }
                }

                $ls = $dur <= 0
                    ? $lf
                    : $this->cal->shiftWorkingDaysBack($lf, $dur - 1);

                if ($lsObserved !== null && $lsObserved < $ls) {
                    $ls = $lsObserved;
                }

                if (($LS[$id] ?? null) !== $ls || $LF[$id] !== $this->cal->addDuration($ls, $dur)) {
                    $changed = true;
                }
                $LF[$id] = $this->cal->addDuration($ls, $dur);
                $LS[$id] = $ls;
            }
            if (! $changed) {
                break;
            }
        }

        $critical = [];
        foreach ($ids as $id) {
            $float = $this->workingDayDiff($begin[$id], $LS[$id]);
            if ($float <= 0) {
                $critical[] = $id;
            }
        }

        // Kegiatan induk: kritis bila ada sub-kegiatan yang kritis
        foreach ($children as $parentId => $childIds) {
            foreach ($childIds as $cid) {
                if (in_array($cid, $critical, true)) {
                    $critical[] = $parentId;
                    break;
                }
            }
        }

        return array_values(array_unique($critical));
    }

    /** Jumlah hari kerja dari $from ke $to (bisa negatif). */
    private function workingDayDiff(string $from, string $to): int
    {
        if ($to === $from) {
            return 0;
        }
        if ($to > $from) {
            // hitung hari kerja strictly between, lalu +0 (LS tepat == begin -> 0)
            $count = 0;
            $cursor = $from;
            while ($cursor < $to) {
                $cursor = $this->cal->nextWorkingDay($cursor);
                if ($cursor > $to) {
                    break;
                }
                $count++;
                if ($count > 100000) {
                    break;
                }
            }

            return $count;
        }

        return -1 * $this->workingDayDiff($to, $from);
    }

    /** @return string[] urut induk dari yang paling dalam ke paling atas */
    private function parentOrder(array $children): array
    {
        $depth = function (string $id) use (&$depth, $children): int {
            $max = 0;
            foreach ($children[$id] ?? [] as $child) {
                if (isset($children[$child])) {
                    $max = max($max, 1 + $depth($child));
                }
            }

            return $max;
        };

        $parents = array_keys($children);
        usort($parents, function (string $a, string $b) use ($depth) {
            return $depth($b) <=> $depth($a);
        });

        return $parents;
    }

    /**
     * Topological sort dengan Kahn; jika ada siklus, sisanya dipertahankan
     * dalam urutan awal supaya tidak ada kegiatan yang gagal dihitung.
     *
     * @param string[] $nodes
     * @return string[]
     */
    private function topoSort(array $nodes, array $preds): array
    {
        $indeg = array_fill_keys($nodes, 0);
        foreach ($preds as $taskId => $deps) {
            foreach ($deps as $dep) {
                $predId = $dep['predecessor_id'];
                if (isset($indeg[$taskId]) && isset($indeg[$predId]) && $predId !== $taskId) {
                    $indeg[$taskId]++;
                }
            }
        }

        $queue = array_values(array_filter($nodes, fn ($id) => $indeg[$id] === 0));
        $order = [];
        $seen = [];

        while ($queue !== []) {
            $id = array_shift($queue);
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $order[] = $id;

            foreach ($preds as $taskId => $deps) {
                foreach ($deps as $dep) {
                    if ($dep['predecessor_id'] !== $id || isset($seen[$taskId])) {
                        continue;
                    }
                    $indeg[$taskId]--;
                    if ($indeg[$taskId] === 0) {
                        $queue[] = $taskId;
                    }
                }
            }
        }

        foreach ($nodes as $id) {
            if (! isset($seen[$id])) {
                $order[] = $id;
            }
        }

        return $order;
    }

    private function fmt($value): string
    {
        if ($value instanceof \Carbon\CarbonInterface) {
            return $value->format('Y-m-d');
        }

        return substr((string) $value, 0, 10);
    }
}
