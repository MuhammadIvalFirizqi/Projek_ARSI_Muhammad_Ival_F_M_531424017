<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            // Penanda bahwa tanggal mulai diatur manual oleh pengguna (geser batang).
            // Kegiatan tanpa penanda ini selalu mengikuti predecessor-nya,
            // maju maupun mundur (PRD bagian 8, aturan 5).
            $table->boolean('manual_begin')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('manual_begin');
        });
    }
};
