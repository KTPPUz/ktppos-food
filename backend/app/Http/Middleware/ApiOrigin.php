<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ApiOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->header('Origin');
        $allowed = config('pos.allowed_origins', []);
        if ($origin && $origin !== $request->getSchemeAndHttpHost() && ! in_array($origin, $allowed, true)) {
            return response()->json(['error' => 'เว็บไซต์นี้ไม่ได้รับอนุญาตให้เรียก API'], 403);
        }
        $response = $request->isMethod('OPTIONS') ? response('', 204) : $next($request);
        $response->headers->set('Cache-Control', 'no-store');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->setVary('Origin');
        if ($origin) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
            $response->headers->set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        }

        return $response;
    }
}
