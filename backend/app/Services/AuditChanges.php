<?php

declare(strict_types=1);

namespace App\Services;

final class AuditChanges
{
    private const ENTITIES = ['branches' => 'สาขา', 'users' => 'ทีมงาน', 'roles' => 'บทบาท', 'tables' => 'โต๊ะ', 'orders' => 'บิล', 'ingredients' => 'วัตถุดิบ', 'shifts' => 'กะขาย', 'settings' => 'ตั้งค่าร้าน', 'transfers' => 'โอนวัตถุดิบ', 'movements' => 'รายการสต๊อก', 'tableSessions' => 'รอบ QR สั่งอาหาร', 'menu' => 'เมนูอาหาร'];

    private const OMIT = ['id', 'tenantId', 'branchId', 'token', 'tokenHash', 'submissions', 'key', 'protected', 'permissions', 'version', 'popular', 'ingredientId', 'serviceSessionId'];

    private const LABELS = ['categories' => 'ประเภทอาหาร', 'branch' => 'สาขา', 'name' => 'ชื่อ', 'email' => 'อีเมล', 'role' => 'บทบาท', 'pinHash' => 'PIN', 'pin' => 'PIN', 'price' => 'ราคากลาง', 'overrides' => 'ราคาเฉพาะสาขา', 'image' => 'รูปภาพ', 'category' => 'หมวดหมู่', 'available' => 'พร้อมขาย', 'discount' => 'ส่วนลด', 'modifiers' => 'ตัวเลือกเสริม', 'menus' => 'เมนูที่เข้าถึงได้', 'scope' => 'ขอบเขตข้อมูล', 'refund' => 'ส่วนลด / ยกเลิก / คืนเงิน', 'seats' => 'จำนวนที่นั่ง', 'reservation' => 'การจอง', 'address' => 'ที่อยู่', 'phone' => 'เบอร์โทร', 'target' => 'เป้าหมายยอดขาย', 'paymentQr' => 'QR รับชำระเงิน', 'taxRate' => 'ภาษี (%)', 'serviceRate' => 'ค่าบริการ (%)', 'stock' => 'สต๊อก', 'minimum' => 'ขั้นต่ำ', 'unit' => 'หน่วย', 'qty' => 'จำนวน', 'status' => 'สถานะ', 'kitchenStatus' => 'สถานะอาหาร', 'items' => 'รายการอาหาร', 'cancelledItems' => 'รายการที่ยกเลิก', 'payment' => 'การรับชำระ', 'totals' => 'ยอดรวม', 'tableId' => 'โต๊ะ', 'type' => 'ประเภทบิล', 'receipt' => 'เลขที่ใบเสร็จ', 'open' => 'เปิดกะ', 'openingCash' => 'เงินทอนเริ่มต้น', 'en' => 'ชื่อภาษาอังกฤษ', 'reason' => 'เหตุผล', 'note' => 'หมายเหตุ', 'orderIds' => 'บิลในรอบ', 'acceptingOrders' => 'เปิดรับออเดอร์', 'createdAt' => 'เวลาสร้าง', 'paidAt' => 'เวลาชำระ', 'openedAt' => 'เวลาเปิดกะ', 'closedAt' => 'เวลาปิดกะ', 'expiresAt' => 'เวลาหมดอายุ', 'kitchenBatches' => 'รอบครัว', 'source' => 'ช่องทาง', 'number' => 'เลขที่บิล', 'createdBy' => 'ผู้สร้าง', 'requestedBy' => 'ผู้ขอ', 'approvedBy' => 'ผู้อนุมัติ', 'approvedAt' => 'เวลาอนุมัติ', 'fromBranchId' => 'สาขาต้นทาง', 'toBranchId' => 'สาขาปลายทาง', 'roundingAdjustment' => 'ปรับเศษยอด', 'cancelReason' => 'เหตุผลยกเลิก', 'deleted' => 'เลิกใช้งาน'];

    public function attach(array $before, array &$after): void
    {
        $existing = array_fill_keys(array_column($before['audit'], 'id'), true);
        $changes = [];
        foreach (self::ENTITIES as $collection => $entity) {
            $old = $this->records($before, $collection);
            $new = $this->records($after, $collection);
            foreach (array_unique([...array_keys($old), ...array_keys($new)]) as $id) {
                $left = $old[$id] ?? null;
                $right = $new[$id] ?? null;
                if ($left === $right) {
                    continue;
                }
                $tenant = $right['tenantId'] ?? $left['tenantId'];
                $fields = [];
                foreach (array_unique([...array_keys($left ?? []), ...array_keys($right ?? [])]) as $key) {
                    if (in_array($key, self::OMIT, true) || json_encode($left[$key] ?? null) === json_encode($right[$key] ?? null)) {
                        continue;
                    }
                    $secret = in_array($key, ['pin', 'pinHash'], true);
                    if (! $secret && json_encode($this->clean($left[$key] ?? null)) === json_encode($this->clean($right[$key] ?? null))) {
                        continue;
                    }
                    $fields[] = ['key' => $key, 'label' => self::LABELS[$key] ?? $key, 'before' => $secret ? ($left ? 'ปกปิด' : null) : $this->clean($left[$key] ?? null), 'after' => $secret ? ($right ? 'ปกปิด' : null) : $this->clean($right[$key] ?? null), 'redacted' => $secret];
                }
                if (! $fields) {
                    continue;
                }
                $changes[$tenant][] = ['entity' => $entity, 'id' => (string) $id, 'label' => $right['name'] ?? $left['name'] ?? (isset($right['number']) ? '#'.$right['number'] : (isset($left['number']) ? '#'.$left['number'] : $entity)), 'type' => $left === null ? 'create' : ($right === null ? 'delete' : 'update'), 'fields' => $fields];
            }
        }
        foreach ($after['audit'] as &$entry) {
            if (! isset($existing[$entry['id']])) {
                $entry['changes'] = $changes[$entry['tenantId']] ?? [];
            }
        }
    }

    private function records(array $data, string $collection): array
    {
        $records = [];
        if ($collection === 'menu') {
            foreach ($data['tenants'] as $tenant) {
                foreach ($data['menu'] as $menu) {
                    if (isset($menu['tenantId']) && $menu['tenantId'] !== $tenant['id']) {
                        continue;
                    }
                    $custom = $data['menuCustom'][$tenant['id']][$menu['id']] ?? [];
                    if (! empty($custom['deleted'])) {
                        continue;
                    }
                    $records[$tenant['id'].':'.$menu['id']] = [...$menu, ...$custom, 'overrides' => array_replace($menu['overrides'] ?? [], $custom['overrides'] ?? []), 'tenantId' => $tenant['id']];
                }
            }

            return $records;
        }
        foreach ($data[$collection] ?? [] as $row) {
            if ($collection === 'settings') {
                $row['categories'] ??= array_values(array_filter(config('pos.categories'), fn ($item) => $item['id'] !== 'all'));
            }
            if (! empty($row['deleted'])) {
                continue;
            }
            if ($collection === 'users') {
                $role = array_values(array_filter($data['roles'], fn ($role) => $role['tenantId'] === $row['tenantId'] && $role['key'] === $row['role']))[0] ?? null;
                $row['role'] = $role['name'] ?? $row['role'];
                $branch = array_values(array_filter($data['branches'], fn ($branch) => $branch['id'] === $row['branchId']))[0] ?? null;
                $row['branch'] = $branch['name'] ?? $row['branchId'];
            }
            if ($collection === 'roles') {
                $row['menus'] = array_map(fn ($id) => RoleCatalog::MENUS[$id]['label'] ?? $id, $row['menus']);
                $row['refund'] = in_array('refund', $row['permissions'], true);
            }
            $records[$row['id'] ?? $row['tenantId']] = $row;
        }

        return $records;
    }

    private function clean(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        $result = [];
        foreach ($value as $key => $item) {
            if (in_array($key, ['pin', 'pinHash', 'token', 'tokenHash', 'submissions', 'version'], true)) {
                continue;
            }
            $result[$key] = $this->clean($item);
        }

        return $result;
    }
}
