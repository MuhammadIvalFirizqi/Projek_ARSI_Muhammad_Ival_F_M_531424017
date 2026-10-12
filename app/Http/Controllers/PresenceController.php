<?php

namespace App\Http\Controllers;

use App\Events\ProjectPresence;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PresenceController extends Controller
{
    /** Siarkan kehadiran / penanda sedang diedit / pratinjau geser (FR-59, FR-60, FR-64). */
    public function update(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'event' => 'required|in:join,ping,leave,editing,clear_editing,live_preview',
            'name' => 'nullable|string|max:64',
            'color' => 'nullable|string|max:32',
            'task_id' => 'nullable|string|max:64',
            'payload' => 'nullable|array',
        ]);

        $clientId = (string) $request->header('X-Client-Id', 'anonymous');

        // Siaran presence bersifat best-effort: server Reverb bisa tidak hidup.
        try {
            $pending = broadcast(new ProjectPresence(
                $project->id,
                $clientId,
                $validated['event'],
                array_filter([
                    'name' => $validated['name'] ?? null,
                    'color' => $validated['color'] ?? null,
                    'task_id' => $validated['task_id'] ?? null,
                    'payload' => $validated['payload'] ?? null,
                ], fn ($value) => $value !== null),
            ));
            unset($pending); // dispatch terjadi di destructor, tetap di dalam try
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Broadcast ProjectPresence gagal: ' . $e->getMessage());
        }

        return response()->json(['ok' => true]);
    }
}
