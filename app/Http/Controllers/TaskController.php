<?php

namespace App\Http\Controllers;

use App\Models\Dependency;
use App\Models\Project;
use App\Models\Resource;
use App\Models\Task;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TaskController extends Controller
{
    public function __construct(private ProjectService $service)
    {
    }

    /** Kegiatan baru (FR-27). */
    public function store(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'id' => 'nullable|string|max:64',
            'name' => 'required|string|max:255',
            'begin_date' => 'nullable|date',
            'duration' => 'nullable|integer|min:0|max:10000',
            'parent_id' => 'nullable|exists:tasks,id',
            'milestone' => 'nullable|boolean',
            'priority' => 'nullable|string|max:32',
            'progress' => 'nullable|integer|between:0,100',
            'color' => 'nullable|string|max:32',
            'shape' => 'nullable|string|max:32',
            'constraint' => 'nullable|string|max:64',
            'web_link' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'position' => 'nullable|integer|min:0',
            'show_in_timeline' => 'nullable|boolean',
            'resource_ids' => 'nullable|array',
            'resource_ids.*' => 'exists:resources,id',
        ]);

        $begin = $validated['begin_date'] ?? $project->start_date?->format('Y-m-d') ?? now()->format('Y-m-d');

        $task = Task::create([
            'id' => $validated['id'] ?? (string) Str::uuid(),
            'project_id' => $project->id,
            'parent_id' => $validated['parent_id'] ?? null,
            'name' => $validated['name'],
            'begin_date' => $begin,
            'end_date' => $begin,
            'duration' => $validated['duration'] ?? 1,
            'milestone' => (bool) ($validated['milestone'] ?? false),
            'priority' => $validated['priority'] ?? 'Normal',
            'progress' => $validated['progress'] ?? 0,
            'color' => $validated['color'] ?? null,
            'shape' => $validated['shape'] ?? 'bar',
            'constraint' => $validated['constraint'] ?? null,
            'web_link' => $validated['web_link'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'show_in_timeline' => $validated['show_in_timeline'] ?? true,
            'position' => $validated['position'] ?? ((int) $project->tasks()->whereNull('parent_id')->max('position') + 1),
        ]);

        $this->syncResources($task, $validated['resource_ids'] ?? []);

        $state = $this->service->commit($project, 'created', 'task', $task->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state, 'id' => $task->id], 201);
    }

    /** Ubah properti kegiatan (FR-28..FR-32, FR-42). */
    public function update(Request $request, Project $project, Task $task): JsonResponse
    {
        abort_if($task->project_id !== $project->id, 404);
        $validated = $request->validate([
            'name' => 'sometimes|nullable|string|max:255',
            'begin_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
            'duration' => 'sometimes|nullable|integer|min:0|max:10000',
            'milestone' => 'sometimes|boolean',
            'manual_begin' => 'sometimes|boolean',
            'priority' => 'sometimes|nullable|string|max:32',
            'progress' => 'sometimes|nullable|integer|between:0,100',
            'constraint' => 'sometimes|nullable|string|max:64',
            'show_in_timeline' => 'sometimes|boolean',
            'shape' => 'sometimes|nullable|string|max:32',
            'color' => 'sometimes|nullable|string|max:32',
            'web_link' => 'sometimes|nullable|string|max:255',
            'notes' => 'sometimes|nullable|string',
            'resource_ids' => 'sometimes|array',
            'resource_ids.*' => 'exists:resources,id',
        ]);

        $begin = $validated['begin_date'] ?? $task->begin_date->format('Y-m-d');

        // End date dihitung dari Begin date + Duration (FR-30).
        // Bila pengguna mengedit End date langsung, durasi ditarik dari rentang hari kerja.
        if (array_key_exists('duration', $validated) && $validated['duration'] !== null) {
            $duration = (int) $validated['duration'];
        } elseif (array_key_exists('end_date', $validated) && $validated['end_date'] !== null) {
            $calendar = $this->service->calendar($project->calendar()->with('holidays')->first());
            $duration = $calendar->durationBetween($begin, $validated['end_date']);
        } else {
            $duration = (int) $task->duration;
        }

        if (! empty($validated['milestone'])) {
            $duration = 0;
        }

        $task->name = $validated['name'] ?? $task->name;
        $task->begin_date = $begin;
        $task->duration = $duration;
        $task->milestone = array_key_exists('milestone', $validated) ? (bool) $validated['milestone'] : $task->milestone;
        $task->manual_begin = array_key_exists('manual_begin', $validated) ? (bool) $validated['manual_begin'] : $task->manual_begin;
        $task->priority = $validated['priority'] ?? $task->priority;
        $task->progress = $validated['progress'] ?? $task->progress;
        $task->constraint = $validated['constraint'] ?? $task->constraint;
        $task->show_in_timeline = array_key_exists('show_in_timeline', $validated) ? (bool) $validated['show_in_timeline'] : $task->show_in_timeline;
        $task->shape = $validated['shape'] ?? $task->shape;
        $task->color = $validated['color'] ?? $task->color;
        $task->web_link = $validated['web_link'] ?? $task->web_link;
        $task->notes = $validated['notes'] ?? $task->notes;
        $task->save();

        if (array_key_exists('resource_ids', $validated)) {
            $this->syncResources($task, $validated['resource_ids'] ?? []);
        }

        $state = $this->service->commit($project, 'updated', 'task', $task->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }

    public function destroy(Request $request, Project $project, Task $task): JsonResponse
    {
        abort_if($task->project_id !== $project->id, 404);
        DB::transaction(function () use ($task) {
            $task->children()->delete();
            $task->delete();
        });

        $state = $this->service->commit($project, 'deleted', 'task', $task->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }

    /** Ubah urutan dan tingkat sub-kegiatan (FR-48). */
    public function reorder(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array',
            'items.*.id' => 'required|string|exists:tasks,id',
            'items.*.parent_id' => 'nullable|string',
            'items.*.position' => 'required|integer|min:0',
        ]);

        DB::transaction(function () use ($validated) {
            foreach ($validated['items'] as $item) {
                Task::where('id', $item['id'])->update([
                    'parent_id' => $item['parent_id'] ?? null,
                    'position' => $item['position'],
                ]);
            }
        });

        $state = $this->service->commit($project, 'reordered', 'task', null, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }

    private function syncResources(Task $task, array $resourceIds): void
    {
        $existing = [];
        foreach ($task->resources as $resource) {
            $existing[$resource->id] = ['units' => $resource->pivot->units];
        }

        $sync = [];
        foreach (array_unique($resourceIds) as $resourceId) {
            $sync[$resourceId] = ['units' => $existing[$resourceId]['units'] ?? 100];
        }

        $task->resources()->sync($sync);
    }
}
