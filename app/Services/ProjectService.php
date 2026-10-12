<?php

namespace App\Services;

use App\Events\ProjectChanged;
use App\Models\Calendar;
use App\Models\ChangeLog;
use App\Models\Dependency;
use App\Models\Holiday;
use App\Models\Project;
use App\Models\Resource;
use App\Models\ResourceDayOff;
use App\Models\Task;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Orkestrator perubahan proyek: menjalankan mesin penjadwalan,
 * menyimpan hasilnya, menaikkan nomor revisi, dan menyiarkan state
 * terbaru ke semua pengguna proyek yang sama (FR-53, FR-55, FR-57).
 */
class ProjectService
{
    /** @var array<string, array> cache hasil engine per request */
    private array $computed = [];


    /** Template enam tahap pembangunan perangkat lunak (PRD 7.8). */
    public const TEMPLATE = [
        ['name' => 'Requirement gathering', 'duration' => 5, 'notes' => 'Analisis kebutuhan lewat survei, tanya jawab, dan wawancara pengguna'],
        ['name' => 'System analysis', 'duration' => 8, 'notes' => 'Menganalisis spesifikasi yang didapat bersama anggota tim'],
        ['name' => 'Design', 'duration' => 7, 'notes' => 'Perancangan antarmuka, basis data, pseudo code, dan lain-lain'],
        ['name' => 'Implementation', 'duration' => 10, 'notes' => 'Fase coding'],
        ['name' => 'Testing', 'duration' => 5, 'notes' => 'Pengujian input/output (black box) dan pengecekan kode (white box)'],
        ['name' => 'Deploy and implementation', 'duration' => 3, 'notes' => 'Instalasi perangkat lunak yang telah dibuat'],
    ];

    public function createProject(array $data, bool $withTemplate = true): Project
    {
        return DB::transaction(function () use ($data, $withTemplate) {
            $project = Project::create([
                'id' => (string) Str::uuid(),
                'name' => $data['name'],
                'organization' => $data['organization'] ?? null,
                'web_url' => $data['web_url'] ?? null,
                'description' => $data['description'] ?? null,
                'start_date' => $data['start_date'] ?? now()->format('Y-m-d'),
                'date_format' => $data['date_format'] ?? 'DD MMM YYYY',
            ]);

            $this->createCalendar($project, $data);

            if ($withTemplate) {
                $this->createTemplateTasks($project, $data['start_date'] ?? now()->format('Y-m-d'));
            }

            $project->revision = 1;
            $project->save();

            return $project;
        });
    }

    public function createCalendar(Project $project, array $data): Calendar
    {
        $calendar = Calendar::updateOrCreate(
            ['project_id' => $project->id],
            [
                'weekend_days' => $data['weekend_days'] ?? [0, 6],
                'weekends_work' => (bool) ($data['weekends_work'] ?? false),
                'holiday_mode' => $data['holiday_mode'] ?? 'none',
            ],
        );

        if (! empty($data['holidays']) && is_array($data['holidays'])) {
            $calendar->holidays()->delete();
            foreach ($data['holidays'] as $holiday) {
                if (empty($holiday['date'])) {
                    continue;
                }
                Holiday::create([
                    'calendar_id' => $calendar->id,
                    'name' => $holiday['name'] ?? 'Hari libur',
                    'date' => $holiday['date'],
                    'type' => ($holiday['type'] ?? 'one-off') === 'recurring' ? 'recurring' : 'one-off',
                ]);
            }
        }

        return $calendar->load('holidays');
    }

    /** Enam tahap standar berantai Finish-to-Start (PRD 7.8). */
    public function createTemplateTasks(Project $project, string $startDate): void
    {
        $previous = null;
        foreach (self::TEMPLATE as $index => $stage) {
            $task = Task::create([
                'id' => (string) Str::uuid(),
                'project_id' => $project->id,
                'name' => $stage['name'],
                'begin_date' => $startDate,
                'end_date' => $startDate,
                'duration' => $stage['duration'],
                'notes' => $stage['notes'] ?? null,
                'position' => $index,
            ]);

            if ($previous !== null) {
                Dependency::create([
                    'project_id' => $project->id,
                    'task_id' => $task->id,
                    'predecessor_id' => $previous,
                    'type' => 'FS',
                    'delay' => 0,
                ]);
            }
            $previous = $task->id;
        }
    }

    /**
     * Jalankan mesin penjadwalan dan simpan tanggal yang berubah.
     *
     * @return array<string, array{begin_date:string, end_date:string, duration:int, critical:bool}>
     */
    public function reschedule(Project $project): array
    {
        $calendar = $project->calendar()->with('holidays')->first();
        $tasks = $project->tasks()->get();
        $dependencies = $project->dependencies()->get();

        $engine = new ScheduleEngine($this->calendar($calendar), $this->engineTasks($tasks), $this->engineDeps($dependencies));
        $result = $engine->compute();

        foreach ($tasks as $task) {
            $computed = $result['tasks'][$task->id] ?? null;
            if (! $computed) {
                continue;
            }
            $begin = $computed['begin_date'];
            $end = $computed['end_date'];

            if ($task->begin_date->format('Y-m-d') !== $begin
                || $task->end_date->format('Y-m-d') !== $end
                || (int) $task->duration !== (int) $computed['duration']) {
                $task->begin_date = $begin;
                $task->end_date = $end;
                $task->duration = $computed['duration'];
                $task->save();
            }
        }

        $this->computed[$project->id] = ['revision' => (int) $project->revision, 'result' => $result];

        return $result;
    }

    /**
     * Naikkan revisi, catat perubahan, siarkan state terbaru (last-write-wins).
     *
     * @return array state proyek terbaru
     */
    public function commit(
        Project $project,
        string $action = 'updated',
        string $objectType = 'project',
        ?string $objectId = null,
        ?string $clientId = null,
        ?array $payload = null,
    ): array {
        $this->reschedule($project);

        $project->revision = (int) $project->revision + 1;
        $project->save();

        // Hasil reschedule di atas masih valid untuk revisi baru.
        if (isset($this->computed[$project->id])) {
            $this->computed[$project->id]['revision'] = (int) $project->revision;
        }

        ChangeLog::create([
            'project_id' => $project->id,
            'revision' => $project->revision,
            'action' => $action,
            'object_type' => $objectType,
            'object_id' => $objectId,
            'payload' => $payload,
            'display_name' => $clientId,
            'created_at' => now(),
        ]);

        $state = $this->state($project);

        // Server Reverb bisa sedang tidak hidup; kegagalan siaran tidak boleh
        // membatalkan penyimpanan (state sudah tersimpan dan revisi sudah naik).
        try {
            $pending = broadcast(new ProjectChanged(
                $project->id,
                (int) $project->revision,
                $state,
                $clientId,
                $action,
                $objectType,
                $objectId,
            ));
            unset($pending); // dispatch terjadi di destructor, tetap di dalam try
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Broadcast ProjectChanged gagal: ' . $e->getMessage());
        }

        return $state;
    }

    /**
     * Ambil hasil hitung yang masih valid (revisi sama) untuk proyek.
     * Instance service bisa bertahan lintas permintaan, jadi cache wajib
     * dicek terhadap revisi proyek saat ini.
     */
    private function computedFor(Project $project): ?array
    {
        $entry = $this->computed[$project->id] ?? null;
        if ($entry === null || (int) ($entry['revision'] ?? -1) !== (int) $project->revision) {
            return null;
        }

        return $entry['result'];
    }

    /** State lengkap proyek yang dikirim ke klien. */
    public function state(Project $project): array
    {
        $project->refresh();
        $calendar = $project->calendar()->with('holidays')->first();
        $tasks = $project->tasks()->get();
        $dependencies = $project->dependencies()->get();
        $resources = $project->resources()->with('daysOff')->get();

        $computed = $this->computedFor($project);
        if ($computed === null) {
            $engine = new ScheduleEngine($this->calendar($calendar), $this->engineTasks($tasks), $this->engineDeps($dependencies));
            $computed = $engine->compute();
            $this->computed[$project->id] = ['revision' => (int) $project->revision, 'result' => $computed];
        }

        $assignments = [];
        foreach (\App\Models\Assignment::whereIn('task_id', $tasks->pluck('id'))->get() as $assignment) {
            $assignments[$assignment->task_id][] = [
                'resource_id' => $assignment->resource_id,
                'units' => (int) $assignment->units,
            ];
        }

        $taskData = $tasks->map(function (Task $task) use ($computed, $assignments) {
            $info = $computed['tasks'][$task->id] ?? null;

            return [
                'id' => $task->id,
                'parent_id' => $task->parent_id,
                'name' => $task->name,
                'milestone' => (bool) $task->milestone,
                'manual_begin' => (bool) $task->manual_begin,
                'begin_date' => $info['begin_date'] ?? $task->begin_date->format('Y-m-d'),
                'end_date' => $info['end_date'] ?? $task->end_date->format('Y-m-d'),
                'duration' => (int) ($info['duration'] ?? $task->duration),
                'constraint' => $task->constraint,
                'priority' => $task->priority,
                'progress' => (int) $task->progress,
                'show_in_timeline' => (bool) $task->show_in_timeline,
                'shape' => $task->shape,
                'color' => $task->color,
                'web_link' => $task->web_link,
                'notes' => $task->notes,
                'position' => (int) $task->position,
                'critical' => (bool) ($info['critical'] ?? false),
                'resource_ids' => array_values(array_map(fn ($a) => $a['resource_id'], $assignments[$task->id] ?? [])),
            ];
        })->values();

        return [
            'revision' => (int) $project->revision,
            'project' => [
                'id' => $project->id,
                'name' => $project->name,
                'organization' => $project->organization,
                'web_url' => $project->web_url,
                'description' => $project->description,
                'start_date' => $project->start_date?->format('Y-m-d'),
                'date_format' => $project->date_format,
                'revision' => (int) $project->revision,
            ],
            'calendar' => [
                'weekend_days' => $calendar->weekend_days ?? [0, 6],
                'weekends_work' => (bool) ($calendar->weekends_work ?? false),
                'holiday_mode' => $calendar->holiday_mode ?? 'none',
                'holidays' => ($calendar->holidays ?? collect())->map(fn (Holiday $holiday) => [
                    'id' => $holiday->id,
                    'name' => $holiday->name,
                    'date' => $holiday->date->format('Y-m-d'),
                    'type' => $holiday->type,
                ])->values(),
            ],
            'tasks' => $taskData,
            'dependencies' => $dependencies->map(fn (Dependency $dependency) => [
                'id' => $dependency->id,
                'task_id' => $dependency->task_id,
                'predecessor_id' => $dependency->predecessor_id,
                'type' => $dependency->type,
                'delay' => (int) $dependency->delay,
            ])->values(),
            'resources' => $resources->map(fn (Resource $resource) => [
                'id' => $resource->id,
                'name' => $resource->name,
                'phone' => $resource->phone,
                'email' => $resource->email,
                'default_role' => $resource->default_role,
                'standard_rate' => (float) $resource->standard_rate,
                'color' => $resource->color,
                'days_off' => $resource->daysOff->map(fn (ResourceDayOff $dayOff) => [
                    'id' => $dayOff->id,
                    'start_date' => $dayOff->start_date->format('Y-m-d'),
                    'end_date' => $dayOff->end_date->format('Y-m-d'),
                ])->values(),
                'assignments' => $this->assignmentsFor($assignments, $resource->id),
            ])->values(),
            'project_start' => $computed['project_start'],
            'project_end' => $computed['project_end'],
        ];
    }

    public function calendar(?Calendar $calendar): WorkingCalendar
    {
        if (! $calendar) {
            return new WorkingCalendar([0, 6], false, [], false);
        }

        $holidays = $calendar->holidays->map(fn (Holiday $holiday) => [
            'date' => $holiday->date->format('Y-m-d'),
            'type' => $holiday->type,
        ])->all();

        return new WorkingCalendar(
            $calendar->weekend_days ?? [0, 6],
            (bool) $calendar->weekends_work,
            $holidays,
            ($calendar->holiday_mode ?? 'none') === 'custom',
        );
    }

    /** @return array<int, array<string, mixed>> */
    private function engineTasks($tasks): array
    {
        return $tasks->map(fn (Task $task) => [
            'id' => $task->id,
            'parent_id' => $task->parent_id,
            'begin_date' => $task->begin_date->format('Y-m-d'),
            'end_date' => $task->end_date->format('Y-m-d'),
            'duration' => (int) $task->duration,
            'milestone' => (bool) $task->milestone,
            'manual_begin' => (bool) $task->manual_begin,
        ])->all();
    }

    /**
     * Penugasan satu resource (untuk Resources chart & deteksi bentrok cuti).
     *
     * @return array<int, array{task_id:string, units:int}>
     */
    private function assignmentsFor(array $assignments, string $resourceId): array
    {
        $result = [];
        foreach ($assignments as $taskId => $list) {
            foreach ($list as $item) {
                if ($item['resource_id'] === $resourceId) {
                    $result[] = ['task_id' => $taskId, 'units' => $item['units']];
                }
            }
        }

        return $result;
    }

    /** @return array<int, array<string, mixed>> */
    private function engineDeps($dependencies): array
    {
        return $dependencies->map(fn (Dependency $dependency) => [
            'task_id' => $dependency->task_id,
            'predecessor_id' => $dependency->predecessor_id,
            'type' => $dependency->type,
            'delay' => (int) $dependency->delay,
        ])->all();
    }
}
