<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class RolePermissionsTest extends TestCase
{
    use RefreshDatabase;

    private array $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('pos:seed')->assertSuccessful();
        $this->owner = $this->login('restaurant-u0');
    }

    private function login(string $id): array
    {
        $token = $this->postJson('/api/auth/login', ['userId' => $id, 'pin' => '1234'])->assertOk()->json('token');

        return ['Authorization' => 'Bearer '.$token];
    }

    public function test_custom_role_is_assignable_and_policy_changes_apply_to_existing_sessions(): void
    {
        $role = $this->postJson('/api/roles', ['name' => 'หัวหน้าครัว', 'menus' => ['kitchen'], 'scope' => 'branch', 'refund' => false], $this->owner)->assertCreated()->json();
        $this->patchJson('/api/users/restaurant-u4', ['role' => $role['key']], $this->owner)->assertOk();
        $kitchen = $this->login('restaurant-u4');
        $this->getJson('/api/state', $kitchen)->assertOk()->assertJsonPath('user.roleName', 'หัวหน้าครัว')->assertJsonPath('visibleMenus', ['kitchen'])->assertJsonPath('permissions', ['kitchen'])->assertJsonCount(0, 'roles');
        $this->patchJson('/api/menu-items/m1', ['name' => 'blocked'], $kitchen)->assertForbidden();
        $this->postJson('/api/orders', ['branchId' => 'r1', 'items' => []], $kitchen)->assertForbidden();
        $this->patchJson('/api/roles/'.$role['id'], ['name' => 'ดูแลเมนู', 'menus' => ['menu']], $this->owner)->assertOk();
        $this->getJson('/api/state', $kitchen)->assertOk()->assertJsonPath('visibleMenus', ['menu'])->assertJsonPath('user.roleName', 'ดูแลเมนู');
        $this->patchJson('/api/menu-items/m1', ['name' => 'ชื่อใหม่'], $kitchen)->assertOk();
        $this->patchJson('/api/roles/'.$role['id'], ['menus' => []], $this->owner)->assertOk();
        $this->patchJson('/api/menu-items/m1', ['name' => 'blocked again'], $kitchen)->assertForbidden();
        $this->getJson('/api/state', $kitchen)->assertOk()->assertJsonPath('permissions', [])->assertJsonPath('visibleMenus', []);
        $this->deleteJson('/api/roles/'.$role['id'], [], $this->owner)->assertStatus(409);
        $this->patchJson('/api/users/restaurant-u4', ['role' => 'Kitchen'], $this->owner)->assertOk();
        $this->deleteJson('/api/roles/'.$role['id'], [], $this->owner)->assertOk();
        $this->patchJson('/api/users/restaurant-u4', ['role' => $role['key']], $this->owner)->assertStatus(400);
    }

    public function test_role_management_is_owner_only_tenant_scoped_and_protects_owner(): void
    {
        $roles = $this->getJson('/api/roles', $this->owner)->assertOk()->assertJsonCount(6)->json();
        $owner = collect($roles)->firstWhere('key', 'Owner');
        $this->patchJson('/api/roles/'.$owner['id'], ['menus' => []], $this->owner)->assertStatus(409);
        $this->deleteJson('/api/roles/'.$owner['id'], [], $this->owner)->assertStatus(409);
        $this->deleteJson('/api/roles/'.collect($roles)->firstWhere('key', 'Manager')['id'], [], $this->owner)->assertStatus(409);
        $manager = $this->login('restaurant-u1');
        $this->getJson('/api/roles', $manager)->assertForbidden();
        $this->postJson('/api/roles', ['name' => 'illegal', 'menus' => []], $manager)->assertForbidden();
        $other = $this->login('cafe-u0');
        $this->patchJson('/api/roles/'.$roles[1]['id'], ['name' => 'cross tenant'], $other)->assertNotFound();
        $this->deleteJson('/api/roles/'.$roles[1]['id'], [], $other)->assertNotFound();
        $this->getJson('/api/state', $this->owner)->assertOk()->assertJsonPath('roles.0.protected', true)->assertJsonCount(16, 'visibleMenus');
        $this->getJson('/api/roles', $this->owner)->assertJsonPath('0.members', 1);
    }

    public function test_waiter_sees_serve_menu_and_can_serve_but_not_cook(): void
    {
        $waiter = $this->login('restaurant-u3');
        $state = $this->getJson('/api/state', $waiter)->assertOk();
        $this->assertContains('serve', $state->json('visibleMenus'));
        $this->assertNotContains('kitchen', $state->json('visibleMenus'));
        $order = $this->postJson('/api/orders', ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => 'm1', 'qty' => 1]]], $waiter)->assertCreated()->json();
        $this->patchJson('/api/orders/'.$order['id'].'/status', ['status' => 'pending'], $waiter)->assertOk();
        $this->patchJson('/api/orders/'.$order['id'].'/status', ['status' => 'cooking'], $waiter)->assertForbidden();
        $kitchen = $this->login('restaurant-u4');
        foreach (['cooking', 'ready'] as $status) {
            $this->patchJson('/api/orders/'.$order['id'].'/status', compact('status'), $kitchen)->assertOk();
        }
        $this->patchJson('/api/orders/'.$order['id'].'/status', ['status' => 'served'], $waiter)->assertOk();
    }

    public function test_kitchen_can_mark_ready_food_served_by_default(): void
    {
        $kitchen = $this->login('restaurant-u4');
        $this->assertContains('serve', $this->getJson('/api/state', $kitchen)->assertOk()->json('permissions'));
        $order = $this->postJson('/api/orders', ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => 'm1', 'qty' => 1]]], $this->owner)->assertCreated()->json();
        foreach (['pending', 'cooking', 'ready', 'served'] as $status) {
            $this->patchJson('/api/orders/'.$order['id'].'/status', compact('status'), $status === 'pending' ? $this->owner : $kitchen)->assertOk();
        }
    }

    public function test_serve_permission_is_granted_per_role_independently_of_tables_and_kitchen(): void
    {
        $order = $this->postJson('/api/orders', ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => 'm1', 'qty' => 1]]], $this->owner)->assertCreated()->json();
        foreach (['pending', 'cooking', 'ready'] as $status) {
            $this->patchJson('/api/orders/'.$order['id'].'/status', compact('status'), $this->owner)->assertOk();
        }
        $tablesOnly = $this->postJson('/api/roles', ['name' => 'ดูแลโต๊ะ', 'menus' => ['tables'], 'scope' => 'branch', 'refund' => false], $this->owner)->assertCreated()->json();
        $this->assertSame(['tables'], $tablesOnly['permissions']);
        $this->assertSame(['serve'], $this->postJson('/api/roles', ['name' => 'เสิร์ฟ', 'menus' => ['serve'], 'scope' => 'branch', 'refund' => false], $this->owner)->assertCreated()->json('permissions'));
        $kitchenServe = $this->postJson('/api/roles', ['name' => 'ครัวเสิร์ฟด้วย', 'menus' => ['kitchen', 'serve'], 'scope' => 'branch', 'refund' => false], $this->owner)->assertCreated()->json();
        $user = $this->postJson('/api/users', ['name' => 'ทดสอบ', 'email' => 'serve@test.dev', 'role' => $tablesOnly['key'], 'branchId' => 'r1', 'pin' => '4321'], $this->owner)->assertCreated()->json();
        $login = fn (string $id, string $pin) => ['Authorization' => 'Bearer '.$this->postJson('/api/auth/login', ['userId' => $id, 'pin' => $pin])->assertOk()->json('token')];
        $this->patchJson('/api/orders/'.$order['id'].'/status', ['status' => 'served'], $login($user['id'], '4321'))->assertForbidden();
        $this->patchJson('/api/users/'.$user['id'], ['role' => $kitchenServe['key']], $this->owner)->assertOk();
        $this->patchJson('/api/orders/'.$order['id'].'/status', ['status' => 'served'], $login($user['id'], '4321'))->assertOk();
    }

    public function test_invalid_role_input_is_atomic_and_cannot_set_raw_permissions(): void
    {
        foreach ([['name' => ''], ['name' => str_repeat('a', 101)], ['name' => 'เจ้าของร้าน'], ['menus' => ['invalid']], ['menus' => ['pos', 'pos']], ['menus' => 'pos'], ['menus' => [['pos']]], ['scope' => 'global'], ['refund' => 'true'], ['permissions' => ['staff']], ['menus' => ['hq'], 'scope' => 'branch'], []] as $invalid) {
            $body = $invalid ? array_replace(['name' => 'ใหม่', 'menus' => []], $invalid) : [];
            $response = $this->postJson('/api/roles', $body, $this->owner);
            $this->assertContains($response->status(), [400, 409]);
        }
        $this->getJson('/api/roles', $this->owner)->assertJsonCount(6);
        $this->patchJson('/api/roles/missing', ['name' => 'none'], $this->owner)->assertNotFound();
    }

    public function test_branch_scope_and_view_only_staff_permissions_are_enforced(): void
    {
        $owner = $this->login('brand-u0');
        $role = $this->postJson('/api/roles', ['name' => 'หัวหน้าสาขา', 'menus' => ['staff', 'reports', 'settings'], 'scope' => 'branch', 'refund' => true], $owner)->assertCreated()->json();
        $this->patchJson('/api/users/brand-u1', ['role' => $role['key']], $owner)->assertOk();
        $staff = $this->login('brand-u1');
        $state = $this->getJson('/api/state', $staff)->assertOk()->assertJsonCount(1, 'branches')->json();
        foreach (['users', 'orders', 'audit', 'tables'] as $collection) {
            foreach ($state[$collection] as $row) {
                $this->assertSame($state['user']['branchId'], $row['branchId']);
            }
        }
        $this->postJson('/api/users', ['name' => 'unauthorized'], $staff)->assertForbidden();
        $this->patchJson('/api/tables/b2-t1', ['name' => 'other'], $staff)->assertNotFound();
        $this->patchJson('/api/roles/'.$role['id'], ['scope' => 'tenant', 'menus' => ['hq', 'reports']], $owner)->assertOk();
        $this->getJson('/api/state', $staff)->assertOk()->assertJsonCount(3, 'branches');
    }
}
