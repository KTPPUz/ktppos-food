<?php

use App\Http\Controllers\PosController;
use App\Http\Middleware\ApiOrigin;
use Illuminate\Support\Facades\Route;

Route::middleware(ApiOrigin::class)->group(function (): void {
    foreach ([
        'GET' => ['demo', 'state', 'menu-items', 'branches', 'inventory/movements', 'reports/sales', 'guest/{token}'],
        'POST' => ['auth/login', 'auth/logout', 'orders', 'orders/{id}/items', 'orders/{id}/items/{itemId}/cancel', 'orders/{id}/discount', 'orders/{id}/payments', 'orders/{id}/refund', 'orders/{id}/move', 'orders/{id}/merge', 'orders/{id}/split', 'tables/{id}/session', 'table-sessions/{id}/close', 'guest/{token}/orders', 'inventory/adjust', 'transfers', 'transfers/{id}/approve', 'shifts', 'users'],
        'PATCH' => ['orders/{id}/status', 'orders/{id}/kitchen-batches/{batchId}/status', 'menu-items/{id}', 'tables/{id}/reservation', 'users/{id}', 'settings'],
        'DELETE' => ['users/{id}'],
    ] as $method => $paths) {
        foreach ($paths as $path) {
            Route::match([$method], $path, PosController::class);
        }
    }
    // Keep the API's JSON error contract, including unknown public guest paths.
    Route::any('{path?}', PosController::class)->where('path', '.*');
});
