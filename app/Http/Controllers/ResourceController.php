<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Resource;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ResourceController extends Controller
{
    public function __construct(private ProjectService $service)
    {
    }

    /** Tambah anggota tim (FR-35..FR-38). */
    public function store(Request $request, Project $project): JsonResponse
    {
        $validated = $this->validateResource($request);

        $resource = DB::transaction(function () use ($project, $validated) {
            $resource = Resource::create([
                'id' => (string) Str::uuid(),
                'project_id' => $project->id,
                'name' => $validated['name'],
                'phone' => $validated['phone'] ?? null,
                'email' => $validated['email'] ?? null,
                'default_role' => $validated['default_role'] ?? null,
                'standard_rate' => $validated['standard_rate'] ?? 0,
                'color' => $validated['color'] ?? null,
            ]);

            $this->syncDaysOff($resource, $validated['days_off'] ?? []);

            return $resource;
        });

        $state = $this->service->commit($project, 'created', 'resource', $resource->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state, 'id' => $resource->id], 201);
    }

    public function update(Request $request, Project $project, Resource $resource): JsonResponse
    {
        abort_if($resource->project_id !== $project->id, 404);

        $validated = $this->validateResource($request);

        DB::transaction(function () use ($resource, $validated) {
            $resource->fill([
                'name' => $validated['name'] ?? $resource->name,
                'phone' => array_key_exists('phone', $validated) ? $validated['phone'] : $resource->phone,
                'email' => array_key_exists('email', $validated) ? $validated['email'] : $resource->email,
                'default_role' => array_key_exists('default_role', $validated) ? $validated['default_role'] : $resource->default_role,
                'standard_rate' => array_key_exists('standard_rate', $validated) ? $validated['standard_rate'] : $resource->standard_rate,
                'color' => array_key_exists('color', $validated) ? $validated['color'] : $resource->color,
            ]);
            $resource->save();

            if (array_key_exists('days_off', $validated)) {
                $this->syncDaysOff($resource, $validated['days_off'] ?? []);
            }
        });

        $state = $this->service->commit($project, 'updated', 'resource', $resource->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }

    public function destroy(Request $request, Project $project, Resource $resource): JsonResponse
    {
        abort_if($resource->project_id !== $project->id, 404);

        $resource->delete();

        $state = $this->service->commit($project, 'deleted', 'resource', $resource->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }

    private function validateResource(Request $request): array
    {
        return $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'phone' => 'sometimes|nullable|string|max:64',
            'email' => 'sometimes|nullable|email|max:255',
            'default_role' => 'sometimes|nullable|string|max:64',
            'standard_rate' => 'sometimes|nullable|numeric|min:0|max:1000000000',
            'color' => 'sometimes|nullable|string|max:32',
            'days_off' => 'sometimes|array',
            'days_off.*.start_date' => 'required|string|date',
            'days_off.*.end_date' => 'required|string|date',
        ]);
    }

    private function syncDaysOff(Resource $resource, array $daysOff): void
    {
        $resource->daysOff()->delete();

        foreach ($daysOff as $dayOff) {
            if (empty($dayOff['start_date'])) {
                continue;
            }
            $resource->daysOff()->create([
                'start_date' => $dayOff['start_date'],
                'end_date' => $dayOff['end_date'] ?: $dayOff['start_date'],
            ]);
        }
    }
}
