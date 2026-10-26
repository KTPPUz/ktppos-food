<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AuthToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

trait ManagementActions
{
    private function editMenu(string $id, array $body): array
    {
        $this->allowed('menu');
        $menu = $this->first('menu', fn ($m) => $m['id'] === $id);
        $this->check($menu, 'ไม่พบสินค้า', 404);
        $tenant = $this->user['tenantId'];
        $custom = $this->data['menuCustom'][$tenant][$id] ?? [];
        if (array_key_exists('price', $body)) {
            $price = $this->number($body['price']);
            $this->check($price >= 0 && $price <= 100000, 'ราคาไม่ถูกต้อง');
            $custom['price'] = $price;
        }
        if (array_key_exists('discount', $body)) {
            $discount = $body['discount'];
            $this->check(is_array($discount) && in_array($discount['type'] ?? null, ['none', 'percent', 'fixed'], true), 'ประเภทส่วนลดไม่ถูกต้อง');
            $value = $discount['value'] ?? null;
            $this->check((is_int($value) || is_float($value)) && is_finite((float) $value) && $value >= 0 && $value <= ($discount['type'] === 'percent' ? 100 : 100000) && abs($value - $this->money($value)) < 1e-8, 'ส่วนลดไม่ถูกต้อง');
            $this->check($discount['type'] !== 'none' || $value == 0, 'เมื่อไม่ใช้ส่วนลด ยอดส่วนลดต้องเป็น 0');
            $custom['discount'] = ['type' => $discount['type'], 'value' => $this->money($value)];
        }
        if (array_key_exists('category', $body)) {
            $this->check(array_filter(config('pos.categories'), fn ($c) => $c['id'] !== 'all' && $c['id'] === $body['category']), 'หมวดหมู่ไม่ถูกต้อง');
            $custom['category'] = $body['category'];
        }
        if (array_key_exists('modifiers', $body)) {
            $groups = $body['modifiers'];
            $this->check(is_array($groups) && array_is_list($groups) && count($groups) <= 8, 'กลุ่มตัวเลือกไม่ถูกต้อง');
            foreach ($groups as $group) {
                $this->check(is_array($group) && is_string($group['id'] ?? null) && is_string($group['name'] ?? null) && trim($group['name']) && is_array($group['options'] ?? null) && array_is_list($group['options']) && count($group['options']) > 0, 'ตัวเลือกไม่ถูกต้อง');
                foreach ($group['options'] as $option) {
                    $this->check(is_array($option) && is_string($option['name'] ?? null) && trim($option['name']) && (is_int($option['price'] ?? null) || is_float($option['price'] ?? null)) && is_finite((float) $option['price']) && $option['price'] >= 0, 'ราคาตัวเลือกไม่ถูกต้อง');
                }
                $this->check(count(array_unique(array_column($group['options'], 'name'))) === count($group['options']), 'ชื่อตัวเลือกซ้ำ');
            }
            $this->check(count(array_unique(array_column($groups, 'id'))) === count($groups), 'กลุ่มตัวเลือกซ้ำ');
            $custom['modifiers'] = $groups;
        }
        if (array_key_exists('available', $body)) {
            $custom['available'] = (bool) $body['available'];
        }
        if (array_key_exists('name', $body)) {
            $this->check(is_string($body['name']) && trim($body['name']), 'กรุณาใส่ชื่อเมนู');
            $custom['name'] = mb_substr($body['name'], 0, 100);
        }
        if (! empty($body['branchId'])) {
            $this->feature('enterprise');
            $this->check(is_string($body['branchId']), 'สาขาไม่ถูกต้อง');
            $this->branch($body['branchId']);
            $custom['overrides'][$body['branchId']] = $custom['price'] ?? $menu['price'];
            unset($custom['price']);
        }
        $this->data['menuCustom'][$tenant][$id] = $custom;
        $this->audit('แก้ไขเมนู', $menu['name']);

        return [...$menu, ...$custom];
    }

    private function staff(?string $id, string $method, array $body): array
    {
        $this->check($this->user['role'] === 'Owner', 'เฉพาะเจ้าของร้านเท่านั้นที่จัดการทีมงานได้', 403);
        $this->check(($id === null && $method === 'POST') || ($id !== null && in_array($method, ['PATCH', 'DELETE'], true)), 'ไม่พบ API', 404);
        $current = $id ? $this->first('users', fn ($u) => $u['id'] === $id && $u['tenantId'] === $this->user['tenantId']) : null;
        if ($id) {
            $this->check($current, 'ไม่พบพนักงาน', 404);
            $this->check($id !== $this->user['id'], 'ไม่สามารถแก้ไขหรือลบบัญชีที่กำลังใช้งานได้', 409);
        }
        if ($method === 'DELETE') {
            AuthToken::where('employee_id', $id)->delete();
            $this->data['users'] = $this->list('users', fn ($u) => $u['id'] !== $id);
            $this->audit('ลบทีมงาน', $current['name'], $current['branchId']);

            return ['body' => ['ok' => true]];
        }
        $updates = [];
        foreach (['name', 'email', 'role', 'branchId', 'pin'] as $field) {
            if ($current && ! array_key_exists($field, $body)) {
                continue;
            }
            $this->check(is_string($body[$field] ?? null), 'กรุณาระบุ '.$field);
            $value = trim($body[$field]);
            if ($field === 'name') {
                $this->check(mb_strlen($value) > 0 && mb_strlen($value) <= 100, 'กรุณาระบุชื่อทีมงานไม่เกิน 100 ตัวอักษร');
            }
            if ($field === 'email') {
                $this->check(strlen($value) <= 254 && preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/D', $value), 'รูปแบบอีเมลไม่ถูกต้อง');
                $value = mb_strtolower($value);
                $this->check(! $this->first('users', fn ($u) => $u['tenantId'] === $this->user['tenantId'] && $u['id'] !== $id && mb_strtolower($u['email']) === $value), 'อีเมลนี้มีในทีมงานแล้ว', 409);
            }
            if ($field === 'role') {
                $this->check(in_array($value, self::ROLES, true), 'บทบาทไม่ถูกต้อง');
            }
            if ($field === 'branchId') {
                $this->check($this->first('branches', fn ($b) => $b['id'] === $value && $b['tenantId'] === $this->user['tenantId']), 'ไม่พบสาขาในร้านนี้', 403);
            }
            if ($field === 'pin') {
                $this->check(preg_match('/^\d{4,8}$/D', $value), 'PIN ต้องเป็นตัวเลข 4–8 หลัก');
                $updates['pinHash'] = Hash::make($value);
            } else {
                $updates[$field] = $value;
            }
        }
        $this->check($updates, 'กรุณาระบุข้อมูลที่ต้องการแก้ไข');
        if ($current) {
            $employee = &$this->record('users', fn ($u) => $u['id'] === $id);
            if (isset($updates['pinHash']) || (isset($updates['role']) && $updates['role'] !== $employee['role']) || (isset($updates['branchId']) && $updates['branchId'] !== $employee['branchId'])) {
                AuthToken::where('employee_id', $id)->delete();
            }
            $employee = [...$employee, ...$updates];
            $this->audit('แก้ไขทีมงาน', $employee['name'], $employee['branchId']);

            return ['body' => $this->safe($employee)];
        }
        $employee = [...$updates, 'id' => $this->uid(), 'tenantId' => $this->user['tenantId']];
        $this->data['users'][] = $employee;
        $this->audit('เพิ่มทีมงาน', $employee['name'], $employee['branchId']);

        return ['status' => 201, 'body' => $this->safe($employee)];
    }

    private function management(string $path, string $method, array $body, Request $request): array
    {
        if ($path === '/settings' && $method === 'PATCH') {
            $this->allowed('settings');
            $updates = [];
            foreach (['taxRate', 'serviceRate'] as $key) {
                $value = $this->number($body[$key] ?? null);
                $this->check($value >= 0 && $value <= 30, 'อัตราต้องอยู่ระหว่าง 0–30%');
                $updates[$key] = $value;
            }
            $settings = &$this->record('settings', fn ($s) => $s['tenantId'] === $this->user['tenantId']);
            $settings = [...$settings, ...$updates];
            $this->audit('ตั้งค่าอัตราบริการ/ภาษี', json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));

            return $settings;
        }
        if ($path === '/shifts' && $method === 'POST') {
            $this->allowed('reports');
            $this->check(is_string($body['branchId'] ?? null), 'กรุณาระบุสาขา');
            $branch = $this->branch($body['branchId']);
            if (($body['open'] ?? null) === false) {
                $this->check(! $this->first('orders', fn ($o) => $o['branchId'] === $branch['id'] && ! in_array($o['status'], self::CLOSED, true)), 'ยังมีบิลเปิดอยู่ กรุณาปิดบิลก่อน', 409);
            }
            $shift = &$this->record('shifts', fn ($s) => $s['branchId'] === $branch['id']);
            $shift['open'] = (bool) ($body['open'] ?? false);
            $shift[$shift['open'] ? 'openedAt' : 'closedAt'] = $this->now();
            $this->audit($shift['open'] ? 'เปิดกะ' : 'ปิดกะ', $branch['name'], $branch['id']);

            return $shift;
        }
        if ($path === '/inventory/adjust' && $method === 'POST') {
            $this->allowed('inventory');
            $this->feature();
            $ingredient = &$this->record('ingredients', fn ($i) => $i['id'] === ($body['ingredientId'] ?? null) && $this->scope($i), 'ไม่พบวัตถุดิบ');
            $qty = $this->number($body['qty'] ?? null);
            $this->check($qty != 0 && $ingredient['stock'] + $qty >= 0, 'จำนวนปรับยอดไม่ถูกต้อง');
            $this->reason($body);
            $ingredient['stock'] = $this->money($ingredient['stock'] + $qty);
            array_unshift($this->data['movements'], ['id' => $this->uid(), 'tenantId' => $this->user['tenantId'], 'branchId' => $ingredient['branchId'], 'ingredientId' => $ingredient['id'], 'qty' => $qty, 'reason' => $body['reason'], 'userId' => $this->user['id'], 'at' => $this->now()]);
            $this->audit('ปรับสต๊อก', $ingredient['name'].' '.$qty.' · '.$body['reason'], $ingredient['branchId']);

            return $ingredient;
        }
        if ($path === '/inventory/movements' && $method === 'GET') {
            $this->allowed('inventory');

            return array_reverse($this->list('movements', $this->scope(...)));
        }
        if ($path === '/transfers' && $method === 'POST') {
            $this->allowed('hq');
            $this->feature('enterprise');
            $this->check(is_string($body['fromBranchId'] ?? null) && is_string($body['toBranchId'] ?? null), 'กรุณาระบุสาขา');
            $from = $this->branch($body['fromBranchId']);
            $to = $this->branch($body['toBranchId']);
            $this->check($from['id'] !== $to['id'], 'ต้องเลือกสาขาต่างกัน');
            $ingredient = $this->first('ingredients', fn ($i) => $i['id'] === ($body['ingredientId'] ?? null) && $i['branchId'] === $from['id']);
            $this->check($ingredient, 'ไม่พบวัตถุดิบ');
            $qty = $this->number($body['qty'] ?? null);
            $this->check($qty > 0 && $qty <= $ingredient['stock'], 'จำนวนโอนไม่ถูกต้อง');
            $transfer = ['id' => $this->uid(), 'tenantId' => $this->user['tenantId'], 'branchId' => $from['id'], 'fromBranchId' => $from['id'], 'toBranchId' => $to['id'], 'ingredientId' => $ingredient['id'], 'name' => $ingredient['name'], 'qty' => $qty, 'status' => 'pending', 'requestedBy' => $this->user['id'], 'at' => $this->now()];
            array_unshift($this->data['transfers'], $transfer);
            $this->audit('ขอโอนสินค้า', $ingredient['name'].' '.$qty.' → '.$to['name'], $from['id']);

            return $transfer;
        }
        if (preg_match('#^/transfers/([^/]+)/approve$#D', $path, $match) && $method === 'POST') {
            $this->allowed('hq');
            $this->feature('enterprise');
            $transfer = &$this->record('transfers', fn ($t) => $t['id'] === $match[1] && $t['tenantId'] === $this->user['tenantId']);
            $this->check($transfer['status'] === 'pending', 'รายการนี้ดำเนินการแล้ว', 409);
            $this->branch($transfer['fromBranchId']);
            $this->branch($transfer['toBranchId']);
            $source = &$this->record('ingredients', fn ($i) => $i['id'] === $transfer['ingredientId']);
            $dest = &$this->record('ingredients', fn ($i) => $i['name'] === $transfer['name'] && $i['branchId'] === $transfer['toBranchId']);
            $this->check($source['stock'] >= $transfer['qty'], 'สต๊อกต้นทางไม่พอ', 409);
            $source['stock'] = $this->money($source['stock'] - $transfer['qty']);
            $dest['stock'] = $this->money($dest['stock'] + $transfer['qty']);
            $transfer['status'] = 'approved';
            $transfer['approvedBy'] = $this->user['id'];
            $transfer['approvedAt'] = $this->now();
            foreach ([[$source, -$transfer['qty']], [$dest, $transfer['qty']]] as [$ingredient, $qty]) {
                $this->data['movements'][] = ['id' => $this->uid(), 'tenantId' => $this->user['tenantId'], 'branchId' => $ingredient['branchId'], 'ingredientId' => $ingredient['id'], 'qty' => $qty, 'reason' => 'โอน '.$transfer['id'], 'userId' => $this->user['id'], 'at' => $this->now()];
            }
            $this->audit('อนุมัติโอนสินค้า', $transfer['name'].' '.$transfer['qty'], $transfer['fromBranchId']);

            return $transfer;
        }
        if ($path === '/reports/sales' && $method === 'GET') {
            $this->allowed('reports');
            $orders = $this->list('orders', fn ($o) => $this->scope($o) && in_array($o['status'], ['paid', 'refunded'], true) && (! $request->query('branchId') || $o['branchId'] === $request->query('branchId')));

            return ['orders' => $orders, 'total' => $this->money(array_sum(array_map(fn ($o) => $o['status'] === 'paid' ? $o['totals']['total'] : 0, $orders))), 'refund' => $this->money(array_sum(array_map(fn ($o) => $o['status'] === 'refunded' ? $o['totals']['total'] : 0, $orders)))];
        }
        throw new ApiError('ไม่พบ API', 404);
    }
}
