<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Kriteria penerimaan PRD bagian 13 diuji lewat API.
 */
class ProjectApiTest extends TestCase
{
    use RefreshDatabase;

    private function wizard(array $overrides = []): array
    {
        $response = $this->postJson('/api/projects', array_merge([
            'name' => 'Proyek Web PT XYZ',
            'organization' => 'PT XYZ',
            'web_url' => 'https://xyz.example.id',
            'description' => 'Pembangunan sistem informasi',
            'start_date' => '2015-06-30',
            'use_template' => true,
            'weekend_days' => [0, 6],
            'weekends_work' => false,
            'holiday_mode' => 'custom',
            'holidays' => [['name' => 'Hari Libur', 'date' => '2015-07-17', 'type' => 'one-off']],
        ], $overrides));

        $response->assertStatus(201);

        return $response->json();
    }

    private function state(string $projectId): array
    {
        $response = $this->getJson("/api/projects/{$projectId}/export/json");
        $response->assertOk();

        return $response->json();
    }

    public function test_wizard_membuat_proyek_dengan_kalender(): void
    {
        $project = $this->wizard();

        $this->assertDatabaseHas('projects', ['id' => $project['id'], 'name' => 'Proyek Web PT XYZ']);
        $this->assertDatabaseCount('tasks', 6); // enam tahap standar (PRD 7.8)
        $this->assertDatabaseHas('calendars', ['weekends_work' => false, 'holiday_mode' => 'custom']);
        $this->assertDatabaseCount('holidays', 1);
        $this->assertDatabaseHas('dependencies', ['type' => 'FS']);
    }

    public function test_ubah_pilihan_weekend_lewat_update_proyek(): void
    {
        $project = $this->wizard();

        $response = $this->putJson("/api/projects/{$project['id']}", [
            'weekend_days' => [5, 6],
            'weekends_work' => true,
            'holiday_mode' => 'custom',
            'holidays' => [['name' => 'Hari Libur', 'date' => '2015-07-17', 'type' => 'one-off']],
        ]);

        $response->assertOk();
        $this->assertSame([5, 6], $response->json('state.calendar.weekend_days'));
        $this->assertTrue($response->json('state.calendar.weekends_work'));
        $this->assertSame('custom', $response->json('state.calendar.holiday_mode'));
        $this->assertGreaterThan(0, $response->json('state.project.revision'));
    }

    public function test_jadwal_template_mengikuti_weekend_dan_hari_libur(): void
    {
        $state = $this->state($this->wizard()['id']);

        $expected = [
            'Requirement gathering' => ['2015-06-30', '2015-07-06'],
            'System analysis' => ['2015-07-07', '2015-07-16'],
            'Design' => ['2015-07-20', '2015-07-28'], // 17 Jul libur, 18-19 Jul weekend
            'Implementation' => ['2015-07-29', '2015-08-11'],
            'Testing' => ['2015-08-12', '2015-08-18'],
            'Deploy and implementation' => ['2015-08-19', '2015-08-21'],
        ];

        $byName = collect($state['tasks'])->keyBy('name');

        foreach ($expected as $name => [$begin, $end]) {
            $task = $byName->get($name);
            $this->assertNotNull($task, "kegiatan {$name} tidak ada");
            $this->assertSame($begin, $task['begin_date'], "mulai {$name}");
            $this->assertSame($end, $task['end_date'], "selesai {$name}");
        }

        $this->assertSame('2015-06-30', $state['project_start']);
        $this->assertSame('2015-08-21', $state['project_end']);
        $criticalIds = array_column(
            array_filter($state['tasks'], fn (array $task) => $task['critical']),
            'id',
        );
        $this->assertContains($byName->get('Testing')['id'], $criticalIds, 'Testing harus jalur kritis');
        $this->assertContains($byName->get('Design')['id'], $criticalIds, 'Design harus jalur kritis');
    }

    public function test_ubah_durasi_menghitung_ulang_dan_menaikkan_revisi(): void
    {
        $project = $this->wizard();
        $state = $this->state($project['id']);
        $testing = collect($state['tasks'])->firstWhere('name', 'Testing');
        $beforeRevision = $state['revision'];

        $response = $this->putJson(
            "/api/projects/{$project['id']}/tasks/{$testing['id']}",
            ['duration' => 4],
        );
        $response->assertOk();

        $updated = collect($response->json('state.tasks'))->firstWhere('name', 'Testing');
        $this->assertSame(4, $updated['duration']);
        $this->assertSame('2015-08-17', $updated['end_date']); // 12,13,14 Ags | weekend | 17 Ags
        $this->assertSame($beforeRevision + 1, $response->json('state.revision'));

        // kegiatan berikutnya ikut mundur otomatis (FR-43)
        $deploy = collect($response->json('state.tasks'))->firstWhere('name', 'Deploy and implementation');
        $this->assertSame('2015-08-18', $deploy['begin_date']);
    }

    public function test_finish_to_start_dengan_delay_dua_hari_kerja(): void
    {
        $project = $this->wizard(['use_template' => false]);

        $first = $this->postJson("/api/projects/{$project['id']}/tasks", [
            'name' => 'Kegiatan A',
            'begin_date' => '2015-06-30',
            'duration' => 5,
        ])->json('id');

        $second = $this->postJson("/api/projects/{$project['id']}/tasks", [
            'name' => 'Kegiatan B',
            'begin_date' => '2015-06-30',
            'duration' => 3,
        ])->json('id');

        $this->postJson("/api/projects/{$project['id']}/dependencies", [
            'task_id' => $second,
            'predecessor_id' => $first,
            'type' => 'FS',
            'delay' => 2,
        ])->assertCreated();

        $state = $this->state($project['id']);
        $taskA = collect($state['tasks'])->firstWhere('name', 'Kegiatan A');
        $taskB = collect($state['tasks'])->firstWhere('name', 'Kegiatan B');

        $this->assertSame('2015-07-06', $taskA['end_date']);
        $this->assertSame('2015-07-08', $taskB['begin_date']); // 2 hari kerja setelah A selesai
        $this->assertSame('2015-07-10', $taskB['end_date']);
    }

    public function test_penugasan_resource_ke_kegiatan_muncul_di_state(): void
    {
        $project = $this->wizard(['use_template' => false]);

        $resource = $this->postJson("/api/projects/{$project['id']}/resources", [
            'name' => 'Budi',
            'default_role' => 'programmer',
            'standard_rate' => 500000,
            'days_off' => [['start_date' => '2015-07-06', 'end_date' => '2015-07-07']],
        ]);
        $resource->assertCreated();

        $task = $this->postJson("/api/projects/{$project['id']}/tasks", [
            'name' => 'Koding',
            'begin_date' => '2015-07-06',
            'duration' => 3,
            'resource_ids' => [$resource->json('id')],
        ]);
        $task->assertCreated();

        $state = $this->state($project['id']);
        $savedTask = collect($state['tasks'])->firstWhere('name', 'Koding');
        $savedResource = collect($state['resources'])->firstWhere('name', 'Budi');

        $this->assertSame([$savedResource['id']], $savedTask['resource_ids']);
        $this->assertCount(1, $savedResource['assignments']);
        $this->assertSame(500000.0, (float) $savedResource['standard_rate']);
        $this->assertCount(1, $savedResource['days_off']);
    }

    public function test_tanggal_mulai_manual_tidak_ikut_mundur_saat_predecessor_berubah(): void
    {
        $project = $this->wizard(['use_template' => false]);

        $a = $this->postJson("/api/projects/{$project['id']}/tasks", [
            'name' => 'Kegiatan A',
            'begin_date' => '2015-06-30',
            'duration' => 5,
        ])->json('id');

        $b = $this->postJson("/api/projects/{$project['id']}/tasks", [
            'name' => 'Kegiatan B',
            'begin_date' => '2015-06-30',
            'duration' => 3,
        ])->json('id');

        $this->postJson("/api/projects/{$project['id']}/dependencies", [
            'task_id' => $b,
            'predecessor_id' => $a,
            'type' => 'FS',
        ])->assertCreated();

        $state = $this->state($project['id']);
        $taskB = collect($state['tasks'])->firstWhere('name', 'Kegiatan B');
        $this->assertSame('2015-07-07', $taskB['begin_date']);

        // Pengguna menggeser manual: tandai manual_begin (PRD bagian 8, aturan 5).
        $this->putJson(
            "/api/projects/{$project['id']}/tasks/{$b}",
            ['begin_date' => '2015-07-14', 'manual_begin' => true],
        )->assertOk();

        // Durasi A dipersingkat: kandidat tanggal mulai B jadi lebih awal,
        // tapi B bertahan karena penanda manual_begin.
        $this->putJson(
            "/api/projects/{$project['id']}/tasks/{$a}",
            ['duration' => 2],
        )->assertOk();

        $state = $this->state($project['id']);
        $taskB = collect($state['tasks'])->firstWhere('name', 'Kegiatan B');
        $this->assertSame('2015-07-14', $taskB['begin_date'], 'kegiatan manual tidak ikut mundur');
        $this->assertSame('2015-07-16', $taskB['end_date']);

        // Tanpa penanda, kegiatan biasa ikut mundur (FR-43).
        $c = $this->postJson("/api/projects/{$project['id']}/tasks", [
            'name' => 'Kegiatan C',
            'begin_date' => '2015-07-17',
            'duration' => 2,
        ])->json('id');
        $this->postJson("/api/projects/{$project['id']}/dependencies", [
            'task_id' => $c,
            'predecessor_id' => $a,
            'type' => 'FS',
        ])->assertCreated();

        $state = $this->state($project['id']);
        $taskC = collect($state['tasks'])->firstWhere('name', 'Kegiatan C');
        $this->assertSame('2015-07-02', $taskC['begin_date'], 'kegiatan biasa mengikuti predecessor');
    }

    public function test_perubahan_terakhir_di_server_yang_berlaku(): void
    {
        $project = $this->wizard(['use_template' => false]);
        $task = $this->postJson("/api/projects/{$project['id']}/tasks", [
            'name' => 'Sama-sama edit',
            'begin_date' => '2015-06-30',
            'duration' => 2,
        ])->json('id');

        $url = "/api/projects/{$project['id']}/tasks/{$task}";
        $this->putJson($url, ['name' => 'Dari pengguna A'])->assertOk();
        $last = $this->putJson($url, ['name' => 'Dari pengguna B'])->assertOk();

        $this->assertSame('Dari pengguna B', $last->json('state.tasks.0.name'));
        $this->assertSame(Project::find($project['id'])->revision, $last->json('state.revision'));
        $this->assertSame(2, Task::find($task)->duration);
    }
}
