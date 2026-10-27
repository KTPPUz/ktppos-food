<?php

use App\Services\MenuImages;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/media/menu-images/{name}', fn (string $name, MenuImages $images) => $images->response($name));

Route::get('/healthz', function () {
    try {
        $ready = DB::table('pos_counters')->where('id', 'state')->value('initialized');

        return response()->json(['status' => $ready ? 'ok' : 'uninitialized'], $ready ? 200 : 503)->header('Cache-Control', 'no-store');
    } catch (Throwable $e) {
        return response()->json(['status' => 'unavailable'], 503);
    }
});
Route::get('/{path?}', function () {
    abort_unless(is_file(public_path('index.html')), 503, 'Build the frontend with npm run build:hostinger.');

    return response()->file(public_path('index.html'), ['Cache-Control' => 'no-cache']);
})->where('path', '^(?!api(?:/|$)).*');
