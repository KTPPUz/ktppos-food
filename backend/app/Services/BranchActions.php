<?php

declare(strict_types=1);

namespace App\Services;

trait BranchActions
{
    private function manageBranch(?string $id, string $method, array $body): array
    {
        $this->check($this->user['role'] === 'Owner', 'เฉพาะเจ้าของร้านเท่านั้นที่จัดการสาขาได้', 403);
        $this->check(($id === null && $method === 'POST') || ($id !== null && in_array($method, ['PATCH', 'DELETE'], true)), 'ไม่พบ API', 404);
        $current = $id ? $this->first('branches', fn ($branch) => $branch['id'] === $id && $branch['tenantId'] === $this->user['tenantId']) : null;
        if ($id !== null) {
            $this->check($current, 'ไม่พบสาขา', 404);
        }
        if ($method === 'DELETE') {
            return $this->deleteBranch($current);
        }
        $allowed = $current ? ['name', 'address', 'phone', 'target'] : ['name', 'address', 'phone', 'target', 'tableCount'];
        $this->check($body && ! array_diff(array_keys($body), $allowed), 'ข้อมูลสาขาไม่ถูกต้อง');
        $updates = [];
        foreach (['name' => 100, 'address' => 500, 'phone' => 30] as $field => $max) {
            if (array_key_exists($field, $body)) {
                $this->check(is_string($body[$field]) && mb_strlen(trim($body[$field])) <= $max, 'ข้อมูล'.$field.'ไม่ถูกต้อง');
                $updates[$field] = trim($body[$field]);
            }
        }
        $name = $updates['name'] ?? $current['name'] ?? '';
        $this->check($name !== '', 'กรุณาระบุชื่อสาขา');
        $this->check(! $this->first('branches', fn ($branch) => $branch['tenantId'] === $this->user['tenantId'] && $branch['id'] !== $id && mb_strtolower(trim($branch['name'])) === mb_strtolower($name)), 'ชื่อสาขานี้มีในร้านแล้ว', 409);
        if (array_key_exists('target', $body)) {
            $target = $body['target'];
            $this->check((is_int($target) || is_float($target)) && is_finite((float) $target) && $target >= 0 && $target <= 100000000 && abs($target - $this->money($target)) < 1e-8, 'เป้าหมายยอดขายต้องเป็นจำนวนเงิน 0–100,000,000 บาท');
            $updates['target'] = $this->money($target);
        }
        if ($current) {
            $branch = &$this->record('branches', fn ($branch) => $branch['id'] === $id);
            $branch = [...$branch, ...$updates];
            $this->audit('แก้ไขสาขา', $current['name'].' → '.$branch['name'].' · '.$id);

            return ['body' => $branch];
        }
        $tableCount = $body['tableCount'] ?? ($this->plan() === 'Small' ? 0 : 15);
        $this->check(is_int($tableCount) && $tableCount >= 0 && $tableCount <= 100, 'จำนวนโต๊ะต้องเป็นจำนวนเต็ม 0–100 โต๊ะ');
        $this->check($this->plan() !== 'Small' || $tableCount === 0, 'แพ็กเกจ Small ไม่รองรับการจัดการโต๊ะ');
        $id = 'branch_'.$this->uid();
        $tenantId = $this->user['tenantId'];
        $branch = ['id' => $id, 'tenantId' => $tenantId, 'name' => $name, 'address' => '', 'phone' => '', 'target' => 0, ...$updates];
        $this->data['branches'][] = $branch;
        $this->data['shifts'][] = ['id' => 'shift-'.$id, 'tenantId' => $tenantId, 'branchId' => $id, 'open' => false, 'openingCash' => 0];
        for ($i = 1; $i <= $tableCount; $i++) {
            $this->data['tables'][] = ['id' => $id.'-t'.$i, 'tenantId' => $tenantId, 'branchId' => $id, 'name' => 'T'.str_pad((string) $i, 2, '0', STR_PAD_LEFT), 'seats' => 4, 'reservation' => null];
        }
        // Keep recipe indices while creating independent, empty stock for the new branch.
        foreach ($this->list('ingredients', fn ($item) => $item['tenantId'] === $tenantId && $item['branchId'] === $this->user['branchId']) as $item) {
            if (preg_match('/-i(\d+)$/D', $item['id'], $match)) {
                $this->data['ingredients'][] = [...$item, 'id' => $id.'-i'.$match[1], 'branchId' => $id, 'stock' => 0];
            }
        }
        $this->audit('เพิ่มสาขา', $name.' · '.$id);

        return ['status' => 201, 'body' => $branch];
    }

    private function deleteBranch(array $branch): array
    {
        $id = $branch['id'];
        $this->check(count($this->list('branches', fn ($item) => $item['tenantId'] === $this->user['tenantId'])) > 1, 'ไม่สามารถลบสาขาสุดท้ายของร้านได้', 409);
        foreach (['users', 'orders', 'tableSessions', 'movements', 'audit'] as $collection) {
            $this->check(! $this->first($collection, fn ($item) => ($item['branchId'] ?? null) === $id), 'สาขานี้มีทีมงานหรือประวัติการใช้งานแล้ว ไม่สามารถลบได้', 409);
        }
        $this->check(! $this->first('transfers', fn ($item) => $item['fromBranchId'] === $id || $item['toBranchId'] === $id), 'สาขานี้มีประวัติโอนวัตถุดิบ ไม่สามารถลบได้', 409);
        $this->check(! $this->first('tables', fn ($item) => $item['branchId'] === $id && $item['reservation'] !== null), 'สาขานี้มีการจองโต๊ะ ไม่สามารถลบได้', 409);
        $this->check(! $this->first('ingredients', fn ($item) => $item['branchId'] === $id && $item['stock'] != 0), 'สาขานี้ยังมีสต๊อกวัตถุดิบ ไม่สามารถลบได้', 409);
        $this->check(! $this->first('shifts', fn ($item) => $item['branchId'] === $id && ($item['open'] || isset($item['openedAt']) || isset($item['closedAt']))), 'สาขานี้เคยเปิดกะแล้ว ไม่สามารถลบได้', 409);
        foreach ($this->catalog($this->user['tenantId']) as $menu) {
            $this->check(! array_key_exists($id, $menu['overrides'] ?? []), 'สาขานี้กำหนดราคาเมนูไว้แล้ว ไม่สามารถลบได้', 409);
        }
        if (! empty($branch['paymentQr']['image'])) {
            $this->replacedImages[] = $branch['paymentQr']['image'];
        }
        foreach (['tables', 'ingredients', 'shifts'] as $collection) {
            $this->data[$collection] = $this->list($collection, fn ($item) => $item['branchId'] !== $id);
        }
        $this->data['branches'] = $this->list('branches', fn ($item) => $item['id'] !== $id);
        $this->audit('ลบสาขา', $branch['name'].' · '.$id);

        return ['body' => ['ok' => true]];
    }
}
