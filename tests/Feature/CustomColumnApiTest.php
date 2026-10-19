<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * FR-39: tab Custom Columns pada dialog Resources (PRD Rilis 2.0).
 */
class CustomColumnApiTest extends TestCase
{
    use RefreshDatabase;

    private function project(): array
    {
        $response = $this->postJson('/api/projects', [
            'name' => 'Proyek Kolom Custom',
            'start_date' => '2026-01-05',
            'use_template' => false,
        ]);
        $response->assertStatus(201);

        return $response->json();
    }

    private function resource(string $projectId): string
    {
        $response = $this->postJson("/api/projects/{$projectId}/resources", ['name' => 'Budi']);
        $response->assertCreated();

        return $response->json('id');
    }

    private function addColumn(string $projectId, array $overrides = []): string
    {
        $response = $this->postJson(
            "/api/projects/{$projectId}/custom-columns",
            array_merge(['name' => 'Tingkat pengalaman', 'type' => 'text'], $overrides),
        );
        $response->assertCreated();

        return $response->json('id');
    }

    public function test_tambah_kolom_custom_muncul_di_state(): void
    {
        $project = $this->project();
        $this->addColumn($project['id']);

        $state = $this->getJson("/api/projects/{$project['id']}/export/json")->json();

        $this->assertCount(1, $state['custom_columns']);
        $this->assertSame('Tingkat pengalaman', $state['custom_columns'][0]['name']);
        $this->assertSame('text', $state['custom_columns'][0]['type']);
        $this->assertSame('resource', $state['custom_columns'][0]['target']);
    }

    public function test_nilai_kolom_custom_disimpan_pada_resource(): void
    {
        $project = $this->project();
        $resourceId = $this->resource($project['id']);
        $textColumn = $this->addColumn($project['id']);
        $numberColumn = $this->addColumn($project['id'], ['name' => 'Gaji bonus', 'type' => 'number']);

        $response = $this->putJson("/api/projects/{$project['id']}/resources/{$resourceId}", [
            'name' => 'Budi',
            'custom_values' => [$textColumn => 'Senior', $numberColumn => 1500000],
        ]);
        $response->assertOk();

        $state = $this->getJson("/api/projects/{$project['id']}/export/json")->json();
        $saved = collect($state['resources'])->firstWhere('id', $resourceId);

        $this->assertSame('Senior', $saved['custom_values'][$textColumn]);
        $this->assertSame(1500000, $saved['custom_values'][$numberColumn]);
    }

    public function test_ubah_dan_hapus_kolom_custom(): void
    {
        $project = $this->project();
        $resourceId = $this->resource($project['id']);
        $columnId = $this->addColumn($project['id']);

        $this->putJson("/api/projects/{$project['id']}/resources/{$resourceId}", [
            'name' => 'Budi',
            'custom_values' => [$columnId => 'Senior'],
        ])->assertOk();

        // ubah nama & tipe kolom
        $this->putJson("/api/projects/{$project['id']}/custom-columns/{$columnId}", [
            'name' => 'Level',
            'type' => 'text',
        ])->assertOk();

        $state = $this->getJson("/api/projects/{$project['id']}/export/json")->json();
        $this->assertSame('Level', $state['custom_columns'][0]['name']);

        // hapus kolom: definisi dan nilai ikut hilang (tidak ada data yatim)
        $this->deleteJson("/api/projects/{$project['id']}/custom-columns/{$columnId}")->assertOk();

        $state = $this->getJson("/api/projects/{$project['id']}/export/json")->json();
        $this->assertSame([], $state['custom_columns']);
        $saved = collect($state['resources'])->firstWhere('id', $resourceId);
        $this->assertEmpty($saved['custom_values']);
    }

    public function test_kolom_custom_proyek_lain_tidak_ikut(): void
    {
        $first = $this->project();
        $second = $this->project();

        $this->addColumn($first['id']);

        $state = $this->getJson("/api/projects/{$second['id']}/export/json")->json();
        $this->assertSame([], $state['custom_columns']);
    }

    public function test_duplikasi_proyek_menyalin_kolom_dan_nilai(): void
    {
        $project = $this->project();
        $resourceId = $this->resource($project['id']);
        $columnId = $this->addColumn($project['id']);

        $this->putJson("/api/projects/{$project['id']}/resources/{$resourceId}", [
            'name' => 'Budi',
            'custom_values' => [$columnId => 'Senior'],
        ])->assertOk();

        $copyId = $this->postJson("/api/projects/{$project['id']}/duplicate", ['name' => 'Salinan'])
            ->assertCreated()
            ->json('id');

        $state = $this->getJson("/api/projects/{$copyId}/export/json")->json();

        $this->assertCount(1, $state['custom_columns']);
        $newColumnId = $state['custom_columns'][0]['id'];
        $this->assertNotSame($columnId, $newColumnId);

        $copiedResource = collect($state['resources'])->firstWhere('name', 'Budi');
        $this->assertSame('Senior', $copiedResource['custom_values'][$newColumnId]);
    }
}
