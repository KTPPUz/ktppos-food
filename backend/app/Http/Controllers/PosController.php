<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Resources\PosResource;
use App\Services\ApiError;
use App\Services\PosRepository;
use App\Services\PosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

final class PosController extends Controller
{
    public function __invoke(Request $request, PosRepository $repository): JsonResponse
    {
        try {
            $result = $repository->transaction(function () use ($request, $repository): array {
                $before = $repository->load();
                $service = app()->make(PosService::class, ['data' => $before]);
                $result = $service->dispatch($request);
                if ($service->dirty) {
                    $repository->save($before, $service->data);
                }

                return $result;
            });

            // Return only after both domain changes and auth-token changes commit.
            return (new PosResource($result['body']))->response()->setStatusCode($result['status'] ?? ($request->is('api/transfers') && $request->isMethod('POST') ? 201 : 200));
        } catch (ApiError $error) {
            return response()->json(['error' => $error->getMessage()], $error->status);
        } catch (Throwable $error) {
            report($error);

            return response()->json(['error' => 'ฐานข้อมูลหรือระบบไม่พร้อมใช้งาน กรุณาลองอีกครั้ง'], 503);
        }
    }
}
