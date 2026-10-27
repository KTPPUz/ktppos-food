<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

final class MenuImages
{
    public function store(UploadedFile $file, bool $lossless = false): string
    {
        $allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (! $file->isValid() || $file->getSize() > 5 * 1024 * 1024 || ! in_array($file->getMimeType(), $allowed, true)) {
            throw new ApiError('กรุณาเลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB');
        }
        $size = @getimagesize($file->getRealPath());
        if (! $size || $size[0] > 6000 || $size[1] > 6000 || $size[0] * $size[1] > 24000000) {
            throw new ApiError('รูปภาพใหญ่เกินไป กรุณาใช้รูปไม่เกิน 6000 พิกเซลต่อด้าน และ 24 ล้านพิกเซล');
        }
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            throw new ApiError('เซิร์ฟเวอร์ยังไม่พร้อมรับรูปภาพ กรุณาเปิดส่วนขยาย GD และ WebP', 503);
        }
        $source = @imagecreatefromstring(file_get_contents($file->getRealPath()));
        if (! $source) {
            throw new ApiError('อ่านรูปภาพไม่ได้ กรุณาเลือกไฟล์รูปใหม่');
        }
        $target = null;
        try {
            if ($file->getMimeType() === 'image/jpeg' && function_exists('exif_read_data')) {
                $orientation = (int) (@exif_read_data($file->getRealPath())['Orientation'] ?? 1);
                if (in_array($orientation, [2, 4, 5, 7], true)) {
                    imageflip($source, IMG_FLIP_HORIZONTAL);
                }
                $angle = match ($orientation) {
                    3, 4 => 180, 5, 6 => -90, 7, 8 => 90, default => 0
                };
                if ($angle) {
                    $rotated = imagerotate($source, $angle, 0);
                    $source = $rotated;
                }
            }
            $width = imagesx($source);
            $height = imagesy($source);
            $scale = min(1, 1600 / max($width, $height));
            $targetWidth = max(1, (int) round($width * $scale));
            $targetHeight = max(1, (int) round($height * $scale));
            $target = imagecreatetruecolor($targetWidth, $targetHeight);
            imagealphablending($target, false);
            imagesavealpha($target, true);
            imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);
            ob_start();
            try {
                if (! ($lossless ? imagepng($target, null, 6) : imagewebp($target, null, 85))) {
                    throw new ApiError('บันทึกรูปภาพไม่สำเร็จ กรุณาลองอีกครั้ง', 503);
                }
                $bytes = ob_get_contents();
            } finally {
                ob_end_clean();
            }
            $name = Str::uuid().($lossless ? '.png' : '.webp');
            Storage::disk('menu_images')->put($name, $bytes);

            return '/media/menu-images/'.$name;
        } finally {
            unset($source, $target);
        }
    }

    public function delete(string $path): void
    {
        if (preg_match('#^/media/menu-images/([a-f0-9-]{36}\.(?:webp|png))$#D', $path, $match)) {
            Storage::disk('menu_images')->delete($match[1]);
        }
    }

    public function response(string $name): BinaryFileResponse
    {
        abort_unless(preg_match('/^[a-f0-9-]{36}\.(?:webp|png)$/D', $name), 404);
        $disk = Storage::disk('menu_images');
        abort_unless($disk->exists($name), 404);

        return response()->file($disk->path($name), [
            'Content-Type' => str_ends_with($name, '.png') ? 'image/png' : 'image/webp',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }
}
