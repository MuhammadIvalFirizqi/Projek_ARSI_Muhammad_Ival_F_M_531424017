<?php

namespace App\Http\Controllers;

use App\Models\Dependency;
use App\Models\Project;
use App\Models\Task;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DependencyController extends Controller
{
    public function __construct(private ProjectService $service)
    {
    }

    /** Buat/kirim dependensi Finish-to-Start atau Start-to-Start dengan delay (FR-31, FR-42). */
    public function store(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'id' => 'nullable|string|max:64',
            'task_id' => 'required|string|exists:tasks,id',
            'predecessor_id' => 'required|string|exists:tasks,id',
            'type' => 'required|in:FS,SS',
            'delay' => 'nullable|integer|min:0|max:1000',
        ]);

        abort_if($validated['task_id'] === $validated['predecessor_id'], 422, 'Kegiatan tidak boleh bergantung pada dirinya sendiri.');

        $task = Task::where('project_id', $project->id)->findOrFail($validated['task_id']);
        $predecessor = Task::where('project_id', $project->id)->findOrFail($validated['predecessor_id']);

        $attributes = [
            'project_id' => $project->id,
            'task_id' => $task->id,
            'predecessor_id' => $predecessor->id,
            'type' => $validated['type'],
            'delay' => (int) ($validated['delay'] ?? 0),
        ];

        $dependency = Dependency::where('task_id', $task->id)
            ->where('predecessor_id', $predecessor->id)
            ->first();

        if ($dependency) {
            $dependency->fill(['type' => $attributes['type'], 'delay' => $attributes['delay']]);
            $dependency->save();
        } else {
            if (! empty($validated['id'])) {
                $attributes['id'] = $validated['id'];
            }
            $dependency = Dependency::create($attributes);
        }

        $state = $this->service->commit($project, 'created', 'dependency', (string) $dependency->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state, 'id' => $dependency->id], 201);
    }

    public function update(Request $request, Project $project, Dependency $dependency): JsonResponse
    {
        abort_if($dependency->project_id !== $project->id, 404);

        $validated = $request->validate([
            'type' => 'sometimes|in:FS,SS',
            'delay' => 'sometimes|integer|min:0|max:1000',
        ]);

        $dependency->fill($validated);
        $dependency->save();

        $state = $this->service->commit($project, 'updated', 'dependency', (string) $dependency->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }

    public function destroy(Request $request, Project $project, Dependency $dependency): JsonResponse
    {
        abort_if($dependency->project_id !== $project->id, 404);

        $dependency->delete();

        $state = $this->service->commit($project, 'deleted', 'dependency', (string) $dependency->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }
}
