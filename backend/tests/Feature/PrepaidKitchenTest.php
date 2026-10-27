<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\PosOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class PrepaidKitchenTest extends TestCase
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

    private function order(array $extra = []): array
    {
        return $this->postJson('/api/orders', $extra + ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => 'm30', 'qty' => 1]]], $this->owner)->assertCreated()->json();
    }

    public function test_payment_at_each_preparation_stage_preserves_fulfillment_and_receipt(): void
    {
        foreach (['draft', 'pending', 'cooking', 'ready', 'served'] as $stage) {
            $order = $this->order();
            $path = '/api/orders/'.$order['id'];
            foreach (['pending', 'cooking', 'ready', 'served'] as $next) {
                if ($stage === 'draft') {
                    break;
                }
                $this->patchJson($path.'/status', ['status' => $next], $this->owner)->assertOk();
                if ($next === $stage) {
                    break;
                }
            }
            if ($stage === 'cooking') {
                $this->postJson($path.'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertStatus(409);
                $this->patchJson($path.'/status', ['status' => 'ready'], $this->owner)->assertOk();
            }
            $expected = $stage === 'draft' ? 'pending' : ($stage === 'cooking' ? 'ready' : $stage);
            $paid = $this->postJson($path.'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertOk()->assertJsonPath('status', 'paid')->assertJsonPath('kitchenStatus', $expected)->json();
            $this->postJson($path.'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertStatus(409);
            $this->postJson($path.'/items', ['items' => [['menuId' => 'm30', 'qty' => 1]]], $this->owner)->assertStatus(409);
            $this->postJson($path.'/discount', ['amount' => 1], $this->owner)->assertStatus(409);
            $this->patchJson($path.'/status', ['status' => 'cancelled', 'reason' => 'ทดสอบ'], $this->owner)->assertStatus(409);
            $current = $expected;
            foreach (['pending' => 'cooking', 'cooking' => 'ready', 'ready' => 'served'] as $from => $next) {
                if ($current !== $from) {
                    continue;
                }
                $this->patchJson($path.'/status', ['status' => $next], $this->owner)->assertOk()->assertJsonPath('status', 'paid')->assertJsonPath('kitchenStatus', $next)->assertJsonPath('totals', $paid['totals'])->assertJsonPath('paidAt', $paid['paidAt'])->assertJsonPath('payment', $paid['payment'])->assertJsonPath('receipt', $paid['receipt']);
                $current = $next;
            }
            $this->patchJson($path.'/status', ['status' => 'cooking'], $this->owner)->assertStatus(409);
        }
        $this->getJson('/api/reports/sales', $this->owner)->assertOk()->assertJsonCount(5, 'orders');
    }

    public function test_paid_table_and_qr_remain_occupied_until_all_rounds_are_served(): void
    {
        $session = $this->postJson('/api/tables/r1-t15/session', [], $this->owner)->assertOk()->json();
        $guestPath = '/api/guest/'.$session['token'];
        $first = $this->postJson($guestPath.'/orders', ['requestId' => 'prepaid-kitchen-round-01', 'items' => [['menuId' => 'm30', 'qty' => 1]]])->assertCreated()->json();
        $second = $this->postJson($guestPath.'/orders', ['requestId' => 'prepaid-kitchen-round-02', 'items' => [['menuId' => 'm30', 'qty' => 1]]])->assertCreated()->json();
        $path = '/api/orders/'.$first['orderId'];
        $this->postJson($path.'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertOk()->assertJsonPath('kitchenStatus', 'pending');
        $this->patchJson('/api/orders/'.$first['orderId'].'/kitchen-batches/'.$first['batchId'].'/status', ['status' => 'cooking'], $this->owner)->assertOk();
        $this->getJson($guestPath)->assertOk()->assertJsonPath('session.active', true)->assertJsonPath('session.acceptingOrders', false)->assertJsonPath('orders.0.status', 'paid');
        $this->postJson($guestPath.'/orders', ['requestId' => 'prepaid-kitchen-round-03', 'items' => [['menuId' => 'm30', 'qty' => 1]]])->assertStatus(409);
        $this->postJson('/api/orders', ['branchId' => 'r1', 'type' => 'dinein', 'tableId' => 'r1-t15', 'items' => [['menuId' => 'm30', 'qty' => 1]]], $this->owner)->assertStatus(409);
        $this->postJson('/api/table-sessions/'.$session['id'].'/close', [], $this->owner)->assertStatus(409);
        $this->deleteJson('/api/tables/r1-t15', [], $this->owner)->assertStatus(409);
        $this->postJson('/api/shifts', ['branchId' => 'r1', 'open' => false], $this->owner)->assertStatus(409);
        $cook = $this->login('restaurant-u4');
        $waiter = $this->login('restaurant-u3');
        foreach ([$cook, $waiter] as $headers) {
            $orders = $this->getJson('/api/state', $headers)->assertOk()->json('orders');
            $this->assertContains($first['orderId'], array_column($orders, 'id'));
        }
        $this->patchJson($path.'/kitchen-batches/'.$first['batchId'].'/status', ['status' => 'ready'], $waiter)->assertForbidden();
        $this->patchJson($path.'/kitchen-batches/'.$first['batchId'].'/status', ['status' => 'ready'], $cook)->assertOk()->assertJsonPath('status', 'paid');
        $this->patchJson($path.'/kitchen-batches/'.$first['batchId'].'/status', ['status' => 'served'], $cook)->assertForbidden();
        $this->patchJson($path.'/kitchen-batches/'.$first['batchId'].'/status', ['status' => 'served'], $waiter)->assertOk()->assertJsonPath('kitchenStatus', 'pending');
        foreach (['cooking', 'ready', 'served'] as $status) {
            $this->patchJson($path.'/kitchen-batches/'.$second['batchId'].'/status', compact('status'), $this->owner)->assertOk()->assertJsonPath('status', 'paid');
        }
        $this->getJson($guestPath)->assertOk()->assertJsonPath('session.active', false)->assertJsonPath('orders.0.kitchenStatus', 'served');
        $this->order(['type' => 'dinein', 'tableId' => 'r1-t15']);
    }

    public function test_refund_stops_prepaid_kitchen_work_and_releases_table(): void
    {
        $order = $this->order(['type' => 'dinein', 'tableId' => 'r1-t14']);
        $path = '/api/orders/'.$order['id'];
        $this->postJson($path.'/payments', ['method' => 'card'], $this->owner)->assertOk()->assertJsonPath('kitchenStatus', 'pending');
        $this->postJson($path.'/refund', ['reason' => 'คืนเงินทดสอบ'], $this->owner)->assertOk()->assertJsonPath('status', 'refunded');
        $this->patchJson($path.'/status', ['status' => 'cooking'], $this->owner)->assertStatus(409);
        $this->order(['type' => 'dinein', 'tableId' => 'r1-t14']);
    }

    public function test_legacy_paid_receipts_are_not_reopened_and_small_plan_has_no_kitchen_queue(): void
    {
        $order = $this->order(['type' => 'dinein', 'tableId' => 'r1-t13']);
        $path = '/api/orders/'.$order['id'];
        $this->postJson($path.'/payments', ['method' => 'card'], $this->owner)->assertOk();
        $record = PosOrder::findOrFail($order['id']);
        $payload = $record->payload;
        unset($payload['kitchenStatus']);
        $record->payload = $payload;
        $record->save();
        $this->patchJson($path.'/status', ['status' => 'cooking'], $this->owner)->assertStatus(409);
        $this->order(['type' => 'dinein', 'tableId' => 'r1-t13']);
        $small = $this->login('cafe-u0');
        $id = $this->postJson('/api/orders', ['branchId' => 'c1', 'type' => 'takeaway', 'items' => [['menuId' => 'm30', 'qty' => 1]]], $small)->assertCreated()->json('id');
        $this->postJson('/api/orders/'.$id.'/payments', ['method' => 'card'], $small)->assertOk()->assertJsonPath('kitchenStatus', 'served');
    }

    public function test_bulk_prepaid_updates_do_not_rewind_more_advanced_rounds(): void
    {
        $session = $this->postJson('/api/tables/r1-t15/session', [], $this->owner)->assertOk()->json();
        $guest = '/api/guest/'.$session['token'].'/orders';
        $first = $this->postJson($guest, ['requestId' => 'bulk-prepaid-request-001', 'items' => [['menuId' => 'm30', 'qty' => 1]]])->assertCreated()->json();
        $path = '/api/orders/'.$first['orderId'];
        foreach (['cooking', 'ready'] as $status) {
            $this->patchJson($path.'/kitchen-batches/'.$first['batchId'].'/status', compact('status'), $this->owner)->assertOk();
        }
        $this->postJson($guest, ['requestId' => 'bulk-prepaid-request-002', 'items' => [['menuId' => 'm30', 'qty' => 1]]])->assertCreated();
        $this->postJson($path.'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertOk();
        $this->patchJson($path.'/status', ['status' => 'cooking'], $this->owner)->assertOk()->assertJsonPath('kitchenBatches.0.status', 'ready')->assertJsonPath('kitchenBatches.1.status', 'cooking')->assertJsonPath('status', 'paid');
        $this->patchJson($path.'/status', ['status' => 'ready'], $this->owner)->assertOk()->assertJsonPath('kitchenBatches.0.status', 'ready')->assertJsonPath('kitchenBatches.1.status', 'ready');
        $this->patchJson($path.'/status', ['status' => 'served'], $this->owner)->assertOk()->assertJsonPath('kitchenStatus', 'served');
    }

    public function test_enterprise_preparation_after_payment_does_not_deduct_stock_again(): void
    {
        $brand = $this->login('brand-u0');
        $order = $this->postJson('/api/orders', ['branchId' => 'b1', 'type' => 'takeaway', 'items' => [['menuId' => 'm1', 'qty' => 1]]], $brand)->assertCreated()->json();
        $path = '/api/orders/'.$order['id'];
        $this->postJson($path.'/payments', ['method' => 'cash', 'received' => 1000], $brand)->assertOk();
        $stock = $this->getJson('/api/state', $brand)->assertOk()->json('ingredients');
        $this->postJson($path.'/payments', ['method' => 'cash', 'received' => 1000], $brand)->assertStatus(409);
        foreach (['cooking', 'ready', 'served'] as $status) {
            $this->patchJson($path.'/status', compact('status'), $brand)->assertOk()->assertJsonPath('status', 'paid');
        }
        $this->assertSame($stock, $this->getJson('/api/state', $brand)->assertOk()->json('ingredients'));
        $this->patchJson($path.'/status', ['status' => 'cooking'], $this->owner)->assertNotFound();
    }

    public function test_payment_is_blocked_if_any_kitchen_round_is_cooking_even_when_order_is_pending(): void
    {
        $session = $this->postJson('/api/tables/r1-t15/session', [], $this->owner)->assertOk()->json();
        $guest = '/api/guest/'.$session['token'].'/orders';
        $first = $this->postJson($guest, ['requestId' => 'cooking-payment-request-01', 'items' => [['menuId' => 'm30', 'qty' => 1]]])->assertCreated()->json();
        $path = '/api/orders/'.$first['orderId'];
        $this->patchJson($path.'/kitchen-batches/'.$first['batchId'].'/status', ['status' => 'cooking'], $this->owner)->assertOk();
        $this->postJson($guest, ['requestId' => 'cooking-payment-request-02', 'items' => [['menuId' => 'm30', 'qty' => 1]]])->assertCreated()->assertJsonPath('orders.0.status', 'pending');
        foreach (['cash', 'qr', 'card'] as $method) {
            $this->postJson($path.'/payments', ['method' => $method, 'received' => 1000], $this->owner)->assertStatus(409)->assertJsonPath('error', 'ออเดอร์กำลังทำอาหาร กรุณารอครัวทำเสร็จก่อนรับชำระเงิน');
        }
        $payload = PosOrder::findOrFail($first['orderId'])->payload;
        $this->assertSame('pending', $payload['status']);
        $this->assertArrayNotHasKey('payment', $payload);
        $this->assertArrayNotHasKey('paidAt', $payload);
        $this->assertArrayNotHasKey('receipt', $payload);
        $this->patchJson($path.'/kitchen-batches/'.$first['batchId'].'/status', ['status' => 'ready'], $this->owner)->assertOk();
        $this->postJson($path.'/payments', ['method' => 'cash', 'received' => 1000], $this->owner)->assertOk()->assertJsonPath('status', 'paid');
    }
}
