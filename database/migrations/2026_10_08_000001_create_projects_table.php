<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('organization')->nullable();
            $table->string('web_url')->nullable();
            $table->text('description')->nullable();
            $table->date('start_date')->nullable();
            $table->string('date_format')->default('DD MMM YYYY');
            $table->unsignedBigInteger('revision')->default(0);
            $table->timestamps();
        });

        Schema::create('calendars', function (Blueprint $table) {
            $table->id();
            $table->uuid('project_id')->unique();
            $table->json('weekend_days')->nullable();      // [0..6], 0 = Minggu
            $table->boolean('weekends_work')->default(false); // false = no task can run
            $table->string('holiday_mode')->default('none'); // none | custom
            $table->timestamps();
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('calendar_id');
            $table->string('name');
            $table->date('date');
            $table->string('type')->default('one-off'); // one-off | recurring
            $table->timestamps();
            $table->foreign('calendar_id')->references('id')->on('calendars')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('holidays');
        Schema::dropIfExists('calendars');
        Schema::dropIfExists('projects');
    }
};
