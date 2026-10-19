<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ProjectController extends Controller
{
    public function __construct(private ProjectService $service)
    {
    }

    /** Daftar proyek tersimpan tampil tanpa halaman login (FR-54). */
    public function index(): Response
    {
        return Inertia::render('Projects/Index', [
            'projects' => Project::orderByDesc('updated_at')
                ->get(['id', 'name', 'organization', 'description', 'revision', 'created_at', 'updated_at'])
                ->map(fn (Project $project) => [
                    'id' => $project->id,
                    'name' => $project->name,
                    'organization' => $project->organization,
                    'description' => $project->description,
                    'revision' => (int) $project->revision,
                    'updated_at' => $project->updated_at->toDateTimeString(),
                ]),
        ]);
    }

    /** Layar utama workspace proyek. */
    public function show(Project $project): Response
    {
        return Inertia::render('Projects/Workspace', [
            'state' => $this->service->state($project),
        ]);
    }

    /** Wizard dua langkah: data proyek + kalender kerja (FR-01..FR-03). */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'organization' => 'nullable|string|max:255',
            'web_url' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'start_date' => 'nullable|date',
            'date_format' => 'nullable|string|max:32',
            'weekend_days' => 'nullable|array',
            'weekend_days.*' => 'integer|between:0,6',
            'weekends_work' => 'nullable|boolean',
            'holiday_mode' => 'nullable|in:none,custom',
            'holidays' => 'nullable|array',
            'holidays.*.name' => 'nullable|string|max:255',
            'holidays.*.date' => 'required|string|date',
            'holidays.*.type' => 'nullable|in:one-off,recurring',
            'use_template' => 'nullable|boolean',
        ]);

        $project = $this->service->createProject($validated, (bool) ($validated['use_template'] ?? true));
        $this->service->commit($project, 'created', 'project', $project->id, $request->header('X-Client-Id'));

        return response()->json(['id' => $project->id], 201);
    }

    /** Ubah properti proyek dan/atau kalender kerja (FR-06, FR-11..FR-15). */
    public function update(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|nullable|string|max:255',
            'organization' => 'sometimes|nullable|string|max:255',
            'web_url' => 'sometimes|nullable|string|max:255',
            'description' => 'sometimes|nullable|string',
            'start_date' => 'sometimes|nullable|date',
            'date_format' => 'sometimes|nullable|string|max:32',
            'weekend_days' => 'sometimes|array',
            'weekend_days.*' => 'integer|between:0,6',
            'weekends_work' => 'sometimes|boolean',
            'holiday_mode' => 'sometimes|in:none,custom',
            'holidays' => 'sometimes|array',
            'holidays.*.name' => 'nullable|string|max:255',
            'holidays.*.date' => 'required|string|date',
            'holidays.*.type' => 'nullable|in:one-off,recurring',
        ]);

        $calendarKeys = ['weekend_days', 'weekends_work', 'holiday_mode', 'holidays'];
        $calendarData = array_intersect_key($validated, array_flip($calendarKeys));

        DB::transaction(function () use ($project, $validated, $calendarData, $calendarKeys) {
            if ($calendarData !== []) {
                $this->service->createCalendar($project, $calendarData);
            }

            $project->fill(ArrExcept($validated, $calendarKeys));
            $project->save();
        });

        $state = $this->service->commit($project, 'updated', 'project', $project->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }

    public function destroy(Request $request, Project $project): JsonResponse
    {
        $project->delete();

        return response()->json(['ok' => true]);
    }

    /** Save As: salin proyek aktif ke proyek baru (FR-04). */
    public function duplicate(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate(['name' => 'required|string|max:255']);

        $copy = DB::transaction(function () use ($project, $validated) {
            $new = Project::create([
                'name' => $validated['name'],
                'organization' => $project->organization,
                'web_url' => $project->web_url,
                'description' => $project->description,
                'start_date' => $project->start_date?->format('Y-m-d'),
                'date_format' => $project->date_format,
            ]);

            $calendar = $project->calendar()->with('holidays')->first();
            if ($calendar) {
                $newCalendar = $new->calendar()->create([
                    'weekend_days' => $calendar->weekend_days,
                    'weekends_work' => $calendar->weekends_work,
                    'holiday_mode' => $calendar->holiday_mode,
                ]);
                foreach ($calendar->holidays as $holiday) {
                    $newCalendar->holidays()->create([
                        'name' => $holiday->name,
                        'date' => $holiday->date->format('Y-m-d'),
                        'type' => $holiday->type,
                    ]);
                }
            }

            $map = [];
            foreach ($project->tasks()->orderBy('position')->get() as $task) {
                $oldId = $task->id;
                $newTask = $task->replicate(['id', 'project_id', 'parent_id']);
                $newTask->id = (string) \Illuminate\Support\Str::uuid();
                $newTask->project_id = $new->id;
                $newTask->parent_id = null;
                $newTask->save();
                $map[$oldId] = $newTask->id;
            }

            foreach ($project->tasks()->get() as $task) {
                if ($task->parent_id && isset($map[$task->parent_id])) {
                    \App\Models\Task::where('id', $map[$task->id])->update(['parent_id' => $map[$task->parent_id]]);
                }
            }

            foreach ($project->dependencies as $dependency) {
                if (isset($map[$dependency->task_id], $map[$dependency->predecessor_id])) {
                    $new->dependencies()->create([
                        'task_id' => $map[$dependency->task_id],
                        'predecessor_id' => $map[$dependency->predecessor_id],
                        'type' => $dependency->type,
                        'delay' => $dependency->delay,
                    ]);
                }
            }

            $resourceMap = [];
            $columnMap = [];
            foreach ($project->customColumns as $column) {
                $newColumn = $column->replicate(['id', 'project_id']);
                $newColumn->id = (string) \Illuminate\Support\Str::uuid();
                $newColumn->project_id = $new->id;
                $newColumn->save();
                $columnMap[$column->id] = $newColumn->id;
            }

            foreach ($project->resources as $resource) {
                $newResource = $resource->replicate(['id', 'project_id']);
                $newResource->id = (string) \Illuminate\Support\Str::uuid();
                $newResource->project_id = $new->id;

                // Nilai kolom tambahan ikut dipindahkan dengan kunci kolom baru.
                $values = [];
                foreach ($resource->custom_values ?? [] as $key => $value) {
                    $values[$columnMap[$key] ?? $key] = $value;
                }
                $newResource->custom_values = $values === [] ? null : $values;

                $newResource->save();
                $resourceMap[$resource->id] = $newResource->id;

                foreach ($resource->daysOff as $dayOff) {
                    $newResource->daysOff()->create([
                        'start_date' => $dayOff->start_date->format('Y-m-d'),
                        'end_date' => $dayOff->end_date->format('Y-m-d'),
                    ]);
                }
            }

            foreach (\App\Models\Assignment::whereIn('task_id', array_keys($map))->get() as $assignment) {
                if (isset($resourceMap[$assignment->resource_id])) {
                    \App\Models\Assignment::create([
                        'task_id' => $map[$assignment->task_id],
                        'resource_id' => $resourceMap[$assignment->resource_id],
                        'units' => $assignment->units,
                    ]);
                }
            }

            $new->revision = 1;
            $new->save();

            return $new;
        });

        return response()->json(['id' => $copy->id], 201);
    }
}

/**
 * Helper: buang kunci array.
 */
function ArrExcept(array $array, array $keys): array
{
    foreach ($keys as $key) {
        unset($array[$key]);
    }

    return $array;
}
