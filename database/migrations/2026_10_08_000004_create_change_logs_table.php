<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('change_logs', function (Blueprint $table) {
            $table->id();
            $table->uuid('project_id');
            $table->unsignedBigInteger('revision');
            $table->string('action');            // created | updated | deleted | ...
            $table->string('object_type');       // task | resource | dependency | calendar | project
            $table->string('object_id')->nullable();
            $table->json('payload')->nullable();
            $table->string('display_name')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['project_id', 'revision']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('change_logs');
    }
};
