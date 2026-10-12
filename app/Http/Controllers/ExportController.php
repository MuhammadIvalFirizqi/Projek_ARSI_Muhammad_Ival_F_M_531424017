<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\ProjectService;
use Symfony\Component\HttpFoundation\Response;

class ExportController extends Controller
{
    public function __construct(private ProjectService $service)
    {
    }

    /** Ekspor proyek ke CSV atau JSON (FR-07). */
    public function export(Project $project, string $format): Response
    {
        $state = $this->service->state($project);
        $slug = preg_replace('/[^A-Za-z0-9\-]+/', '-', strtolower($project->name)) ?: 'proyek';

        if ($format === 'json') {
            return response(
                json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
                200,
                [
                    'Content-Type' => 'application/json',
                    'Content-Disposition' => 'attachment; filename="'.$slug.'.json"',
                ],
            );
        }

        if ($format === 'csv') {
            $resources = collect($state['resources'])->keyBy('id');

            $rows = [[
                'Name', 'Begin date', 'End date', 'Duration (hari kerja)',
                'Progress (%)', 'Priority', 'Milestone', 'Critical', 'Resources',
            ]];

            foreach ($state['tasks'] as $task) {
                $assigned = collect($task['resource_ids'])
                    ->map(fn ($id) => $resources[$id]['name'] ?? '')
                    ->implode('; ');

                $rows[] = [
                    $task['name'],
                    $task['begin_date'],
                    $task['end_date'],
                    $task['duration'],
                    $task['progress'],
                    $task['priority'],
                    $task['milestone'] ? 'yes' : 'no',
                    $task['critical'] ? 'yes' : 'no',
                    $assigned,
                ];
            }

            $stream = fopen('php://temp', 'r+');
            foreach ($rows as $row) {
                fputcsv($stream, $row, ';');
            }
            rewind($stream);
            $csv = stream_get_contents($stream) ?: '';
            fclose($stream);

            return response($csv, 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="'.$slug.'.csv"',
            ]);
        }

        abort(404, 'Format ekspor tidak dikenal: '.$format);
    }
}
