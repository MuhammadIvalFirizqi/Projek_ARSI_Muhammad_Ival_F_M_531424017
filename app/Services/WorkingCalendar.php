<?php

namespace App\Services;

use Carbon\CarbonImmutable;

/**
 * Kalender kerja: akhir pekan, aturan weekend, dan hari libur.
 * Semua operasi bekerja pada hari kerja (working days), bukan hari kalender.
 */
class WorkingCalendar
{
    private array $weekendDays;
    private bool $weekendsWork;
    private bool $holidayEnabled;
    /** @var array<string,true> tanggal one-off 'Y-m-d' */
    private array $oneOff = [];
    /** @var array<string,true> tanggal recurring 'm-d' */
    private array $recurring = [];

    private const MAX_STEPS = 5000;

    public function __construct(
        array $weekendDays = [0, 6],
        bool $weekendsWork = false,
        array $holidays = [],
        bool $holidayEnabled = true,
    ) {
        $this->weekendDays = array_values(array_map('intval', $weekendDays));
        $this->weekendsWork = $weekendsWork;
        $this->holidayEnabled = $holidayEnabled;

        foreach ($holidays as $holiday) {
            $date = is_array($holiday) ? ($holiday['date'] ?? null) : (string) $holiday;
            if (! $date) {
                continue;
            }
            $type = is_array($holiday) ? ($holiday['type'] ?? 'one-off') : 'one-off';
            if ($type === 'recurring') {
                $this->recurring[substr($date, 5)] = true;
            } else {
                $this->oneOff[$date] = true;
            }
        }
    }

    public static function fromCalendar(?object $calendar): self
    {
        if (! $calendar) {
            return new self([0, 6], false, [], false);
        }

        $holidays = [];
        foreach ($calendar->holidays ?? [] as $holiday) {
            $holidays[] = [
                'date' => $holiday->date instanceof \Carbon\CarbonInterface
                    ? $holiday->date->format('Y-m-d')
                    : (string) $holiday->date,
                'type' => $holiday->type ?? 'one-off',
            ];
        }

        return new self(
            $calendar->weekend_days ?? [0, 6],
            (bool) ($calendar->weekends_work ?? false),
            $holidays,
            ($calendar->holiday_mode ?? 'none') === 'custom',
        );
    }

    public static function dayOfWeek(string $date): int
    {
        return (int) CarbonImmutable::parse($date)->format('w');
    }

    public function isWeekend(string $date): bool
    {
        return in_array(self::dayOfWeek($date), $this->weekendDays, true);
    }

    public function isHoliday(string $date): bool
    {
        if (! $this->holidayEnabled) {
            return false;
        }

        return isset($this->oneOff[$date]) || isset($this->recurring[substr($date, 5)]);
    }

    public function isWorkingDay(string $date): bool
    {
        if (! $this->weekendsWork && $this->isWeekend($date)) {
            return false;
        }

        if ($this->isHoliday($date)) {
            return false;
        }

        return true;
    }

    private function shift(string $date, int $step): string
    {
        $d = CarbonImmutable::parse($date)->startOfDay();
        for ($i = 0; $i < self::MAX_STEPS; $i++) {
            $d = $d->addDays($step);
            if ($this->isWorkingDay($d->format('Y-m-d'))) {
                return $d->format('Y-m-d');
            }
        }

        return $d->format('Y-m-d');
    }

    /** Hari kerja berikutnya setelah $date. */
    public function nextWorkingDay(string $date): string
    {
        return $this->shift($date, 1);
    }

    /** Hari kerja sebelumnya sebelum $date. */
    public function prevWorkingDay(string $date): string
    {
        return $this->shift($date, -1);
    }

    /**
     * Geser $n hari kerja maju dari $date (n = 0 berarti $date itu sendiri).
     * Dipakai untuk Start-to-Start dengan delay.
     */
    public function shiftWorkingDays(string $date, int $n): string
    {
        $d = $date;
        for ($i = 0; $i < $n; $i++) {
            $d = $this->nextWorkingDay($d);
        }

        return $d;
    }

    /** Geser $n hari kerja mundur dari $date. */
    public function shiftWorkingDaysBack(string $date, int $n): string
    {
        $d = $date;
        for ($i = 0; $i < $n; $i++) {
            $d = $this->prevWorkingDay($d);
        }

        return $d;
    }

    /** Pastikan $date adalah hari kerja (maju ke hari kerja terdekat bila bukan). */
    public function normalizeStart(string $date): string
    {
        for ($i = 0; $i < self::MAX_STEPS; $i++) {
            if ($this->isWorkingDay($date)) {
                return $date;
            }
            $date = $this->nextWorkingDay($date);
        }

        return $date;
    }

    /**
     * Tanggal selesai = $duration hari kerja setelah $begin (inclusive).
     * duration 0 / milestone -> $begin.
     */
    public function addDuration(string $begin, int $duration): string
    {
        if ($duration <= 1) {
            return $begin;
        }

        return $this->shiftWorkingDays($begin, $duration - 1);
    }

    /** Jumlah hari kerja dari $begin sampai $end (inklusif). */
    public function countWorkingDays(string $begin, string $end): int
    {
        $start = CarbonImmutable::parse($begin)->startOfDay();
        $stop = CarbonImmutable::parse($end)->startOfDay();
        if ($stop->lt($start)) {
            return 0;
        }

        $count = 0;
        $cursor = $start;
        while ($cursor->lte($stop)) {
            if ($this->isWorkingDay($cursor->format('Y-m-d'))) {
                $count++;
            }
            $cursor = $cursor->addDay();
        }

        return $count;
    }

    /**
     * Durasi dalam hari kerja bila $end diberikan (untuk edit End date langsung).
     */
    public function durationBetween(string $begin, string $end): int
    {
        return max(1, $this->countWorkingDays($begin, $end));
    }

    /** Hari-hari dalam rentang (untuk rendering & resources chart). */
    public function eachDay(string $from, string $to): array
    {
        $days = [];
        $cursor = CarbonImmutable::parse($from)->startOfDay();
        $stop = CarbonImmutable::parse($to)->startOfDay();
        while ($cursor->lte($stop) && count($days) < self::MAX_STEPS * 4) {
            $days[] = $cursor->format('Y-m-d');
            $cursor = $cursor->addDay();
        }

        return $days;
    }
}
