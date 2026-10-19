<?php

namespace App\Http\Controllers;

use App\Models\CustomColumn;
use App\Models\Project;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CustomColumnController extends Controller
{
    public function __construct(private ProjectService $service)
    {
    }

    /** Tambah kolom tambahan buatan pengguna (FR-33 task, FR-39 resource). */
    public function store(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'id' => 'nullable|string|max:64',
            'name' => 'required|string|max:64',
            'type' => 'sometimes|in:text,number,date,boolean',
            'target' => 'sometimes|in:resource,task',
        ]);

        $target = $validated['target'] ?? 'resource';

        $column = CustomColumn::create([
            'id' => $validated['id'] ?? (string) Str::uuid(),
            'project_id' => $project->id,
            'target' => $target,
            'name' => $validated['name'],
            'type' => $validated['type'] ?? 'text',
            'position' => (int) $project->customColumns()->where('target', $target)->count(),
        ]);

        $state = $this->service->commit($project, 'created', 'custom_column', $column->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state, 'id' => $column->id], 201);
    }

    /** Ubah nama/tipe kolom. */
    public function update(Request $request, Project $project, CustomColumn $customColumn): JsonResponse
    {
        abort_if($customColumn->project_id !== $project->id, 404);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:64',
            'type' => 'sometimes|in:text,number,date,boolean',
        ]);

        $customColumn->fill($validated);
        $customColumn->save();

        $state = $this->service->commit($project, 'updated', 'custom_column', $customColumn->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }

    /**
     * Hapus kolom beserta nilainya pada semua resource proyek.
     * Nilai ikut terhapus agar tidak menyimpan data yatim; aksi undo di klien
     * mengirim ulang kolom beserta nilai tersimpannya.
     */
    public function destroy(Request $request, Project $project, CustomColumn $customColumn): JsonResponse
    {
        abort_if($customColumn->project_id !== $project->id, 404);

        DB::transaction(function () use ($project, $customColumn) {
            foreach ($project->resources as $resource) {
                $values = $resource->custom_values ?? [];
                if (! is_array($values) || ! array_key_exists($customColumn->id, $values)) {
                    continue;
                }
                unset($values[$customColumn->id]);
                $resource->custom_values = $values === [] ? null : $values;
                $resource->save();
            }

            $customColumn->delete();
        });

        $state = $this->service->commit($project, 'deleted', 'custom_column', $customColumn->id, $request->header('X-Client-Id'));

        return response()->json(['state' => $state]);
    }
}
