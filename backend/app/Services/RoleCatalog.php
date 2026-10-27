<?php

declare(strict_types=1);

namespace App\Services;

final class RoleCatalog
{
    public const MENUS = [
        'dashboard' => ['label' => 'ภาพรวมร้าน', 'permission' => 'reports'],
        'pos' => ['label' => 'ขายหน้าร้าน', 'permission' => 'pos'],
        'payments' => ['label' => 'รับชำระเงิน', 'permission' => 'pay'],
        'tables' => ['label' => 'จัดการโต๊ะ', 'permission' => 'tables', 'plan' => 'Medium'],
        'qr' => ['label' => 'QR สั่งอาหาร', 'permission' => 'tables', 'plan' => 'Medium'],
        'kitchen' => ['label' => 'หน้าจอครัว', 'permission' => 'kitchen', 'plan' => 'Medium'],
        'menu' => ['label' => 'เมนูอาหาร', 'permission' => 'menu'],
        'inventory' => ['label' => 'คลังวัตถุดิบ', 'permission' => 'inventory', 'plan' => 'Medium'],
        'reports' => ['label' => 'รายงานการขาย', 'permission' => 'reports'],
        'paymentQr' => ['label' => 'QR รับชำระเงิน', 'permission' => 'paymentQr'],
        'branches' => ['label' => 'จัดการสาขา', 'permission' => 'branches'],
        'staff' => ['label' => 'ทีมงาน & สิทธิ์', 'permission' => 'staff'],
        'hq' => ['label' => 'สำนักงานใหญ่', 'permission' => 'hq', 'plan' => 'Enterprise'],
        'audit' => ['label' => 'ประวัติการทำรายการ', 'permission' => 'audit'],
        'settings' => ['label' => 'ตั้งค่าร้าน', 'permission' => 'settings'],
    ];

    public const PERMISSIONS = [
        'pos' => ['Owner', 'Manager', 'Cashier', 'Waiter', 'HQ Admin'],
        'pay' => ['Owner', 'Manager', 'Cashier', 'HQ Admin'],
        'kitchen' => ['Owner', 'Manager', 'Kitchen', 'HQ Admin'],
        'tables' => ['Owner', 'Manager', 'Cashier', 'Waiter', 'HQ Admin'],
        'reports' => ['Owner', 'Manager', 'Cashier', 'HQ Admin'],
        'inventory' => ['Owner', 'Manager', 'HQ Admin'], 'menu' => ['Owner', 'Manager', 'HQ Admin'],
        'staff' => ['Owner', 'Manager', 'HQ Admin'], 'settings' => ['Owner', 'HQ Admin'],
        'hq' => ['Owner', 'HQ Admin'], 'refund' => ['Owner', 'Manager', 'HQ Admin'],
        'audit' => ['Owner', 'Manager', 'HQ Admin'],
        'branches' => ['Owner'],
        'paymentQr' => ['Owner'],
    ];

    public const LABELS = ['Owner' => 'เจ้าของร้าน', 'Manager' => 'ผู้จัดการร้าน', 'Cashier' => 'แคชเชียร์', 'Waiter' => 'พนักงานเสิร์ฟ', 'Kitchen' => 'พนักงานครัว', 'HQ Admin' => 'ผู้ดูแลสำนักงานใหญ่'];

    public static function defaults(string $tenantId): array
    {
        $roles = [];
        foreach (self::LABELS as $key => $name) {
            $permissions = array_keys(array_filter(self::PERMISSIONS, fn ($roles) => in_array($key, $roles, true)));
            $roles[] = ['id' => hash('sha256', $tenantId.':'.$key), 'tenantId' => $tenantId, 'key' => $key, 'name' => $name,
                'menus' => array_keys(array_filter(self::MENUS, fn ($menu) => in_array($menu['permission'], $permissions, true))),
                'permissions' => $permissions, 'scope' => in_array($key, ['Owner', 'Manager', 'HQ Admin'], true) ? 'tenant' : 'branch', 'protected' => $key === 'Owner'];
        }

        return $roles;
    }
}
