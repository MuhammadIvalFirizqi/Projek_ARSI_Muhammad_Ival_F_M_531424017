<?php

namespace Tests\Unit;

use App\Services\ScheduleEngine;
use App\Services\WorkingCalendar;
use PHPUnit\Framework\TestCase;

/**
 * Kasus uji penerimaan mesin penjadwalan (PRD bagian 8 dan 13):
 * proyek web untuk PT XYZ, 30 Juni - 31 Juli 2015,
 * weekend tidak ada kegiatan, 17 Juli 2015 hari libur custom.
 */
class ScheduleEngineTest extends TestCase
{
    private function calendar(array $holidays = [], bool $weekendsWork = false): WorkingCalendar
    {
        return new WorkingCalendar(
            weekendDays: [0, 6],
            weekendsWork: $weekendsWork,
            holidays: $holidays,
            holidayEnabled: $holidays !== [],
        );
    }

    /** @return array<int, array<string, mixed>> */
    private function scenarioTasks(): array
    {
        return [
            ['id' => 'a', 'name' => 'Requirement gathering', 'begin_date' => '2015-06-30', 'duration' => 5],
            ['id' => 'b', 'name' => 'System analysis', 'begin_date' => '2015-06-30', 'duration' => 8],
            // Catatan: dokumen sumber menulis durasi Design = 7, tetapi tanggal selesai yang
            // didokumentasikan (20 Jul) dan daftar hari yang dilewati (11-12, 17, 18-19 Jul)
            // hanya konsisten dengan durasi 8 hari kerja. Dipakai 8 agar seluruh tanggal
            // selesai pada tabel bagian 8 terpenuhi 100%.
            ['id' => 'c', 'name' => 'Design', 'begin_date' => '2015-06-30', 'duration' => 8],
            ['id' => 'd', 'name' => 'Implementation', 'begin_date' => '2015-06-30', 'duration' => 5],
            ['id' => 'e', 'name' => 'Testing', 'begin_date' => '2015-06-30', 'duration' => 2],
            ['id' => 'f', 'name' => 'Deploy and implementation', 'begin_date' => '2015-06-30', 'duration' => 2],
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function scenarioDeps(): array
    {
        return [
            ['task_id' => 'b', 'predecessor_id' => 'a', 'type' => 'SS', 'delay' => 3],
            // Dokumen sumber menyebut "setelah 5 hari analisis sistem" (dihitung hari
            // kalender: 3 Jul + 5 kalender = 8 Jul). PRD bagian 8 menetapkan delay dalam
            // hari kerja -> 3 hari kerja setelah 3 Jul = 8 Jul.
            ['task_id' => 'c', 'predecessor_id' => 'b', 'type' => 'SS', 'delay' => 3],
            ['task_id' => 'd', 'predecessor_id' => 'c', 'type' => 'FS', 'delay' => 0],
            ['task_id' => 'e', 'predecessor_id' => 'd', 'type' => 'FS', 'delay' => 0],
            ['task_id' => 'f', 'predecessor_id' => 'e', 'type' => 'FS', 'delay' => 0],
        ];
    }

    private function compute(array $tasks, array $deps, array $holidays = [], bool $weekendsWork = false): array
    {
        $engine = new ScheduleEngine($this->calendar($holidays, $weekendsWork), $tasks, $deps);

        return $engine->compute();
    }

    public function test_end_date_menghormati_weekend(): void
    {
        $result = $this->compute(
            [['id' => 'a', 'begin_date' => '2015-06-30', 'duration' => 5]],
            [],
        );

        // 30 Jun (Sel), 1 Jul (Rab), 2 Jul (Kam), 3 Jul (Jum), [4-5 weekend], 6 Jul (Sen)
        $this->assertSame('2015-07-06', $result['tasks']['a']['end_date']);
        $this->assertSame(5, $result['tasks']['a']['duration']);
    }

    public function test_hari_libur_custom_tidak_dihitung(): void
    {
        $result = $this->compute(
            [['id' => 'c', 'begin_date' => '2015-07-08', 'duration' => 8]],
            [],
            [['date' => '2015-07-17', 'type' => 'one-off', 'name' => 'Hari Libur']],
        );

        // 8,9,10 Jul | [11-12 weekend] | 13,14,15,16 Jul | [17 libur] | [18-19 weekend] | 20 Jul
        // Uji bahwa 17 Jul tidak dihitung: tanpa hari libur, durasi 8 akan berakhir 17 Jul.
        $this->assertSame('2015-07-20', $result['tasks']['c']['end_date']);

        $tanpaLibur = $this->compute(
            [['id' => 'c', 'begin_date' => '2015-07-08', 'duration' => 8]],
            [],
        );
        $this->assertSame('2015-07-17', $tanpaLibur['tasks']['c']['end_date']);
    }

    public function test_skenario_uji_penerimaan_bagian_8(): void
    {
        $holidays = [['date' => '2015-07-17', 'type' => 'one-off', 'name' => 'Hari Libur']];
        $result = $this->compute($this->scenarioTasks(), $this->scenarioDeps(), $holidays);

        $expected = [
            'a' => ['2015-06-30', '2015-07-06'],
            'b' => ['2015-07-03', '2015-07-14'],
            'c' => ['2015-07-08', '2015-07-20'],
            'd' => ['2015-07-21', '2015-07-27'],
            'e' => ['2015-07-28', '2015-07-29'],
            'f' => ['2015-07-30', '2015-07-31'],
        ];

        foreach ($expected as $id => [$begin, $end]) {
            $this->assertSame($begin, $result['tasks'][$id]['begin_date'], "begin $id");
            $this->assertSame($end, $result['tasks'][$id]['end_date'], "end $id");
        }

        $this->assertSame('2015-06-30', $result['project_start']);
        $this->assertSame('2015-07-31', $result['project_end']);
    }

    public function test_finish_to_start_dengan_delay(): void
    {
        $result = $this->compute(
            [
                ['id' => 'a', 'begin_date' => '2015-06-30', 'duration' => 5],   // selesai 6 Jul
                ['id' => 'b', 'begin_date' => '2015-06-30', 'duration' => 3],
            ],
            [['task_id' => 'b', 'predecessor_id' => 'a', 'type' => 'FS', 'delay' => 2]],
        );

        // 2 hari kerja setelah 6 Jul -> 7 Jul, 8 Jul
        $this->assertSame('2015-07-08', $result['tasks']['b']['begin_date']);
        $this->assertSame('2015-07-10', $result['tasks']['b']['end_date']);
    }

    public function test_start_to_start_tanpa_delay(): void
    {
        $result = $this->compute(
            [
                ['id' => 'a', 'begin_date' => '2015-06-30', 'duration' => 5],
                ['id' => 'b', 'begin_date' => '2015-06-01', 'duration' => 2],
            ],
            [['task_id' => 'b', 'predecessor_id' => 'a', 'type' => 'SS', 'delay' => 0]],
        );

        $this->assertSame('2015-06-30', $result['tasks']['b']['begin_date']);
    }

    public function test_sub_kegiatan_menentukan_rentang_induk(): void
    {
        $result = $this->compute(
            [
                ['id' => 'p', 'parent_id' => null, 'begin_date' => '2015-06-01', 'duration' => 1],
                ['id' => 'x', 'parent_id' => 'p', 'begin_date' => '2015-06-30', 'duration' => 2],
                ['id' => 'y', 'parent_id' => 'p', 'begin_date' => '2015-07-06', 'duration' => 3],
            ],
            [],
        );

        $this->assertSame('2015-06-30', $result['tasks']['p']['begin_date']);
        $this->assertSame('2015-07-08', $result['tasks']['p']['end_date']);
    }

    public function test_milestone_berdurasi_nol(): void
    {
        $result = $this->compute(
            [
                ['id' => 'a', 'begin_date' => '2015-06-30', 'duration' => 5],
                ['id' => 'm', 'begin_date' => '2015-06-30', 'duration' => 0, 'milestone' => true],
            ],
            [['task_id' => 'm', 'predecessor_id' => 'a', 'type' => 'FS', 'delay' => 0]],
        );

        $this->assertSame('2015-07-07', $result['tasks']['m']['begin_date']);
        $this->assertSame('2015-07-07', $result['tasks']['m']['end_date']);
        $this->assertSame(0, $result['tasks']['m']['duration']);
    }

    public function test_jalur_kritis_disorot_dan_mengikuti_durasi(): void
    {
        $tasks = $this->scenarioTasks();
        $holidays = [['date' => '2015-07-17', 'type' => 'one-off', 'name' => 'Hari Libur']];
        $result = $this->compute($tasks, $this->scenarioDeps(), $holidays);

        foreach (['a', 'b', 'c', 'd', 'e', 'f'] as $id) {
            $this->assertContains($id, $result['critical'], "task $id seharusnya jalur kritis");
        }

        // Perpanjang durasi kegiatan di jalur kritis -> tanggal selesai proyek mundur
        $tasks[3]['duration'] = 8; // Implementation 5 -> 8 hari kerja
        $later = $this->compute($tasks, $this->scenarioDeps(), $holidays);

        $this->assertSame('2015-07-31', $result['project_end']);
        $this->assertSame('2015-08-05', $later['project_end']);
        $this->assertContains('d', $later['critical']);
    }

    public function test_weekend_boleh_dipakai_semua_kegiatan(): void
    {
        $result = $this->compute(
            [['id' => 'a', 'begin_date' => '2015-06-30', 'duration' => 5]],
            [],
            [],
            weekendsWork: true,
        );

        // Semua hari berjalan -> 30 Jun + 4 hari = 4 Jul
        $this->assertSame('2015-07-04', $result['tasks']['a']['end_date']);
    }

    public function test_hari_libur_recurring(): void
    {
        $result = $this->compute(
            [['id' => 'a', 'begin_date' => '2025-06-30', 'duration' => 5]],
            [],
            [['date' => '2015-07-04', 'type' => 'recurring', 'name' => 'Hari Kemerdekaan']],
        );

        // 30 Jun, 1 Jul, 2 Jul, 3 Jul, [4 Jul libur], [5-6 weekend], 7 Jul
        $this->assertSame('2025-07-07', $result['tasks']['a']['end_date']);
    }
}
