<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AuthToken;
use App\Models\Employee;
use App\Models\PosOrder;
use App\Models\TableSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class PosApiTest extends TestCase
{
    use RefreshDatabase;

    private string $owner;

    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('pos:seed')->assertSuccessful();
        $this->owner = $this->login('restaurant-u0');
        $this->brand = $this->login('brand-u0');
    }

    private function api(string $method, string $path, array $body = [], ?string $token = null): TestResponse
    {
        return $this->json($method, '/api'.$path, $body, $token ? ['Authorization' => 'Bearer '.$token] : []);
    }

    private function login(string $id, string $pin = '1234'): string
    {
        return $this->api('POST', '/auth/login', compact('pin') + ['userId' => $id])->assertOk()->json('token');
    }

    private function order(array $extra = [], ?string $token = null): array
    {
        return $this->api('POST', '/orders', [...['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => 'm1', 'qty' => 2], ['menuId' => 'm2', 'qty' => 1]]], ...$extra], $token ?? $this->owner)->assertCreated()->json();
    }

    private function qr(string $table = 'r1-t15', ?string $token = null): array
    {
        return $this->api('POST', "/tables/{$table}/session", [], $token ?? $this->owner)->assertOk()->json();
    }

    private function guestOrder(string $token, string $key = 'laravel-qr-request-00001', array $items = [['menuId' => 'm1', 'qty' => 1]]): TestResponse
    {
        return $this->api('POST', "/guest/{$token}/orders", ['requestId' => $key, 'items' => $items]);
    }

    public function test_auth_health_state_and_sensitive_fields(): void
    {
        $this->getJson('/healthz')->assertOk()->assertJsonPath('status', 'ok');
        $this->api('GET', '/state')->assertUnauthorized();
        $this->api('POST', '/auth/login', ['userId' => 'restaurant-u0', 'pin' => 'wrong'])->assertUnauthorized();
        $this->api('GET', '/demo')->assertOk()->assertJsonMissingPath('accounts.0.pinHash');
        $this->api('GET', '/state', [], $this->owner)->assertOk()->assertJsonCount(30, 'menu')->assertJsonPath('tenant.id', 'restaurant')->assertJsonMissingPath('user.pinHash');
        $employee = Employee::findOrFail('restaurant-u0');
        $this->assertTrue(Hash::check('1234', $employee->pin_hash));
        $this->assertArrayNotHasKey('pin', $employee->payload);
        $this->assertNotNull(AuthToken::find(hash('sha256', $this->owner)));
        $this->api('POST', '/auth/logout', [], $this->owner)->assertOk();
        $this->api('GET', '/state', [], $this->owner)->assertUnauthorized();
    }

    public function test_order_kitchen_payment_report_and_duplicate_payment(): void
    {
        $order = $this->order(['items' => [['menuId' => 'm1', 'qty' => 1, 'modifiers' => [['group' => 'protein', 'name' => 'เพิ่มไข่ดาว']], 'note' => 'ไม่ใส่พริก']]]);
        $this->assertEquals(144, $order['items'][0]['unitPrice']);
        foreach (['pending', 'cooking', 'ready', 'served'] as $status) {
            $this->api('PATCH', '/orders/'.$order['id'].'/status', compact('status'), $this->owner)->assertOk();
        }
        $this->api('POST', '/orders/'.$order['id'].'/payments', ['method' => 'cash', 'received' => 200], $this->owner)->assertOk()->assertJsonPath('payment.change', 45.92);
        $this->api('POST', '/orders/'.$order['id'].'/payments', ['method' => 'qr'], $this->owner)->assertStatus(409);
        $this->api('GET', '/reports/sales', [], $this->owner)->assertOk()->assertJsonPath('total', 154.08)->assertJsonCount(1, 'orders');
    }

    public function test_tenant_branch_plan_and_role_guards(): void
    {
        $order = $this->order();
        $this->api('POST', '/orders/'.$order['id'].'/payments', ['method' => 'qr'], $this->brand)->assertNotFound();
        $this->api('POST', '/orders/'.$order['id'].'/payments', ['method' => 'qr'], $this->login('restaurant-u3'))->assertForbidden();
        $this->api('POST', '/orders', ['branchId' => 'r1'], $this->login('restaurant-u4'))->assertForbidden();
        $this->api('POST', '/tables/c1-t15/session', [], $this->login('cafe-u0'))->assertForbidden();
        $this->api('POST', '/orders', ['branchId' => 'b1'], $this->owner)->assertForbidden();
        $this->api('GET', '/branches', [], $this->brand)->assertOk()->assertJsonCount(3);
        $this->api('GET', '/menu-items', [], $this->owner)->assertOk()->assertJsonCount(30);
    }

    public function test_validation_does_not_mutate_orders_or_counter(): void
    {
        $count = PosOrder::count();
        $counter = DB::table('pos_counters')->value('value');
        foreach ([['menuId' => 'm1', 'qty' => -1], ['menuId' => 'm1', 'qty' => 1, 'modifiers' => [['group' => 'bad', 'name' => 'free']]]] as $item) {
            $this->api('POST', '/orders', ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [$item]], $this->owner)->assertStatus(400);
        }
        $this->assertSame($count, PosOrder::count());
        $this->assertSame($counter, DB::table('pos_counters')->value('value'));
        $order = $this->order();
        $this->api('POST', '/orders/'.$order['id'].'/payments', ['method' => 'cash', 'received' => 1], $this->owner)->assertStatus(400);
        $this->api('PATCH', '/orders/'.$order['id'].'/status', ['status' => 'ready'], $this->owner)->assertStatus(409);
        $this->api('POST', '/orders/'.$order['id'].'/discount', ['amount' => 999999], $this->owner)->assertStatus(400);
        $this->assertSame('draft', PosOrder::find($order['id'])->payload['status']);
    }

    public function test_guest_qr_retry_rounds_encryption_and_payment_close(): void
    {
        $session = $this->qr();
        $this->assertSame($session['token'], $this->qr()['token']);
        $this->api('GET', '/guest/'.$session['token'])->assertOk()->assertJsonCount(30, 'menu')->assertJsonMissingPath('accounts');
        $this->assertStringNotContainsString($session['token'], DB::table('table_sessions')->where('id', $session['id'])->value('payload'));
        $first = $this->guestOrder($session['token'])->assertCreated()->json();
        $this->guestOrder($session['token'])->assertOk()->assertJsonPath('duplicate', true);
        $this->guestOrder($session['token'], 'laravel-qr-request-00001', [['menuId' => 'm2', 'qty' => 1]])->assertStatus(409);
        $this->assertSame(1, DB::table('guest_submissions')->count());
        foreach (['cooking', 'ready', 'served'] as $status) {
            $this->api('PATCH', '/orders/'.$first['orderId'].'/kitchen-batches/'.$first['batchId'].'/status', compact('status'), $this->owner)->assertOk();
        }
        $this->guestOrder($session['token'], 'laravel-qr-request-00002')->assertCreated()->assertJsonCount(2, 'orders.0.kitchenBatches')->assertJsonPath('orders.0.kitchenBatches.0.status', 'served');
        $this->api('POST', '/table-sessions/'.$session['id'].'/close', [], $this->owner)->assertStatus(409);
        $this->api('POST', '/orders/'.$first['orderId'].'/payments', ['method' => 'qr'], $this->owner)->assertOk();
        $this->guestOrder($session['token'], 'laravel-qr-request-00003')->assertStatus(410);
        $this->api('GET', '/guest/'.$session['token'])->assertJsonPath('session.active', false)->assertJsonCount(0, 'menu');
        $this->assertNotSame($session['token'], $this->qr()['token']);
    }

    public function test_staff_crud_and_token_revocation(): void
    {
        $fields = ['name' => 'ทีมงานใหม่', 'email' => 'staff@example.com', 'role' => 'Waiter', 'branchId' => 'r1', 'pin' => '5678'];
        $this->api('POST', '/users', $fields, $this->login('restaurant-u1'))->assertForbidden();
        $this->api('POST', '/users', [...$fields, 'branchId' => 'b1'], $this->owner)->assertForbidden();
        $this->api('POST', '/users', [...$fields, 'pin' => 'abc'], $this->owner)->assertStatus(400);
        $employee = $this->api('POST', '/users', [...$fields, 'tenantId' => 'brand'], $this->owner)->assertCreated()->assertJsonPath('tenantId', 'restaurant')->assertJsonMissingPath('pinHash')->json();
        $this->api('POST', '/users', [...$fields, 'email' => 'STAFF@EXAMPLE.COM'], $this->owner)->assertStatus(409);
        $token = $this->login($employee['id'], '5678');
        $this->api('PATCH', '/users/'.$employee['id'], ['name' => 'แก้ไข', 'role' => 'Cashier', 'pin' => '9012'], $this->owner)->assertOk();
        $this->api('GET', '/state', [], $token)->assertUnauthorized();
        $new = $this->login($employee['id'], '9012');
        $this->api('GET', '/state', [], $new)->assertJsonPath('user.role', 'Cashier');
        $this->api('PATCH', '/users/brand-u1', ['name' => 'bad'], $this->owner)->assertNotFound();
        $this->api('DELETE', '/users/restaurant-u0', [], $this->owner)->assertStatus(409);
        $this->api('DELETE', '/users/'.$employee['id'], [], $this->owner)->assertOk();
        $this->assertNull(Employee::find($employee['id']));
        $this->api('GET', '/state', [], $new)->assertUnauthorized();
        $this->assertSame(0, AuthToken::where('employee_id', $employee['id'])->count());
    }

    public function test_promotions_modifiers_and_branch_prices_are_server_owned(): void
    {
        $this->api('PATCH', '/menu-items/m1', ['discount' => ['type' => 'percent', 'value' => 10]], $this->owner)->assertOk();
        $order = $this->order(['items' => [['menuId' => 'm1', 'qty' => 1, 'unitPrice' => 1, 'modifiers' => [['group' => 'protein', 'name' => 'เพิ่มไข่ดาว']]]]]);
        $this->assertEquals(131.1, $order['items'][0]['unitPrice']);
        $this->api('PATCH', '/menu-items/m1', ['discount' => ['type' => 'fixed', 'value' => 999]], $this->owner)->assertOk();
        $this->assertEquals(0, $this->order(['items' => [['menuId' => 'm1', 'qty' => 1]]])['items'][0]['unitPrice']);
        $this->api('PATCH', '/menu-items/m1', ['discount' => ['type' => 'percent', 'value' => 101]], $this->owner)->assertStatus(400);
        $this->api('PATCH', '/menu-items/m1', ['discount' => ['type' => 'none', 'value' => 0], 'available' => false], $this->owner)->assertOk();
        $this->api('POST', '/orders', ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => 'm1', 'qty' => 1]]], $this->owner)->assertStatus(400);
        $mods = [['id' => 'size', 'name' => 'ขนาด', 'options' => [['name' => 'ใหญ่', 'price' => 12]]]];
        $this->api('PATCH', '/menu-items/m28', ['name' => 'เมนูใหม่', 'category' => 'dessert', 'price' => 99, 'branchId' => 'b2', 'modifiers' => $mods], $this->brand)->assertOk();
        $branch = $this->order(['branchId' => 'b2', 'items' => [['menuId' => 'm28', 'qty' => 1, 'modifiers' => [['group' => 'size', 'name' => 'ใหญ่']]]]], $this->brand);
        $this->assertEquals(111, $branch['items'][0]['unitPrice']);
        $this->assertSame('เมนูใหม่', $branch['items'][0]['name']);
        $this->api('PATCH', '/menu-items/m28', ['category' => 'missing'], $this->brand)->assertStatus(400);
        $this->api('PATCH', '/menu-items/m28', ['modifiers' => [['id' => 'bad']]], $this->brand)->assertStatus(400);
    }

    public function test_edit_items_cancel_split_merge_move_and_refund(): void
    {
        $order = $this->order(['type' => 'dinein', 'tableId' => 'r1-t10']);
        $id = $order['id'];
        $this->api('POST', "/orders/{$id}/items", ['items' => [['menuId' => 'm3', 'qty' => 1]]], $this->owner)->assertOk()->assertJsonCount(3, 'items');
        $this->api('POST', "/orders/{$id}/items/".$order['items'][1]['id'].'/cancel', ['reason' => 'ไม่รับรายการ'], $this->owner)->assertOk()->assertJsonCount(2, 'items');
        $this->api('POST', "/orders/{$id}/discount", ['amount' => 17.31], $this->owner)->assertOk();
        $split = $this->api('POST', "/orders/{$id}/split", ['selected' => [$order['items'][0]['id'] => 1]], $this->owner)->assertOk()->json();
        $this->assertNotSame($id, $split['split']['id']);
        $this->api('POST', "/orders/{$id}/move", ['tableId' => 'r1-t11'], $this->owner)->assertOk()->assertJsonPath('tableId', 'r1-t11');
        $merged = $this->api('POST', '/orders/'.$split['split']['id'].'/merge', ['targetId' => $id], $this->owner)->assertOk()->json();
        $this->assertCount(3, $merged['items']);
        $this->api('POST', "/orders/{$id}/payments", ['method' => 'qr'], $this->owner)->assertOk();
        $this->api('POST', "/orders/{$id}/refund", ['reason' => 'คืนเงินทดสอบ'], $this->owner)->assertOk()->assertJsonPath('status', 'refunded');
        $this->api('POST', "/orders/{$id}/refund", ['reason' => 'คืนเงินซ้ำ'], $this->owner)->assertStatus(409);
        $cancel = $this->order();
        $this->api('PATCH', '/orders/'.$cancel['id'].'/status', ['status' => 'cancelled', 'reason' => 'ลูกค้ายกเลิก'], $this->owner)->assertOk();
    }

    public function test_enterprise_stock_transfers_refund_and_transaction_rollback(): void
    {
        $stock = fn (string $id) => DB::table('ingredients')->where('id', $id)->value('payload');
        $initial = json_decode($stock('b1-i0'), true)['stock'];
        $order = $this->order(['branchId' => 'b1', 'items' => [['menuId' => 'm1', 'qty' => 1]]], $this->brand);
        $this->api('POST', '/orders/'.$order['id'].'/payments', ['method' => 'card'], $this->brand)->assertOk();
        $this->assertEquals($initial - .25, json_decode($stock('b1-i0'), true)['stock']);
        $this->api('POST', '/orders/'.$order['id'].'/refund', ['reason' => 'คืนทดสอบ'], $this->brand)->assertOk();
        $this->assertEquals($initial, json_decode($stock('b1-i0'), true)['stock']);
        $this->api('POST', '/inventory/adjust', ['ingredientId' => 'b1-i0', 'qty' => 2, 'reason' => 'รับสินค้า'], $this->brand)->assertOk();
        $transfer = $this->api('POST', '/transfers', ['fromBranchId' => 'b1', 'toBranchId' => 'b2', 'ingredientId' => 'b1-i0', 'qty' => 1], $this->brand)->assertCreated()->json();
        $this->api('POST', '/transfers/'.$transfer['id'].'/approve', [], $this->brand)->assertOk()->assertJsonPath('status', 'approved');
        $this->api('POST', '/transfers/'.$transfer['id'].'/approve', [], $this->brand)->assertStatus(409);
        $this->api('GET', '/inventory/movements', [], $this->brand)->assertOk();
        $this->api('GET', '/reports/sales?branchId=b1', [], $this->brand)->assertOk();
        $this->api('POST', '/inventory/adjust', ['ingredientId' => 'b1-i1', 'qty' => -8, 'reason' => 'ทดสอบหมด'], $this->brand)->assertOk();
        $order = $this->order(['branchId' => 'b1', 'items' => [['menuId' => 'm1', 'qty' => 1], ['menuId' => 'm2', 'qty' => 1]]], $this->brand);
        $before = $stock('b1-i0');
        $this->api('POST', '/orders/'.$order['id'].'/payments', ['method' => 'qr'], $this->brand)->assertStatus(409);
        $this->assertSame($before, $stock('b1-i0'));
        $this->assertSame('draft', PosOrder::find($order['id'])->payload['status']);
    }

    public function test_qr_split_move_merge_expiry_and_invalid_guest_inputs(): void
    {
        $a = $this->qr('r1-t12');
        $b = $this->qr('r1-t13');
        $first = $this->guestOrder($a['token'], 'split-qr-request-00001', [['menuId' => 'm1', 'qty' => 2]])->assertCreated()->json();
        $second = $this->guestOrder($b['token'])->assertCreated()->json();
        $split = $this->api('POST', '/orders/'.$first['orderId'].'/split', ['selected' => [$first['orders'][0]['items'][0]['id'] => 1]], $this->owner)->assertOk()->json();
        $this->guestOrder($a['token'], 'split-qr-request-00002')->assertStatus(409);
        $this->api('POST', '/orders/'.$split['split']['id'].'/payments', ['method' => 'qr'], $this->owner)->assertOk();
        $this->api('POST', '/orders/'.$first['orderId'].'/merge', ['targetId' => $second['orderId']], $this->owner)->assertOk();
        $this->api('GET', '/guest/'.$a['token'])->assertJsonPath('session.active', false);
        $this->api('POST', '/orders/'.$second['orderId'].'/move', ['tableId' => 'r1-t14'], $this->owner)->assertOk();
        $this->guestOrder($b['token'], 'moved-qr-request-00001')->assertStatus(410);
        $empty = $this->qr('r1-t15');
        $this->guestOrder($empty['token'], 'invalid-qr-quantity-001', [['menuId' => 'm1', 'qty' => 21]])->assertStatus(400);
        $this->api('POST', '/table-sessions/'.$empty['id'].'/close', [], $this->owner)->assertOk();
        $expired = $this->qr('r1-t15');
        $model = TableSession::find($expired['id']);
        $payload = $model->payload;
        $payload['expiresAt'] = now()->subMinute()->toISOString();
        $model->payload = $payload;
        $model->save();
        $this->guestOrder($expired['token'])->assertStatus(410);
        $this->assertNotSame($expired['token'], $this->qr('r1-t15')['token']);
        $this->api('GET', '/guest/bad-token')->assertNotFound();
        $this->api('GET', '/guest/bad-token/unknown')->assertNotFound();
    }

    public function test_reservations_settings_shifts_cors_and_unknown_routes(): void
    {
        $this->api('PATCH', '/tables/r1-t15/reservation', ['reservation' => ['name' => 'ลูกค้า', 'time' => '18:00']], $this->owner)->assertOk()->assertJsonPath('reservation.name', 'ลูกค้า');
        $this->api('PATCH', '/tables/r1-t15/reservation', ['reservation' => null], $this->owner)->assertOk()->assertJsonPath('reservation', null);
        $this->api('PATCH', '/settings', ['taxRate' => 7, 'serviceRate' => 10], $this->owner)->assertOk();
        $order = $this->order(['items' => [['menuId' => 'm1', 'qty' => 1]]]);
        $this->assertEquals(151.83, $order['totals']['total']);
        $this->api('POST', '/shifts', ['branchId' => 'r1', 'open' => false], $this->owner)->assertStatus(409);
        foreach ($this->api('GET', '/state', [], $this->owner)->json('orders') as $o) {
            $this->api('PATCH', '/orders/'.$o['id'].'/status', ['status' => 'cancelled', 'reason' => 'ปิดกะทดสอบ'], $this->owner)->assertOk();
        }
        $this->api('POST', '/shifts', ['branchId' => 'r1', 'open' => false], $this->owner)->assertOk();
        $this->api('POST', '/orders', ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => 'm1', 'qty' => 1]]], $this->owner)->assertStatus(409);
        $this->api('POST', '/shifts', ['branchId' => 'r1', 'open' => true], $this->owner)->assertOk();
        config(['pos.allowed_origins' => ['https://front.example']]);
        $this->json('OPTIONS', '/api/users/id', [], ['Origin' => 'https://front.example'])->assertNoContent()->assertHeader('Access-Control-Allow-Origin', 'https://front.example');
        $this->json('GET', '/api/demo', [], ['Origin' => 'https://bad.example'])->assertForbidden();
        $this->api('GET', '/unknown')->assertUnauthorized();
        $this->api('GET', '/unknown', [], $this->owner)->assertNotFound();
        $this->artisan('pos:seed')->assertFailed();
    }
}
