<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Resource extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'project_id', 'name', 'phone', 'email',
        'default_role', 'standard_rate', 'color',
    ];

    protected static function booted(): void
    {
        static::creating(function (Resource $resource) {
            $resource->id = $resource->id ?: (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return ['standard_rate' => 'float'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function daysOff(): HasMany
    {
        return $this->hasMany(ResourceDayOff::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(Assignment::class);
    }

    public function tasks(): BelongsToMany
    {
        return $this->belongsToMany(Task::class, 'assignments', 'resource_id', 'task_id')
            ->withPivot('units');
    }
}
