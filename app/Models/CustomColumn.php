<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Kolom tambahan buatan pengguna (PRD: id, project_id, target, nama, tipe).
 * Tab Custom Columns pada dialog Task (FR-33) dan Resource (FR-39).
 */
class CustomColumn extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'project_id', 'target', 'name', 'type', 'position',
    ];

    protected static function booted(): void
    {
        static::creating(function (CustomColumn $column) {
            $column->id = $column->id ?: (string) Str::uuid();
        });
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
