<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PRD: CustomColumn | id, project_id, target (task/resource), nama, tipe
        Schema::create('custom_columns', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('project_id');
            $table->string('target')->default('resource'); // resource | task
            $table->string('name');
            $table->string('type')->default('text');       // text | number | date | boolean
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->index(['project_id', 'target']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });

        // Nilai kolom tambahan per resource, dikunci ke custom_columns.id.
        Schema::table('resources', function (Blueprint $table) {
            $table->json('custom_values')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('resources', function (Blueprint $table) {
            $table->dropColumn('custom_values');
        });

        Schema::dropIfExists('custom_columns');
    }
};
