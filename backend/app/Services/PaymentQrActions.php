<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\UploadedFile;

trait PaymentQrActions
{
    private function publicBranch(array $branch): array
    {
        if (! empty($branch['paymentQr']['image'])) {
            $branch['paymentQr']['image'] = url($branch['paymentQr']['image']);
        }

        return $branch;
    }

    private function paymentQr(string $id, string $method, array $body, mixed $image): array
    {
        $this->check($this->user['role'] === 'Owner', 'เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่า QR รับชำระเงินได้', 403);
        $this->check(in_array($method, ['PATCH', 'DELETE'], true), 'ไม่พบ API', 404);
        $branch = &$this->record('branches', fn ($branch) => $branch['id'] === $id && $this->scope([...$branch, 'branchId' => $branch['id']]), 'ไม่พบสาขา');
        $previous = $branch['paymentQr']['image'] ?? null;
        if ($method === 'DELETE') {
            unset($branch['paymentQr']);
            if ($previous) {
                $this->replacedImages[] = $previous;
            }
            $this->audit('ลบ QR รับชำระเงิน', $branch['name']);

            return ['ok' => true];
        }
        $this->check(! array_diff(array_keys($body), ['bankName', 'accountName', 'accountNumber', 'instructions', 'enabled']), 'ข้อมูล QR ไม่ถูกต้อง');
        $config = $branch['paymentQr'] ?? ['bankName' => '', 'accountName' => '', 'accountNumber' => '', 'instructions' => '', 'enabled' => false];
        foreach (['bankName' => 100, 'accountName' => 100, 'accountNumber' => 50, 'instructions' => 300] as $field => $limit) {
            if (array_key_exists($field, $body)) {
                $this->check(is_string($body[$field]) && mb_strlen(trim($body[$field])) <= $limit, 'ข้อมูลบัญชีไม่ถูกต้อง');
                $config[$field] = trim($body[$field]);
            }
        }
        if (array_key_exists('enabled', $body)) {
            $this->check(is_bool($body['enabled']), 'สถานะ QR ไม่ถูกต้อง');
            $config['enabled'] = $body['enabled'];
        }
        if ($image !== null) {
            $this->check($image instanceof UploadedFile, 'รูป QR ไม่ถูกต้อง');
            $path = app(MenuImages::class)->store($image, true);
            $this->uploadedImages[] = $path;
            $config['image'] = $path;
            if ($previous) {
                $this->replacedImages[] = $previous;
            }
        }
        $this->check(! $config['enabled'] || (! empty($config['image']) && $config['accountName'] !== ''), 'กรุณาแนบรูป QR และระบุชื่อบัญชีก่อนเปิดใช้งาน');
        $config['version'] = $this->uid();
        $branch['paymentQr'] = $config;
        $this->audit('ตั้งค่า QR รับชำระเงิน', $branch['name']);

        return $this->publicBranch($branch)['paymentQr'];
    }
}
