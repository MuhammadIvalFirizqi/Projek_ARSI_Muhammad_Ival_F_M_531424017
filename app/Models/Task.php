<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Task extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'project_id', 'parent_id', 'name', 'milestone', 'begin_date',
        'end_date', 'duration', 'constraint', 'priority', 'progress',
        'show_in_timeline', 'shape', 'color', 'web_link', 'notes', 'position',
        'manual_begin',
    ];

    protected static function booted(): void
    {
        static::creating(function (Task $task) {
            $task->id = $task->id ?: (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return [
            'milestone' => 'boolean',
            'show_in_timeline' => 'boolean',
            'progress' => 'integer',
            'duration' => 'integer',
            'position' => 'integer',
            'begin_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'manual_begin' => 'boolean',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Task::class, 'parent_id')->orderBy('position')->orderBy('id');
    }

    public function dependencies(): HasMany
    {
        return $this->hasMany(Dependency::class, 'task_id');
    }

    public function predecessors(): HasMany
    {
        return $this->hasMany(Dependency::class, 'task_id');
    }

    public function successors(): HasMany
    {
        return $this->hasMany(Dependency::class, 'predecessor_id');
    }

    public function resources(): BelongsToMany
    {
        return $this->belongsToMany(Resource::class, 'assignments', 'task_id', 'resource_id')
            ->withPivot('units');
    }
}
