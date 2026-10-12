<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Dependency extends Model
{
    protected $fillable = [
        'id', 'project_id', 'task_id', 'predecessor_id', 'type', 'delay',
    ];

    protected function casts(): array
    {
        return ['delay' => 'integer'];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'task_id');
    }

    public function predecessor(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'predecessor_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
