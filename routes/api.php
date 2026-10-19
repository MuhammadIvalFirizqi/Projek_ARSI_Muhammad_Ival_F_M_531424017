<?php

use App\Http\Controllers\DependencyController;
use App\Http\Controllers\ExportController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ResourceController;
use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

// Proyek (FR-01..FR-07)
Route::post('/projects', [ProjectController::class, 'store']);
Route::put('/projects/{project}', [ProjectController::class, 'update']);
Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);
Route::post('/projects/{project}/duplicate', [ProjectController::class, 'duplicate']);

// Kegiatan (FR-27..FR-34, FR-47, FR-48)
Route::post('/projects/{project}/tasks', [TaskController::class, 'store']);
Route::post('/projects/{project}/tasks/reorder', [TaskController::class, 'reorder']);
Route::put('/projects/{project}/tasks/{task}', [TaskController::class, 'update']);
Route::delete('/projects/{project}/tasks/{task}', [TaskController::class, 'destroy']);

// Dependensi (FR-31, FR-42)
Route::post('/projects/{project}/dependencies', [DependencyController::class, 'store']);
Route::put('/projects/{project}/dependencies/{dependency}', [DependencyController::class, 'update']);
Route::delete('/projects/{project}/dependencies/{dependency}', [DependencyController::class, 'destroy']);

// Resource (FR-35..FR-38)
Route::post('/projects/{project}/resources', [ResourceController::class, 'store']);
Route::put('/projects/{project}/resources/{resource}', [ResourceController::class, 'update']);
Route::delete('/projects/{project}/resources/{resource}', [ResourceController::class, 'destroy']);

// Kolom tambahan buatan pengguna (FR-33 task, FR-39 resource)
Route::post('/projects/{project}/custom-columns', [\App\Http\Controllers\CustomColumnController::class, 'store']);
Route::put('/projects/{project}/custom-columns/{customColumn}', [\App\Http\Controllers\CustomColumnController::class, 'update']);
Route::delete('/projects/{project}/custom-columns/{customColumn}', [\App\Http\Controllers\CustomColumnController::class, 'destroy']);

// Ekspor (FR-07)
Route::get('/projects/{project}/export/{format}', [ExportController::class, 'export']);

// Kehadiran & penanda sedang diedit (FR-59, FR-60, FR-64)
Route::post('/projects/{project}/presence', [\App\Http\Controllers\PresenceController::class, 'update']);
