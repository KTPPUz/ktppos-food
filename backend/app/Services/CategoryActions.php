<?php

declare(strict_types=1);

namespace App\Services;

trait CategoryActions
{
    private const CATEGORY_ICONS = ['Grid2X2', 'Utensils', 'Soup', 'Pizza', 'Salad', 'Coffee', 'IceCreamBowl'];

    private function categories(string $tenantId): array
    {
        $defaults = config('pos.categories');
        $settings = $this->first('settings', fn ($row) => $row['tenantId'] === $tenantId);
        $items = $settings['categories'] ?? array_values(array_filter($defaults, fn ($item) => $item['id'] !== 'all'));

        return [$defaults[0], ...$items];
    }

    private function manageCategory(?string $id, string $method, array $body): array
    {
        $this->allowed('settings');
        $this->check(($id === null && $method === 'POST') || ($id !== null && in_array($method, ['PATCH', 'DELETE'], true)), 'ไม่พบ API', 404);
        $this->check($id !== 'all', 'ไม่สามารถแก้ไขหรือลบประเภททั้งหมดได้', 409);
        $tenant = $this->user['tenantId'];
        $items = array_values(array_filter($this->categories($tenant), fn ($item) => $item['id'] !== 'all'));
        $index = $id === null ? false : array_search($id, array_column($items, 'id'), true);
        $current = $index === false ? null : $items[$index];
        if ($id !== null) {
            $this->check($current, 'ไม่พบประเภทอาหาร', 404);
        }
        if ($method === 'DELETE') {
            $this->check(count($items) > 1, 'ต้องมีประเภทอาหารอย่างน้อย 1 ประเภท', 409);
            $this->check(! array_filter($this->catalog($tenant), fn ($menu) => $menu['category'] === $id), 'ประเภทนี้ยังมีเมนูอาหารใช้งานอยู่ กรุณาย้ายเมนูไปประเภทอื่นก่อนลบ', 409);
            array_splice($items, $index, 1);
            $this->saveCategories($items);
            $this->audit('ลบประเภทอาหาร', $current['name']);

            return ['body' => ['ok' => true]];
        }
        $this->check($body && ! array_diff(array_keys($body), ['name', 'icon', 'order']), 'ข้อมูลประเภทอาหารไม่ถูกต้อง');
        $name = array_key_exists('name', $body) ? $body['name'] : ($current['name'] ?? null);
        $icon = array_key_exists('icon', $body) ? $body['icon'] : ($current['icon'] ?? 'Utensils');
        $order = array_key_exists('order', $body) ? $body['order'] : ($index === false ? count($items) + 1 : $index + 1);
        $this->check(is_string($name) && mb_strlen(trim($name)) > 0 && mb_strlen(trim($name)) <= 80, 'กรุณาระบุชื่อประเภทอาหารไม่เกิน 80 ตัวอักษร');
        $name = trim($name);
        $this->check(! array_filter($this->categories($tenant), fn ($item) => $item['id'] !== $id && mb_strtolower(trim($item['name'])) === mb_strtolower($name)), 'ชื่อประเภทอาหารนี้มีในร้านแล้ว', 409);
        $this->check(is_string($icon) && in_array($icon, self::CATEGORY_ICONS, true), 'ไอคอนไม่ถูกต้อง');
        $this->check(is_int($order) && $order >= 1 && $order <= count($items) + ($current ? 0 : 1), 'ลำดับประเภทอาหารไม่ถูกต้อง');
        $category = ['id' => $current['id'] ?? 'category_'.$this->uid(), 'name' => $name, 'icon' => $icon];
        if ($current) {
            array_splice($items, $index, 1);
        }
        array_splice($items, $order - 1, 0, [$category]);
        $this->saveCategories($items);
        $this->audit($current ? 'แก้ไขประเภทอาหาร' : 'เพิ่มประเภทอาหาร', $current ? $current['name'].' → '.$name : $name);

        return ['status' => $current ? 200 : 201, 'body' => $category];
    }

    private function saveCategories(array $items): void
    {
        $settings = &$this->record('settings', fn ($row) => $row['tenantId'] === $this->user['tenantId']);
        $settings['categories'] = array_values($items);
    }
}
