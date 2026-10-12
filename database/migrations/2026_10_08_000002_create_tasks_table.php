<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->uuid('parent_id')->nullable();
            $table->string('name');
            $table->boolean('milestone')->default(false);
            $table->date('begin_date');
            $table->date('end_date');
            $table->unsignedInteger('duration')->default(1); // hari kerja
            $table->string('constraint')->nullable();        // Additional constraint (P0 field)
            $table->string('priority')->default('Normal');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->boolean('show_in_timeline')->default(true);
            $table->string('shape')->default('bar');
            $table->string('color')->nullable();
            $table->string('web_link')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->index(['project_id', 'parent_id']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('parent_id')->references('id')->on('tasks')->cascadeOnDelete();
        });

        Schema::create('dependencies', function (Blueprint $table) {
            $table->id();
            $table->uuid('project_id');
            $table->uuid('task_id');
            $table->uuid('predecessor_id');
            $table->string('type')->default('FS'); // Finish-to-Start | Start-to-Start
            $table->unsignedInteger('delay')->default(0); // hari kerja
            $table->timestamps();

            $table->unique(['task_id', 'predecessor_id']);
            $table->index('project_id');
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('task_id')->references('id')->on('tasks')->cascadeOnDelete();
            $table->foreign('predecessor_id')->references('id')->on('tasks')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dependencies');
        Schema::dropIfExists('tasks');
    }
};
