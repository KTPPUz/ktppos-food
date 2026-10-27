<?php

declare(strict_types=1);

namespace App\Services;

trait CatalogActions
{
    private function createMenu(array $body, mixed $image): array
    {
        $this->allowed('menu');
        $this->check(isset($body['name'], $body['category'], $body['price']), 'กรุณาระบุชื่อ หมวดหมู่ และราคา');
        $this->check(! array_key_exists('branchId', $body), 'กรุณาสร้างราคากลางก่อนกำหนดราคาเฉพาะสาขา');
        $id = 'menu_'.$this->uid();
        $this->data['menu'][] = ['id' => $id, 'tenantId' => $this->user['tenantId'], 'name' => '', 'en' => '', 'category' => '', 'price' => 0, 'image' => 'data:image/svg+xml;base64,'.base64_encode('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eef1e8"/><text x="200" y="165" text-anchor="middle" font-size="52" fill="#a4b394">🍽</text></svg>'), 'popular' => false, 'available' => true, 'overrides' => [], 'modifiers' => []];
        $result = $this->editMenu($id, $body, $image);
        $this->audit('เพิ่มเมนูอาหาร', $result['name']);

        return ['status' => 201, 'body' => $result];
    }

    private function deleteMenu(string $id): array
    {
        $this->allowed('menu');
        $menu = $this->first('menu', fn ($menu) => $menu['id'] === $id && (! isset($menu['tenantId']) || $menu['tenantId'] === $this->user['tenantId']));
        $this->check($menu && empty($this->data['menuCustom'][$this->user['tenantId']][$id]['deleted']), 'ไม่พบเมนูอาหาร', 404);
        $this->check(! $this->first('orders', fn ($order) => $order['tenantId'] === $this->user['tenantId'] && OrderFlow::serviceOpen($order) && array_filter($order['items'], fn ($item) => $item['menuId'] === $id)), 'เมนูนี้อยู่ในบิลที่ยังไม่ปิด กรุณาปิดบิลก่อนลบ', 409);
        $this->data['menuCustom'][$this->user['tenantId']][$id] = [...($this->data['menuCustom'][$this->user['tenantId']][$id] ?? []), 'deleted' => true, 'available' => false];
        $this->audit('ลบเมนูอาหาร', $this->data['menuCustom'][$this->user['tenantId']][$id]['name'] ?? $menu['name']);

        return ['ok' => true];
    }

    private function createTable(array $body): array
    {
        $this->allowed('settings');
        $this->feature();
        $this->check(is_string($body['branchId'] ?? null) && ! array_diff(array_keys($body), ['name', 'seats', 'branchId']), 'ข้อมูลโต๊ะไม่ถูกต้อง');
        $branch = $this->branch($body['branchId']);
        $id = 'table_'.$this->uid();
        $this->data['tables'][] = ['id' => $id, 'tenantId' => $this->user['tenantId'], 'branchId' => $branch['id'], 'name' => '', 'seats' => 4, 'reservation' => null];
        $this->check(isset($body['name'], $body['seats']), 'กรุณาระบุชื่อโต๊ะและจำนวนที่นั่ง');
        unset($body['branchId']);
        $table = $this->editTable($id, $body);
        $this->audit('เพิ่มโต๊ะ', $table['name'], $branch['id']);

        return ['status' => 201, 'body' => $table];
    }

    private function deleteTable(string $id): array
    {
        $this->allowed('settings');
        $this->feature();
        $table = &$this->record('tables', fn ($table) => $table['id'] === $id && $this->scope($table), 'ไม่พบโต๊ะ');
        $this->check($table['reservation'] === null, 'กรุณายกเลิกการจองก่อนลบโต๊ะ', 409);
        $this->check(! $this->first('orders', fn ($order) => ($order['tableId'] ?? null) === $id && OrderFlow::serviceOpen($order)), 'โต๊ะนี้มีบิลที่ยังไม่ปิด ไม่สามารถลบได้', 409);
        $this->check(! $this->first('tableSessions', fn ($session) => $session['tableId'] === $id && $this->active($session)), 'กรุณาปิด QR สั่งอาหารก่อนลบโต๊ะ', 409);
        $table['deleted'] = true;
        $this->audit('ลบโต๊ะ', $table['name'], $table['branchId']);

        return ['ok' => true];
    }

    private function bestSellers(string $tenantId, array $menus): array
    {
        $counts = [];
        $since = now()->subDays(30)->getTimestamp();
        foreach ($this->list('orders', fn ($order) => $order['tenantId'] === $tenantId && $order['status'] === 'paid' && strtotime($order['paidAt'] ?? $order['createdAt']) >= $since) as $order) {
            foreach ($order['items'] as $item) {
                $counts[$item['menuId']] = ($counts[$item['menuId']] ?? 0) + $item['qty'];
            }
        }
        $eligible = array_values(array_filter(array_column($menus, 'id'), fn ($id) => ($counts[$id] ?? 0) > 0));
        usort($eligible, fn ($a, $b) => ($counts[$b] <=> $counts[$a]) ?: strcmp($a, $b));

        return ['counts' => $counts, 'ids' => array_slice($eligible, 0, 5)];
    }
}
