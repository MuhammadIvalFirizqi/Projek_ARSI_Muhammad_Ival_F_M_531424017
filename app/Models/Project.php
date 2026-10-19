<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Project extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name', 'organization', 'web_url', 'description',
        'start_date', 'date_format', 'revision',
    ];

    protected $attributes = ['revision' => 0];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'revision' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Project $project) {
            $project->id = $project->id ?: (string) Str::uuid();
        });
    }

    public function calendar(): HasOne
    {
        return $this->hasOne(Calendar::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class)->orderBy('position')->orderBy('id');
    }

    public function resources(): HasMany
    {
        return $this->hasMany(Resource::class);
    }

    public function dependencies(): HasMany
    {
        return $this->hasMany(Dependency::class);
    }

    public function customColumns(): HasMany
    {
        return $this->hasMany(CustomColumn::class)->orderBy('position')->orderBy('id');
    }

    public function changeLogs(): HasMany
    {
        return $this->hasMany(ChangeLog::class);
    }
}
