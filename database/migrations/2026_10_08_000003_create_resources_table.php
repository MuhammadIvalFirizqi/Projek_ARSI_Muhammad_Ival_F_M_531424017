<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resources', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('default_role')->nullable();   // analis, desainer, programmer, penguji
            $table->decimal('standard_rate', 14, 2)->default(0); // gaji / hari
            $table->string('color')->nullable();
            $table->timestamps();

            $table->index('project_id');
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });

        Schema::create('resource_day_offs', function (Blueprint $table) {
            $table->id();
            $table->uuid('resource_id');
            $table->date('start_date');
            $table->date('end_date');
            $table->timestamps();

            $table->index('resource_id');
            $table->foreign('resource_id')->references('id')->on('resources')->cascadeOnDelete();
        });

        Schema::create('assignments', function (Blueprint $table) {
            $table->id();
            $table->uuid('task_id');
            $table->uuid('resource_id');
            $table->unsignedInteger('units')->default(100); // beban %
            $table->timestamps();

            $table->unique(['task_id', 'resource_id']);
            $table->index('resource_id');
            $table->foreign('task_id')->references('id')->on('tasks')->cascadeOnDelete();
            $table->foreign('resource_id')->references('id')->on('resources')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assignments');
        Schema::dropIfExists('resource_day_offs');
        Schema::dropIfExists('resources');
    }
};
