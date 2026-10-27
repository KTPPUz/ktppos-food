<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Resources\PosResource;
use App\Services\ApiError;
use App\Services\AuditChanges;
use App\Services\MenuImages;
use App\Services\PosRepository;
use App\Services\PosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

final class PosController extends Controller
{
    public function __invoke(Request $request, PosRepository $repository): JsonResponse
    {
        $service = null;
        try {
            $result = $repository->transaction(function () use ($request, $repository, &$service): array {
                $before = $repository->load();
                $service = app()->make(PosService::class, ['data' => $before]);
                $result = $service->dispatch($request);
                if ($service->dirty) {
                    app(AuditChanges::class)->attach($before, $service->data);
                    $repository->save($before, $service->data);
                }

                return $result;
            }, $request->hasFile('image') ? 1 : 3);

            foreach ($service->replacedImages as $path) {
                try {
                    app(MenuImages::class)->delete($path);
                } catch (Throwable $error) {
                    report($error);
                }
            }

            // Return only after both domain changes and auth-token changes commit.
            return (new PosResource($result['body']))->response()->setStatusCode($result['status'] ?? ($request->is('api/transfers') && $request->isMethod('POST') ? 201 : 200));
        } catch (ApiError $error) {
            $this->discardUploads($service);

            return response()->json(['error' => $error->getMessage()], $error->status);
        } catch (Throwable $error) {
            $this->discardUploads($service);
            report($error);

            return response()->json(['error' => 'ฐานข้อมูลหรือระบบไม่พร้อมใช้งาน กรุณาลองอีกครั้ง'], 503);
        }
    }

    private function discardUploads(?PosService $service): void
    {
        foreach ($service?->uploadedImages ?? [] as $path) {
            try {
                app(MenuImages::class)->delete($path);
            } catch (Throwable $error) {
                report($error);
            }
        }
    }
}
