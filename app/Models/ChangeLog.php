<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChangeLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'project_id', 'revision', 'action', 'object_type',
        'object_id', 'payload', 'display_name', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'revision' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
