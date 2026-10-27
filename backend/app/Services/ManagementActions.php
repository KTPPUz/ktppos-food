<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AuthToken;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;

trait ManagementActions
{
    private function editTable(string $id, array $body): array
    {
        $this->allowed('settings');
        $this->feature();
        $table = &$this->record('tables', fn ($t) => $t['id'] === $id && $this->scope($t), 'ไม่พบโต๊ะ');
        $this->check($body && ! array_diff(array_keys($body), ['name', 'seats']), 'แก้ไขได้เฉพาะชื่อโต๊ะและจำนวนที่นั่ง');
        $updates = [];
        if (array_key_exists('name', $body)) {
            $this->check(is_string($body['name']), 'ชื่อโต๊ะไม่ถูกต้อง');
            $name = trim($body['name']);
            $this->check(mb_strlen($name) > 0 && mb_strlen($name) <= 50, 'กรุณาระบุชื่อโต๊ะไม่เกิน 50 ตัวอักษร');
            $this->check(! $this->first('tables', fn ($t) => empty($t['deleted']) && $t['id'] !== $id && $t['branchId'] === $table['branchId'] && mb_strtolower(trim($t['name'])) === mb_strtolower($name)), 'ชื่อโต๊ะนี้มีในสาขาแล้ว', 409);
            $updates['name'] = $name;
        }
        if (array_key_exists('seats', $body)) {
            $this->check(is_int($body['seats']) && $body['seats'] >= 1 && $body['seats'] <= 50, 'จำนวนที่นั่งต้องเป็นจำนวนเต็ม 1–50 ที่นั่ง');
            $updates['seats'] = $body['seats'];
        }
        $before = $table['name'].' · '.$table['seats'].' ที่นั่ง';
        $table = [...$table, ...$updates];
        $this->audit('แก้ไขข้อมูลโต๊ะ', $before.' → '.$table['name'].' · '.$table['seats'].' ที่นั่ง', $table['branchId']);

        return $table;
    }

    private function editMenu(string $id, array $body, mixed $image = null): array
    {
        $this->allowed('menu');
        $menu = $this->first('menu', fn ($m) => $m['id'] === $id && (! isset($m['tenantId']) || $m['tenantId'] === $this->user['tenantId']) && empty($this->data['menuCustom'][$this->user['tenantId']][$id]['deleted']));
        $this->check($menu, 'ไม่พบสินค้า', 404);
        $tenant = $this->user['tenantId'];
        $custom = $this->data['menuCustom'][$tenant][$id] ?? [];
        $centralPrice = $custom['price'] ?? null;
        $this->check(! array_diff(array_keys($body), ['name', 'en', 'price', 'category', 'modifiers', 'available', 'branchId', 'discount']), 'ข้อมูลเมนูไม่ถูกต้อง');
        if (array_key_exists('en', $body)) {
            $this->check(is_string($body['en']) && mb_strlen($body['en']) <= 100, 'ชื่อภาษาอังกฤษไม่ถูกต้อง');
            $custom['en'] = trim($body['en']);
        }
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
            $this->check(array_filter($this->categories($tenant), fn ($c) => $c['id'] !== 'all' && $c['id'] === $body['category']), 'หมวดหมู่ไม่ถูกต้อง');
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
            $this->check(is_bool($body['available']), 'สถานะเมนูไม่ถูกต้อง');
            $custom['available'] = $body['available'];
        }
        if (array_key_exists('name', $body)) {
            $this->check(is_string($body['name']) && trim($body['name']) && mb_strlen(trim($body['name'])) <= 100, 'กรุณาใส่ชื่อเมนู');
            $custom['name'] = mb_substr($body['name'], 0, 100);
        }
        if (! empty($body['branchId'])) {
            $this->feature('enterprise');
            $this->check(is_string($body['branchId']), 'สาขาไม่ถูกต้อง');
            $this->branch($body['branchId']);
            $custom['overrides'][$body['branchId']] = array_key_exists('price', $body) ? $price : ($custom['overrides'][$body['branchId']] ?? $centralPrice ?? $menu['price']);
            if ($centralPrice !== null) {
                $custom['price'] = $centralPrice;
            } else {
                unset($custom['price']);
            }
        }
        if ($image !== null) {
            $this->check($image instanceof UploadedFile, 'กรุณาแนบไฟล์รูปภาพที่ถูกต้อง');
            $path = app(MenuImages::class)->store($image);
            $this->uploadedImages[] = $path;
            $previous = $custom['image'] ?? null;
            $custom['image'] = $path;
            if (is_string($previous) && str_starts_with($previous, '/media/menu-images/')) {
                $shared = false;
                foreach ($this->data['menuCustom'] ?? [] as $tenantId => $menus) {
                    foreach ($menus as $menuId => $overlay) {
                        if (($tenantId !== $tenant || $menuId !== $id) && ($overlay['image'] ?? null) === $previous) {
                            $shared = true;
                        }
                    }
                }
                if (! $shared) {
                    $this->replacedImages[] = $previous;
                }
            }
        }
        $this->data['menuCustom'][$tenant][$id] = $custom;
        $this->audit('แก้ไขเมนู', $menu['name']);

        return array_values(array_filter($this->catalog($tenant), fn ($item) => $item['id'] === $id))[0];
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
                $this->check($this->first('roles', fn ($role) => $role['tenantId'] === $this->user['tenantId'] && $role['key'] === $value), 'บทบาทไม่ถูกต้อง');
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
                $this->check(! $this->first('orders', fn ($o) => $o['branchId'] === $branch['id'] && OrderFlow::serviceOpen($o)), 'ยังมีบิลเปิดหรืออาหารที่ยังเสิร์ฟไม่ครบ กรุณาดำเนินการก่อนปิดกะ', 409);
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
