<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class CatalogManagementTest extends TestCase
{
    use RefreshDatabase;

    private array $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('menu_images');
        $this->artisan('pos:seed')->assertSuccessful();
        $this->owner = $this->login('restaurant-u0');
    }

    private function login(string $user): array
    {
        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/login', ['userId' => $user, 'pin' => '1234'])->assertOk()->json('token')];
    }

    private function order(string $menu, int $qty = 1, ?string $table = null): array
    {
        return $this->postJson('/api/orders', ['branchId' => 'r1', 'type' => 'dinein', 'tableId' => $table, 'items' => [['menuId' => $menu, 'qty' => $qty]]], $this->owner)->assertCreated()->json();
    }

    public function test_menu_crud_is_tenant_scoped_and_retains_paid_history(): void
    {
        $menu = $this->post('/api/menu-items', ['payload' => json_encode(['name' => 'อาหารใหม่', 'en' => 'New dish', 'category' => 'main', 'price' => 95, 'modifiers' => []]), 'image' => UploadedFile::fake()->image('dish.png')], $this->owner + ['Accept' => 'application/json'])->assertCreated()->json();
        $id = $menu['id'];
        $this->assertSame('New dish', $menu['en']);
        $this->getJson('/api/menu-items', $this->owner)->assertJsonCount(31);
        $other = $this->login('cafe-u0');
        $this->getJson('/api/menu-items', $other)->assertJsonCount(30);
        $this->patchJson('/api/menu-items/'.$id, ['name' => 'cross tenant'], $other)->assertNotFound();
        $this->deleteJson('/api/menu-items/'.$id, [], $other)->assertNotFound();
        $this->patchJson('/api/menu-items/'.$id, ['price' => 99, 'available' => false], $this->owner)->assertOk();
        $this->postJson('/api/orders', ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => $id, 'qty' => 1]]], $this->owner)->assertStatus(400);
        $this->patchJson('/api/menu-items/'.$id, ['available' => true], $this->owner)->assertOk();
        $order = $this->order($id);
        $this->deleteJson('/api/menu-items/'.$id, [], $this->owner)->assertStatus(409);
        $this->postJson('/api/orders/'.$order['id'].'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertOk();
        foreach (['cooking', 'ready', 'served'] as $status) {
            $this->patchJson('/api/orders/'.$order['id'].'/status', compact('status'), $this->owner)->assertOk()->assertJsonPath('status', 'paid');
        }
        $this->deleteJson('/api/menu-items/'.$id, [], $this->owner)->assertOk();
        $this->getJson('/api/menu-items', $this->owner)->assertJsonCount(30);
        $this->patchJson('/api/menu-items/'.$id, ['name' => 'restore'], $this->owner)->assertNotFound();
        $this->deleteJson('/api/menu-items/'.$id, [], $this->owner)->assertNotFound();
        $state = $this->getJson('/api/state', $this->owner)->json();
        $history = collect($state['orders'])->firstWhere('id', $order['id']);
        $this->assertSame('อาหารใหม่', $history['items'][0]['name']);
        $this->assertEquals(99, $history['items'][0]['unitPrice']);
        $this->order('m1');
        $this->deleteJson('/api/menu-items/m1', [], $this->owner)->assertStatus(409);
    }

    public function test_invalid_menu_creation_rolls_back_record_and_uploaded_file(): void
    {
        foreach ([[], ['name' => ''], ['name' => 'bad', 'category' => 'missing', 'price' => 10], ['name' => 'bad', 'category' => 'main', 'price' => -1], ['name' => 'bad', 'category' => 'main', 'price' => 1, 'tenantId' => 'cafe']] as $body) {
            $this->postJson('/api/menu-items', $body, $this->owner)->assertStatus(400);
        }
        $this->post('/api/menu-items', ['payload' => json_encode(['name' => 'bad', 'category' => 'main', 'price' => 10]), 'image' => UploadedFile::fake()->createWithContent('bad.png', 'invalid')], $this->owner + ['Accept' => 'application/json'])->assertStatus(400);
        $this->getJson('/api/menu-items', $this->owner)->assertJsonCount(30);
        $this->assertCount(0, Storage::disk('menu_images')->allFiles());
        $waiter = $this->login('restaurant-u3');
        $this->postJson('/api/menu-items', ['name' => 'blocked', 'category' => 'main', 'price' => 1], $waiter)->assertForbidden();
        $this->deleteJson('/api/menu-items/m30', [], $waiter)->assertForbidden();
    }

    public function test_table_crud_preserves_history_and_blocks_active_use(): void
    {
        $table = $this->postJson('/api/tables', ['branchId' => 'r1', 'name' => 'สวน', 'seats' => 6], $this->owner)->assertCreated()->json();
        $id = $table['id'];
        $this->postJson('/api/tables', ['branchId' => 'r1', 'name' => ' สวน ', 'seats' => 2], $this->owner)->assertStatus(409);
        $this->patchJson('/api/tables/'.$id.'/reservation', ['reservation' => ['name' => 'ลูกค้า', 'time' => '18:00']], $this->owner)->assertOk();
        $this->deleteJson('/api/tables/'.$id, [], $this->owner)->assertStatus(409);
        $this->patchJson('/api/tables/'.$id.'/reservation', ['reservation' => null], $this->owner)->assertOk();
        $qr = $this->postJson('/api/tables/'.$id.'/session', [], $this->owner)->assertOk()->json();
        $this->deleteJson('/api/tables/'.$id, [], $this->owner)->assertStatus(409);
        $this->postJson('/api/table-sessions/'.$qr['id'].'/close', [], $this->owner)->assertOk();
        $order = $this->order('m30', 1, $id);
        $this->deleteJson('/api/tables/'.$id, [], $this->owner)->assertStatus(409);
        $this->postJson('/api/orders/'.$order['id'].'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertOk();
        foreach (['cooking', 'ready', 'served'] as $status) {
            $this->patchJson('/api/orders/'.$order['id'].'/status', compact('status'), $this->owner)->assertOk()->assertJsonPath('status', 'paid');
        }
        $this->deleteJson('/api/tables/'.$id, [], $this->owner)->assertOk();
        $state = $this->getJson('/api/state', $this->owner)->json();
        $this->assertFalse(collect($state['tables'])->contains('id', $id));
        $this->assertSame('สวน', collect($state['archivedTables'])->firstWhere('id', $id)['name']);
        $this->assertSame($id, collect($state['orders'])->firstWhere('id', $order['id'])['tableId']);
        $this->patchJson('/api/tables/'.$id, ['name' => 'gone'], $this->owner)->assertNotFound();
        $this->postJson('/api/tables/'.$id.'/session', [], $this->owner)->assertNotFound();
        $this->postJson('/api/tables', ['branchId' => 'r1', 'name' => 'สวน', 'seats' => 2], $this->owner)->assertCreated();
    }

    public function test_table_creation_enforces_scope_validation_and_package(): void
    {
        foreach ([['seats' => 0], ['seats' => 51], ['seats' => 1.5], ['name' => ''], ['name' => str_repeat('x', 51)], ['deleted' => true]] as $invalid) {
            $this->postJson('/api/tables', array_replace(['branchId' => 'r1', 'name' => 'ใหม่', 'seats' => 4], $invalid), $this->owner)->assertStatus(400);
        }
        $this->postJson('/api/tables', ['branchId' => 'b1', 'name' => 'cross tenant', 'seats' => 4], $this->owner)->assertForbidden();
        $this->postJson('/api/tables', ['branchId' => 'c1', 'name' => 'small', 'seats' => 4], $this->login('cafe-u0'))->assertForbidden();
        $this->deleteJson('/api/tables/r1-t15', [], $this->login('restaurant-u3'))->assertForbidden();
        $this->getJson('/api/state', $this->owner)->assertJsonCount(15, 'tables');
    }

    public function test_branch_price_edits_preserve_the_updated_central_price(): void
    {
        $owner = $this->login('brand-u0');
        $this->patchJson('/api/menu-items/m1', ['price' => 300], $owner)->assertOk();
        $this->patchJson('/api/menu-items/m1', ['branchId' => 'b2', 'price' => 100], $owner)->assertOk()->assertJsonPath('price', 300)->assertJsonPath('overrides.b2', 100);
        $this->patchJson('/api/menu-items/m1', ['branchId' => 'b2', 'name' => 'เปลี่ยนชื่อ'], $owner)->assertOk()->assertJsonPath('price', 300)->assertJsonPath('overrides.b2', 100);
        $this->postJson('/api/menu-items', ['name' => 'invalid', 'category' => 'main', 'price' => 100, 'branchId' => 'b2'], $owner)->assertStatus(400);
    }

    public function test_best_sellers_use_paid_quantity_window_tenant_and_exclude_refunds(): void
    {
        $this->travelTo(now()->addDays(60)); // Exclude imported historical orders.
        $this->owner = $this->login('restaurant-u0');
        $this->getJson('/api/menu-items', $this->owner)->assertJsonPath('0.popular', false);
        $ids = [];
        for ($i = 1; $i <= 6; $i++) {
            $menu = $this->postJson('/api/menu-items', ['name' => 'ยอดขาย '.$i, 'category' => 'main', 'price' => 10], $this->owner)->assertCreated()->json();
            $order = $this->order($menu['id'], $i);
            $this->postJson('/api/orders/'.$order['id'].'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertOk();
            $ids[] = ['menu' => $menu['id'], 'order' => $order['id']];
        }
        $menu = collect($this->getJson('/api/menu-items', $this->owner)->json())->keyBy('id');
        $this->assertFalse($menu[$ids[0]['menu']]['popular']);
        $this->assertTrue($menu[$ids[5]['menu']]['popular']);
        $this->assertSame(6, $menu[$ids[5]['menu']]['soldQuantity']);
        $this->postJson('/api/orders/'.$ids[5]['order'].'/refund', ['reason' => 'คืนเงิน'], $this->owner)->assertOk();
        $menu = collect($this->getJson('/api/menu-items', $this->owner)->json())->keyBy('id');
        $this->assertSame(0, $menu[$ids[5]['menu']]['soldQuantity']);
        $this->assertTrue($menu[$ids[0]['menu']]['popular']);
        $this->assertCount(30, $this->getJson('/api/menu-items', $this->login('cafe-u0'))->json());
        $this->travel(31)->days();
        $this->owner = $this->login('restaurant-u0');
        foreach ($this->getJson('/api/menu-items', $this->owner)->json() as $item) {
            $this->assertFalse($item['popular']);
        }
    }
}
