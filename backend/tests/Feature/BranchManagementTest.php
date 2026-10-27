<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Branch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class BranchManagementTest extends TestCase
{
    use RefreshDatabase;

    private array $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('pos:seed')->assertSuccessful();
        $this->owner = $this->login('brand-u0');
    }

    private function login(string $id): array
    {
        $token = $this->postJson('/api/auth/login', ['userId' => $id, 'pin' => '1234'])->assertOk()->json('token');

        return ['Authorization' => 'Bearer '.$token];
    }

    public function test_branch_lifecycle_creates_isolated_stock_tables_and_closed_shift(): void
    {
        $branch = $this->postJson('/api/branches', ['name' => 'เชียงใหม่', 'address' => 'ถนนนิมมาน', 'phone' => '0812345678', 'target' => 35000.50, 'tableCount' => 2], $this->owner)->assertCreated()->json();
        $id = $branch['id'];
        $state = $this->getJson('/api/state', $this->owner)->assertOk()->assertJsonCount(4, 'branches')->json();
        $tables = array_values(array_filter($state['tables'], fn ($item) => $item['branchId'] === $id));
        $stock = array_values(array_filter($state['ingredients'], fn ($item) => $item['branchId'] === $id));
        $shift = collect($state['shifts'])->firstWhere('branchId', $id);
        $this->assertCount(2, $tables);
        $this->assertCount(20, $stock);
        $this->assertSame('T01', $tables[0]['name']);
        $this->assertSame(4, $tables[0]['seats']);
        $this->assertEquals(0, array_sum(array_column($stock, 'stock')));
        $this->assertFalse($shift['open']);
        $this->assertEquals(0, $shift['openingCash']);
        $this->postJson('/api/orders', ['branchId' => $id, 'type' => 'takeaway', 'items' => [['menuId' => 'm1', 'qty' => 1, 'modifiers' => []]]], $this->owner)->assertStatus(409);
        $this->patchJson('/api/branches/'.$id, ['name' => 'เชียงใหม่ใหม่', 'target' => 100], $this->owner)->assertOk()->assertJsonPath('address', 'ถนนนิมมาน');
        $this->assertSame('เชียงใหม่ใหม่', Branch::findOrFail($id)->payload['name']);
        $this->deleteJson('/api/branches/'.$id, [], $this->owner)->assertOk();
        $state = $this->getJson('/api/state', $this->owner)->assertOk()->assertJsonCount(3, 'branches')->json();
        foreach (['tables', 'ingredients', 'shifts'] as $key) {
            $this->assertCount(0, array_filter($state[$key], fn ($item) => $item['branchId'] === $id));
        }
        $this->assertNull(Branch::find($id));
    }

    public function test_tenant_and_owner_guards_preserve_existing_branch(): void
    {
        $medium = $this->login('restaurant-u0');
        $this->deleteJson('/api/branches/r1', [], $medium)->assertStatus(409);
        $this->postJson('/api/branches', ['name' => 'second'], $medium)->assertCreated();
        $this->patchJson('/api/branches/r1', ['name' => 'สาขาหลัก', 'address' => 'สุขุมวิท', 'phone' => '02-1234567'], $medium)->assertOk();
        $this->deleteJson('/api/branches/r1', [], $medium)->assertStatus(409);
        $this->patchJson('/api/branches/b1', ['name' => 'cross tenant'], $medium)->assertNotFound();
        $this->deleteJson('/api/branches/b1', [], $medium)->assertNotFound();
        foreach (['brand-u1', 'brand-u5'] as $user) {
            $headers = $this->login($user);
            $this->postJson('/api/branches', ['name' => 'blocked'], $headers)->assertForbidden();
            $this->patchJson('/api/branches/b1', ['name' => 'blocked'], $headers)->assertForbidden();
            $this->deleteJson('/api/branches/b1', [], $headers)->assertForbidden();
        }
        $this->deleteJson('/api/branches/b1', [], $this->owner)->assertStatus(409);
        $this->getJson('/api/branches', $this->owner)->assertOk()->assertJsonCount(3)->assertJsonPath('0.name', 'สุขุมวิท');
        $small = $this->login('cafe-u0');
        $this->patchJson('/api/branches/c1', ['phone' => '0801234567'], $small)->assertOk();
        $this->deleteJson('/api/branches/c1', [], $small)->assertStatus(409);
        $id = $this->postJson('/api/branches', ['name' => 'คาเฟ่ใหม่'], $small)->assertCreated()->json('id');
        $this->assertDatabaseMissing('dining_tables', ['branch_id' => $id]);
        $this->postJson('/api/branches', ['name' => 'โต๊ะไม่รองรับ', 'tableCount' => 1], $small)->assertStatus(400);
    }

    public function test_invalid_changes_are_atomic_and_duplicate_names_are_tenant_scoped(): void
    {
        foreach ([[], ['name' => ''], ['name' => '  '], ['name' => 3], ['name' => str_repeat('x', 101)], ['target' => -1], ['target' => '10'], ['target' => 0.001], ['target' => 100000001], ['address' => []], ['phone' => str_repeat('1', 31)], ['tableCount' => -1], ['tableCount' => 1.2], ['tableCount' => 101], ['tenantId' => 'restaurant']] as $invalid) {
            $body = $invalid ? array_replace(['name' => 'ทดสอบ'], $invalid) : [];
            $this->postJson('/api/branches', $body, $this->owner)->assertStatus(400);
        }
        $this->postJson('/api/branches', ['name' => ' สุขุมวิท '], $this->owner)->assertStatus(409);
        $this->patchJson('/api/branches/b1', ['name' => 'อารีย์'], $this->owner)->assertStatus(409);
        $this->patchJson('/api/branches/b1', ['tableCount' => 10], $this->owner)->assertStatus(400);
        $this->patchJson('/api/branches/missing', ['name' => 'none'], $this->owner)->assertNotFound();
        $this->getJson('/api/branches', $this->owner)->assertJsonCount(3);
    }

    public function test_deletion_refuses_assigned_staff_and_branch_with_stock_history(): void
    {
        $branch = $this->postJson('/api/branches', ['name' => 'ทีมงาน', 'tableCount' => 0], $this->owner)->assertCreated()->json();
        $id = $branch['id'];
        $this->patchJson('/api/users/brand-u4', ['branchId' => $id], $this->owner)->assertOk();
        $this->deleteJson('/api/branches/'.$id, [], $this->owner)->assertStatus(409);
        $this->patchJson('/api/users/brand-u4', ['branchId' => 'b1'], $this->owner)->assertOk();
        // Employee history is retained even after the employee moves away.
        $this->deleteJson('/api/branches/'.$id, [], $this->owner)->assertStatus(409);
        $second = $this->postJson('/api/branches', ['name' => 'สต๊อก', 'tableCount' => 0], $this->owner)->assertCreated()->json('id');
        $this->postJson('/api/inventory/adjust', ['ingredientId' => $second.'-i0', 'qty' => 10, 'reason' => 'รับเข้า'], $this->owner)->assertOk();
        $this->deleteJson('/api/branches/'.$second, [], $this->owner)->assertStatus(409);
        $this->postJson('/api/inventory/adjust', ['ingredientId' => $second.'-i0', 'qty' => -10, 'reason' => 'ปรับออก'], $this->owner)->assertOk();
        $this->deleteJson('/api/branches/'.$second, [], $this->owner)->assertStatus(409);
    }
}
