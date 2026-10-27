<?php

declare(strict_types=1);

namespace App\Services;

trait RoleActions
{
    private function currentRole(): ?array
    {
        return $this->first('roles', fn ($role) => $role['tenantId'] === $this->user['tenantId'] && $role['key'] === $this->user['role']);
    }

    private function roleState(): array
    {
        $owner = $this->user['role'] === 'Owner';

        return [
            'visibleMenus' => $owner ? array_keys(RoleCatalog::MENUS) : ($this->currentRole()['menus'] ?? []),
            'roles' => $owner ? array_map(function ($role): array {
                return [...$role, 'menus' => $role['key'] === 'Owner' ? array_keys(RoleCatalog::MENUS) : $role['menus'], 'permissions' => $role['key'] === 'Owner' ? array_keys(RoleCatalog::PERMISSIONS) : $role['permissions'], 'protected' => $role['key'] === 'Owner', 'members' => count($this->list('users', fn ($user) => $user['tenantId'] === $role['tenantId'] && $user['role'] === $role['key']))];
            }, $this->list('roles', fn ($role) => $role['tenantId'] === $this->user['tenantId'])) : [],
            'roleMenus' => $owner ? array_map(fn ($key, $menu) => ['id' => $key, ...$menu], array_keys(RoleCatalog::MENUS), array_values(RoleCatalog::MENUS)) : [],
        ];
    }

    private function roles(?string $id, string $method, array $body): array
    {
        $this->check($this->user['role'] === 'Owner', 'เฉพาะเจ้าของร้านเท่านั้นที่จัดการบทบาทและสิทธิ์ได้', 403);
        if ($id === null && $method === 'GET') {
            return ['body' => $this->roleState()['roles']];
        }
        $this->check(($id === null && $method === 'POST') || ($id !== null && in_array($method, ['PATCH', 'DELETE'], true)), 'ไม่พบ API', 404);
        $current = $id ? $this->first('roles', fn ($role) => $role['id'] === $id && $role['tenantId'] === $this->user['tenantId']) : null;
        if ($id) {
            $this->check($current, 'ไม่พบบทบาท', 404);
            $this->check($current['key'] !== 'Owner', 'ไม่สามารถแก้ไขหรือลบบทบาทเจ้าของร้านได้', 409);
        }
        if ($method === 'DELETE') {
            $this->check(! $this->first('users', fn ($user) => $user['tenantId'] === $this->user['tenantId'] && $user['role'] === $current['key']), 'ยังมีทีมงานใช้บทบาทนี้ กรุณาเปลี่ยนบทบาทของทีมงานก่อนลบ', 409);
            $this->data['roles'] = $this->list('roles', fn ($role) => $role['id'] !== $id);
            $this->audit('ลบบทบาท', $current['name']);

            return ['body' => ['ok' => true]];
        }
        $this->check($body && ! array_diff(array_keys($body), ['name', 'menus', 'scope', 'refund']), 'ข้อมูลบทบาทไม่ถูกต้อง');
        $name = $body['name'] ?? $current['name'] ?? null;
        $menus = $body['menus'] ?? $current['menus'] ?? null;
        $scope = $body['scope'] ?? $current['scope'] ?? 'branch';
        $refund = $body['refund'] ?? in_array('refund', $current['permissions'] ?? [], true);
        $this->check(is_string($name) && mb_strlen(trim($name)) > 0 && mb_strlen(trim($name)) <= 100, 'กรุณาระบุชื่อบทบาทไม่เกิน 100 ตัวอักษร');
        $name = trim($name);
        $this->check(! $this->first('roles', fn ($role) => $role['tenantId'] === $this->user['tenantId'] && $role['id'] !== $id && mb_strtolower($role['name']) === mb_strtolower($name)), 'ชื่อบทบาทนี้มีในร้านแล้ว', 409);
        $this->check(is_array($menus) && array_is_list($menus) && count($menus) === count(array_unique($menus, SORT_REGULAR)), 'รายการเมนูไม่ถูกต้อง');
        foreach ($menus as $menu) {
            $this->check(is_string($menu) && isset(RoleCatalog::MENUS[$menu]), 'เมนูไม่ถูกต้อง');
        }
        $this->check(in_array($scope, ['branch', 'tenant'], true) && is_bool($refund), 'ขอบเขตหรือสิทธิ์ไม่ถูกต้อง');
        $this->check(! in_array('hq', $menus, true) || $scope === 'tenant', 'เมนูสำนักงานใหญ่ต้องใช้สิทธิ์ทุกสาขา');
        $permissions = array_values(array_unique(array_map(fn ($menu) => RoleCatalog::MENUS[$menu]['permission'], $menus)));
        if ($refund) {
            $permissions[] = 'refund';
        }
        $key = $current['key'] ?? 'role_'.$this->uid();
        $role = ['id' => $current['id'] ?? $this->uid(), 'tenantId' => $this->user['tenantId'], 'key' => $key, 'name' => $name, 'menus' => $menus, 'permissions' => $permissions, 'scope' => $scope, 'protected' => false];
        if ($current) {
            $target = &$this->record('roles', fn ($item) => $item['id'] === $id);
            $target = $role;
        } else {
            $this->data['roles'][] = $role;
        }
        $this->audit($current ? 'แก้ไขบทบาทและสิทธิ์' : 'เพิ่มบทบาท', $name);

        return ['status' => $current ? 200 : 201, 'body' => $role];
    }
}
