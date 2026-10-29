<?php

use App\Http\Controllers\PosController;
use App\Http\Middleware\ApiOrigin;
use Illuminate\Support\Facades\Route;

Route::middleware(ApiOrigin::class)->group(function (): void {
    foreach ([
        'GET' => ['categories', 'audit/{id}', 'demo', 'state', 'roles', 'menu-items', 'branches', 'inventory/movements', 'reports/sales', 'guest/{token}'],
        'POST' => ['auth/login', 'auth/logout', 'orders', 'orders/{id}/items', 'orders/{id}/items/{itemId}/cancel', 'orders/{id}/discount', 'orders/{id}/payments', 'orders/{id}/refund', 'orders/{id}/move', 'orders/{id}/merge', 'orders/{id}/split', 'tables/{id}/session', 'table-sessions/{id}/close', 'guest/{token}/orders', 'guest/{token}/calls', 'table-sessions/{id}/calls/{callId}/resolve', 'inventory/adjust', 'transfers', 'transfers/{id}/approve', 'shifts', 'users', 'roles', 'branches', 'menu-items', 'tables', 'categories'],
        'PATCH' => ['orders/{id}/status', 'orders/{id}/kitchen-batches/{batchId}/status', 'menu-items/{id}', 'tables/{id}', 'tables/{id}/reservation', 'users/{id}', 'settings', 'roles/{id}', 'branches/{id}', 'branches/{id}/payment-qr', 'categories/{id}'],
        'DELETE' => ['users/{id}', 'roles/{id}', 'branches/{id}', 'menu-items/{id}', 'tables/{id}', 'branches/{id}/payment-qr', 'categories/{id}'],
    ] as $method => $paths) {
        foreach ($paths as $path) {
            Route::match([$method], $path, PosController::class);
        }
    }
    // Keep the API's JSON error contract, including unknown public guest paths.
    Route::any('{path?}', PosController::class)->where('path', '.*');
});
