<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class CategoriesTest extends TestCase
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
        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/login', ['userId' => $id, 'pin' => '1234'])->assertOk()->json('token')];
    }

    public function test_categories_are_persisted_and_shared_by_menu_pos_and_guest(): void
    {
        $this->getJson('/api/categories', $this->owner)->assertOk()->assertJsonCount(7);
        $category = $this->postJson('/api/categories', ['name' => 'อาหารเช้า', 'icon' => 'Coffee', 'order' => 1], $this->owner)->assertCreated()->json();
        $this->getJson('/api/state', $this->owner)->assertOk()->assertJsonPath('categories.1.id', $category['id']);
        $menu = $this->postJson('/api/menu-items', ['name' => 'อาหารเช้าใหม่', 'price' => 50, 'category' => $category['id']], $this->owner)->assertCreated()->json();
        $this->patchJson('/api/categories/'.$category['id'], ['name' => 'ชุดอาหารเช้า', 'icon' => 'Utensils', 'order' => 2], $this->owner)->assertOk();
        $this->getJson('/api/categories', $this->owner)->assertJsonPath('2.name', 'ชุดอาหารเช้า')->assertJsonPath('2.icon', 'Utensils');
        $session = $this->postJson('/api/tables/r1-t15/session', [], $this->owner)->assertOk()->json();
        $this->getJson('/api/guest/'.$session['token'])->assertOk()->assertJsonPath('categories.2.name', 'ชุดอาหารเช้า');
        $this->deleteJson('/api/categories/'.$category['id'], [], $this->owner)->assertStatus(409);
        $this->patchJson('/api/menu-items/'.$menu['id'], ['category' => 'main'], $this->owner)->assertOk();
        $this->deleteJson('/api/categories/'.$category['id'], [], $this->owner)->assertOk();
        $this->getJson('/api/categories', $this->owner)->assertJsonCount(7);
        $this->getJson('/api/guest/'.$session['token'])->assertOk()->assertJsonCount(7, 'categories');
        $this->patchJson('/api/menu-items/'.$menu['id'], ['category' => $category['id']], $this->owner)->assertStatus(400);
    }

    public function test_category_edits_are_tenant_scoped_permission_checked_and_audited(): void
    {
        $category = $this->postJson('/api/categories', ['name' => 'เฉพาะร้านนี้'], $this->owner)->assertCreated()->json();
        $other = $this->login('cafe-u0');
        $this->getJson('/api/categories', $other)->assertJsonCount(7);
        $this->patchJson('/api/categories/'.$category['id'], ['name' => 'cross tenant'], $other)->assertNotFound();
        $this->deleteJson('/api/categories/'.$category['id'], [], $other)->assertNotFound();
        $this->postJson('/api/menu-items', ['name' => 'invalid', 'price' => 10, 'category' => $category['id']], $other)->assertStatus(400);
        $this->patchJson('/api/categories/main', ['name' => 'อาหารจานหลัก'], $this->owner)->assertOk();
        $this->getJson('/api/categories', $other)->assertJsonPath('1.name', 'จานหลัก');
        $waiter = $this->login('restaurant-u3');
        $this->getJson('/api/categories', $waiter)->assertOk();
        $this->postJson('/api/categories', ['name' => 'blocked'], $waiter)->assertForbidden();
        $this->patchJson('/api/categories/main', ['name' => 'blocked'], $waiter)->assertForbidden();
        $this->deleteJson('/api/categories/main', [], $waiter)->assertForbidden();
        $audit = $this->getJson('/api/state', $this->owner)->json('audit.0');
        $detail = $this->getJson('/api/audit/'.$audit['id'], $this->owner)->assertOk()->json();
        $fields = collect($detail['changes'])->flatMap(fn ($change) => $change['fields']);
        $field = $fields->firstWhere('key', 'categories');
        $this->assertSame('จานหลัก', $field['before'][0]['name']);
        $this->assertSame('อาหารจานหลัก', $field['after'][0]['name']);
        $this->getJson('/api/categories')->assertUnauthorized();
    }

    public function test_validation_preserves_reserved_category_and_existing_order(): void
    {
        $this->patchJson('/api/categories/all', ['name' => 'replace'], $this->owner)->assertStatus(409);
        $this->deleteJson('/api/categories/all', [], $this->owner)->assertStatus(409);
        foreach ([[], ['name' => ''], ['name' => 1], ['name' => str_repeat('x', 81)], ['icon' => '<script>'], ['order' => 0], ['order' => 1.5], ['order' => 99], ['id' => 'custom'], ['tenantId' => 'cafe']] as $invalid) {
            $body = $invalid ? array_replace(['name' => 'ประเภทใหม่'], $invalid) : [];
            $this->postJson('/api/categories', $body, $this->owner)->assertStatus(400);
        }
        $this->postJson('/api/categories', ['name' => ' จานหลัก '], $this->owner)->assertStatus(409);
        $this->patchJson('/api/categories/main', ['name' => null], $this->owner)->assertStatus(400);
        $this->patchJson('/api/categories/main', ['name' => 'เครื่องดื่ม'], $this->owner)->assertStatus(409);
        $this->patchJson('/api/categories/missing', ['name' => 'none'], $this->owner)->assertNotFound();
        $this->getJson('/api/categories', $this->owner)->assertJsonCount(7)->assertJsonPath('1.id', 'main');
        $this->patchJson('/api/categories/drink', ['order' => 1], $this->owner)->assertOk();
        $this->getJson('/api/categories', $this->owner)->assertJsonPath('0.id', 'all')->assertJsonPath('1.id', 'drink')->assertJsonPath('2.id', 'main');
        $small = $this->login('cafe-u0');
        $this->postJson('/api/categories', ['name' => 'เครื่องดื่มพิเศษ'], $small)->assertCreated();
    }

    public function test_used_categories_cannot_be_deleted_and_last_category_is_kept(): void
    {
        $menus = $this->getJson('/api/menu-items', $this->owner)->json();
        foreach ($menus as $menu) {
            if ($menu['category'] !== 'main') {
                $this->patchJson('/api/menu-items/'.$menu['id'], ['category' => 'main'], $this->owner)->assertOk();
            }
        }
        foreach (['noodle', 'snack', 'salad', 'drink', 'dessert'] as $id) {
            $this->deleteJson('/api/categories/'.$id, [], $this->owner)->assertOk();
        }
        $this->getJson('/api/categories', $this->owner)->assertJsonCount(2);
        $this->deleteJson('/api/categories/main', [], $this->owner)->assertStatus(409);
    }
}
