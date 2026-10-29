<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AuthToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class PosService
{
    use BranchActions;
    use CatalogActions;
    use CategoryActions;
    use ManagementActions;
    use OrderActions;
    use PaymentQrActions;
    use RoleActions;

    public bool $dirty = false;

    public array $uploadedImages = [];

    public array $replacedImages = [];

    private array $user = [];

    private const CLOSED = ['paid', 'refunded', 'cancelled', 'merged', 'split'];

    private const PERMISSIONS = RoleCatalog::PERMISSIONS;

    public function __construct(public array $data) {}

    private function check(mixed $condition, string $message = 'ข้อมูลไม่ถูกต้อง', int $status = 400): void
    {
        if (! $condition) {
            throw new ApiError($message, $status);
        }
    }

    private function uid(): string
    {
        return (string) Str::uuid();
    }

    private function now(): string
    {
        return now()->utc()->format('Y-m-d\TH:i:s.v\Z');
    }

    private function money(float|int $value): float
    {
        return round($value, 2);
    }

    private function safe(array $user): array
    {
        $role = $this->first('roles', fn ($r) => $r['tenantId'] === $user['tenantId'] && $r['key'] === $user['role']);

        return [...array_diff_key($user, array_flip(['pin', 'pinHash'])), 'roleName' => $role['name'] ?? (RoleCatalog::LABELS[$user['role']] ?? $user['role'])];
    }

    private function list(string $key, callable $predicate): array
    {
        return array_values(array_filter($this->data[$key] ?? [], $predicate));
    }

    private function first(string $key, callable $predicate): ?array
    {
        return $this->list($key, $predicate)[0] ?? null;
    }

    private function &record(string $key, callable $predicate, string $message = 'ไม่พบข้อมูล', int $status = 404): array
    {
        foreach ($this->data[$key] as &$record) {
            if ($predicate($record)) {
                return $record;
            }
        }
        throw new ApiError($message, $status);
    }

    private function can(string $action): bool
    {
        if ($this->user['role'] === 'Owner') {
            return array_key_exists($action, self::PERMISSIONS);
        }
        $role = $this->currentRole();

        return in_array($action, $role['permissions'] ?? [], true);
    }

    private function allowed(string $action): void
    {
        $this->check($this->can($action), 'บทบาทนี้ไม่มีสิทธิ์ทำรายการ', 403);
    }

    private function scope(array $row): bool
    {
        return empty($row['deleted']) && $row['tenantId'] === $this->user['tenantId'] && ($this->user['role'] === 'Owner' || ($this->currentRole()['scope'] ?? 'branch') === 'tenant' || ($row['branchId'] ?? null) === $this->user['branchId']);
    }

    private function plan(): string
    {
        return $this->first('tenants', fn ($t) => $t['id'] === $this->user['tenantId'])['plan'];
    }

    private function feature(string $level = 'medium'): void
    {
        $this->check($level === 'enterprise' ? $this->plan() === 'Enterprise' : $this->plan() !== 'Small', 'ฟีเจอร์นี้ไม่อยู่ในแพ็กเกจ', 403);
    }

    private function open(array $order): void
    {
        $this->check(! in_array($order['status'], self::CLOSED, true), 'บิลนี้ปิดแล้ว', 409);
    }

    private function &order(string $id): array
    {
        return $this->record('orders', fn ($o) => $o['id'] === $id && $this->scope($o), 'ไม่พบออเดอร์');
    }

    private function branch(string $id): array
    {
        $branch = $this->first('branches', fn ($b) => $b['id'] === $id && $this->scope([...$b, 'branchId' => $b['id']]));
        $this->check($branch, 'ไม่มีสิทธิ์เข้าถึงสาขานี้', 403);

        return $branch;
    }

    private function audit(string $action, string $detail, ?string $branchId = null, ?array $actor = null): void
    {
        $actor ??= $this->user;
        array_unshift($this->data['audit'], ['id' => $this->uid(), 'tenantId' => $actor['tenantId'], 'branchId' => $branchId ?? $actor['branchId'], 'user' => $actor['name'], 'role' => $actor['role'], 'roleName' => $this->safe($actor)['roleName'], 'action' => $action, 'detail' => $detail, 'at' => $this->now()]);
        $this->dirty = true;
    }

    public function totals(array $order): array
    {
        $subtotal = $this->money(array_sum(array_map(fn ($i) => $i['qty'] * $i['unitPrice'], $order['items'])));
        $discount = $this->money($order['discount'] ?? 0);
        $this->check($discount >= 0 && $discount <= $subtotal, 'ส่วนลดต้องไม่เกินยอดสินค้า');
        $service = $this->money(($subtotal - $discount) * ($order['serviceRate'] ?? 0) / 100);
        $tax = $this->money(($subtotal - $discount + $service) * ($order['taxRate'] ?? 0) / 100);

        return compact('subtotal', 'discount', 'service', 'tax') + ['total' => $this->money($subtotal - $discount + $service + $tax + ($order['roundingAdjustment'] ?? 0))];
    }

    private function catalog(string $tenantId): array
    {
        $menus = $this->list('menu', fn ($menu) => (! isset($menu['tenantId']) || $menu['tenantId'] === $tenantId) && empty($this->data['menuCustom'][$tenantId][$menu['id']]['deleted']));
        $sales = $this->bestSellers($tenantId, $menus);

        return array_map(function ($menu) use ($tenantId, $sales): array {
            $custom = $this->data['menuCustom'][$tenantId][$menu['id']] ?? [];
            $result = [...$menu, ...$custom, 'popular' => in_array($menu['id'], $sales['ids'], true), 'soldQuantity' => $sales['counts'][$menu['id']] ?? 0, 'overrides' => array_replace($menu['overrides'] ?? [], $custom['overrides'] ?? [])];
            if (str_starts_with($result['image'], '/media/menu-images/')) {
                $result['image'] = url($result['image']);
            }

            return $result;
        }, $menus);
    }

    private function price(array $menu, string $branchId): array
    {
        $originalPrice = $this->money($menu['overrides'][$branchId] ?? $menu['price']);
        $discount = $menu['discount'] ?? ['type' => 'none', 'value' => 0];
        $reduction = match ($discount['type']) {
            'percent' => $this->money($originalPrice * $discount['value'] / 100), 'fixed' => $discount['value'], default => 0
        };
        $discountAmount = $this->money(min($originalPrice, max(0, $reduction)));

        return compact('originalPrice', 'discountAmount') + ['price' => $this->money($originalPrice - $discountAmount)];
    }

    private function parseItems(string $tenantId, string $branchId, mixed $items): array
    {
        $this->check(is_array($items) && array_is_list($items) && count($items) > 0 && count($items) < 100, 'กรุณาเลือกสินค้า');
        $catalog = $this->catalog($tenantId);

        return array_map(function ($item) use ($catalog, $branchId): array {
            $this->check(is_array($item), 'รายการสินค้าไม่ถูกต้อง');
            $menu = array_values(array_filter($catalog, fn ($m) => $m['id'] === ($item['menuId'] ?? null)))[0] ?? null;
            $this->check($menu && $menu['available'], 'สินค้าหมดหรือไม่พบสินค้า');
            $this->check(is_int($item['qty'] ?? null) && $item['qty'] > 0 && $item['qty'] <= 99, 'จำนวนสินค้าต้องอยู่ระหว่าง 1–99');
            $this->check(! isset($item['modifiers']) || (is_array($item['modifiers']) && array_is_list($item['modifiers'])), 'ตัวเลือกสินค้าไม่ถูกต้อง');
            $selected = [];
            foreach ($item['modifiers'] ?? [] as $selection) {
                $this->check(is_array($selection), 'ตัวเลือกสินค้าไม่ถูกต้อง');
                $group = array_values(array_filter($menu['modifiers'], fn ($g) => $g['id'] === ($selection['group'] ?? null)))[0] ?? null;
                $option = array_values(array_filter($group['options'] ?? [], fn ($o) => $o['name'] === ($selection['name'] ?? null)))[0] ?? null;
                $this->check($option, 'ตัวเลือกสินค้าไม่ถูกต้อง');
                $selected[] = ['group' => $selection['group'], ...$option];
            }
            $this->check(count(array_unique(array_column($selected, 'group'))) === count($selected), 'ตัวเลือกสินค้าซ้ำ');
            $pricing = $this->price($menu, $branchId);
            $extras = array_sum(array_column($selected, 'price'));

            return ['id' => $this->uid(), 'menuId' => $menu['id'], 'name' => $menu['name'], 'qty' => $item['qty'], 'originalUnitPrice' => $this->money($pricing['originalPrice'] + $extras), 'menuDiscount' => $pricing['discountAmount'], 'unitPrice' => $this->money($pricing['price'] + $extras), 'modifiers' => $selected, 'note' => mb_substr((string) ($item['note'] ?? ''), 0, 300), 'status' => 'pending'];
        }, $items);
    }

    private function tableFree(string $id, ?string $except = null): void
    {
        $this->check($this->first('tables', fn ($t) => $t['id'] === $id && $this->scope($t)), 'ไม่พบโต๊ะ');
        $this->check(! $this->first('orders', fn ($o) => ($o['tableId'] ?? null) === $id && $o['id'] !== $except && OrderFlow::serviceOpen($o)), 'โต๊ะนี้มีออเดอร์อยู่แล้ว', 409);
    }

    private function active(array $session): bool
    {
        return $session['status'] === 'active' && strtotime($session['expiresAt']) > time();
    }

    private function sessionForTable(?string $tableId): ?array
    {
        return $this->first('tableSessions', fn ($s) => $s['tableId'] === $tableId && $this->active($s));
    }

    private function summary(array $session): array
    {
        return ['id' => $session['id'], 'tableId' => $session['tableId'], 'branchId' => $session['branchId'], 'orderIds' => $session['orderIds'], 'active' => $this->active($session), 'acceptingOrders' => $this->active($session) && $session['acceptingOrders'], 'expiresAt' => $session['expiresAt'], 'calls' => $this->openCalls($session)];
    }

    private function openCalls(array $session): array
    {
        return array_values(array_map(fn ($c) => array_intersect_key($c, array_flip(['id', 'type', 'at'])), array_filter($session['calls'] ?? [], fn ($c) => $c['status'] === 'open')));
    }

    private function guestCall(string $token, array $body): array
    {
        $this->check(preg_match('/^[a-f0-9]{48}$/D', $token), 'ไม่พบ QR สำหรับโต๊ะนี้', 404);
        $session = &$this->record('tableSessions', fn ($s) => hash_equals($s['token'], $token), 'ไม่พบ QR สำหรับโต๊ะนี้');
        $this->check($this->first('tenants', fn ($t) => $t['id'] === $session['tenantId'])['plan'] !== 'Small', 'ร้านนี้ยังไม่เปิดรับออเดอร์ผ่าน QR', 403);
        $this->check($this->active($session), 'QR หมดอายุหรือรอบบริการสิ้นสุดแล้ว กรุณาติดต่อพนักงาน', 410);
        $type = $body['type'] ?? null;
        $this->check(in_array($type, ['staff', 'bill'], true), 'ประเภทการเรียกไม่ถูกต้อง');
        $duplicate = (bool) array_filter($session['calls'] ?? [], fn ($c) => $c['status'] === 'open' && $c['type'] === $type);
        if (! $duplicate) {
            $session['calls'][] = ['id' => $this->uid(), 'type' => $type, 'status' => 'open', 'at' => $this->now()];
            $session['calls'] = array_slice($session['calls'], -30);
            $this->dirty = true;
        }

        return ['status' => $duplicate ? 200 : 201, 'body' => ['duplicate' => $duplicate, ...$this->guestState($session)]];
    }

    private function syncBatches(array &$order): void
    {
        if ((in_array($order['status'], self::CLOSED, true) && $order['status'] !== 'paid') || empty($order['kitchenBatches'])) {
            return;
        }
        foreach (['pending', 'cooking', 'ready', 'served'] as $status) {
            if (array_filter($order['kitchenBatches'], fn ($b) => $b['status'] === $status)) {
                if ($order['status'] === 'paid') {
                    $order['kitchenStatus'] = $status;
                } else {
                    $order['status'] = $status;
                }

                return;
            }
        }
    }

    private function ensureBatches(array &$order): void
    {
        if (! empty($order['kitchenBatches'])) {
            return;
        }
        $order['kitchenBatches'] = [];
        if (! $order['items']) {
            return;
        }
        $batch = ['id' => $this->uid(), 'round' => 1, 'source' => $order['source'] ?? 'staff', 'status' => $order['status'] === 'draft' ? 'pending' : $order['status'], 'createdAt' => $order['createdAt'], 'itemIds' => array_column($order['items'], 'id')];
        $order['kitchenBatches'][] = $batch;
        foreach ($order['items'] as &$item) {
            $item['batchId'] = $batch['id'];
            $item['status'] = $batch['status'];
        }
    }

    private function addBatch(array &$order, array $items, string $source): array
    {
        $this->ensureBatches($order);
        $batch = ['id' => $this->uid(), 'round' => count($order['kitchenBatches']) + 1, 'source' => $source, 'status' => 'pending', 'createdAt' => $this->now(), 'itemIds' => array_column($items, 'id')];
        foreach ($items as &$item) {
            $item['batchId'] = $batch['id'];
            $item['status'] = 'pending';
        }
        unset($item);
        $order['items'] = [...$order['items'], ...$items];
        $order['kitchenBatches'][] = $batch;
        $this->syncBatches($order);

        return $batch;
    }

    private function serializeOrders(array $session): array
    {
        $result = [];
        foreach ($session['orderIds'] as $id) {
            $order = $this->first('orders', fn ($o) => $o['id'] === $id);
            if (! $order) {
                continue;
            }
            $items = array_map(function ($item) use ($order): array {
                return array_intersect_key($item, array_flip(['id', 'menuId', 'name', 'qty', 'unitPrice', 'originalUnitPrice', 'menuDiscount', 'modifiers', 'note'])) + ['status' => ! empty($order['kitchenBatches']) ? ($item['status'] ?? OrderFlow::kitchenStatus($order)) : OrderFlow::kitchenStatus($order)];
            }, $order['items']);
            $result[] = ['id' => $id, 'number' => $order['number'], 'status' => $order['status'], 'kitchenStatus' => OrderFlow::kitchenStatus($order), 'items' => $items, 'totals' => $order['totals'] ?? $this->totals($order), 'createdAt' => $order['createdAt'], 'roundingAdjustment' => $order['roundingAdjustment'] ?? 0, 'kitchenBatches' => $order['kitchenBatches'] ?? []];
        }

        return $result;
    }

    private function closeSession(array &$session, string $reason): void
    {
        $session['closedOrders'] = strtotime($session['expiresAt']) > time() ? $this->serializeOrders($session) : [];
        $session['status'] = 'closed';
        $session['acceptingOrders'] = false;
        $session['closedAt'] = $this->now();
        $session['closeReason'] = $reason;
    }

    private function onClosed(array $order): void
    {
        foreach ($this->data['tableSessions'] as &$session) {
            if ($session['status'] !== 'active' || ! in_array($order['id'], $session['orderIds'], true)) {
                continue;
            }
            $session['acceptingOrders'] = false;
            if (! array_filter($session['orderIds'], fn ($id) => OrderFlow::serviceOpen($this->first('orders', fn ($o) => $o['id'] === $id) ?? ['status' => 'cancelled']))) {
                $this->closeSession($session, 'รอบบริการนี้สิ้นสุดแล้ว กรุณาขอ QR ใหม่จากพนักงาน');
            }
        }
    }

    private function revokeForOrder(array $order, string $reason): void
    {
        foreach ($this->data['tableSessions'] as &$session) {
            if ($session['status'] === 'active' && in_array($order['id'], $session['orderIds'], true)) {
                $this->closeSession($session, $reason);
            }
        }
    }

    private function guestState(array $session): array
    {
        $tenant = $this->first('tenants', fn ($t) => $t['id'] === $session['tenantId']);
        $branch = $this->first('branches', fn ($b) => $b['id'] === $session['branchId']);
        $table = $this->first('tables', fn ($t) => $t['id'] === $session['tableId']);
        $active = $this->active($session);
        $shift = $this->first('shifts', fn ($s) => $s['branchId'] === $session['branchId']);
        $settings = $this->first('settings', fn ($s) => $s['tenantId'] === $session['tenantId']);
        foreach ($session['orderIds'] as $id) {
            $order = $this->first('orders', fn ($o) => $o['id'] === $id);
            if ($order && ! in_array($order['status'], self::CLOSED, true)) {
                $settings = $order;
                break;
            }
        }
        $reason = ! $active ? ($session['closeReason'] ?? 'QR หมดอายุ กรุณาขอ QR ใหม่จากพนักงาน') : (! $session['acceptingOrders'] ? 'โต๊ะนี้กำลังแยกหรือชำระบิล กรุณาติดต่อพนักงาน' : (! ($shift['open'] ?? false) ? 'ร้านพักรับออเดอร์ชั่วคราว' : ''));
        $menu = $active ? array_map(fn ($m) => [...array_intersect_key($m, array_flip(['id', 'name', 'en', 'category', 'image', 'popular', 'available', 'discount', 'modifiers'])), ...$this->price($m, $session['branchId'])], $this->catalog($session['tenantId'])) : [];

        return ['session' => [...$this->summary($session), 'acceptingOrders' => $active && $session['acceptingOrders'] && ($shift['open'] ?? false), 'reason' => $reason], 'restaurant' => ['name' => $tenant['name'], 'branch' => $branch['name'], 'table' => $table['name'], 'seats' => $table['seats']], 'categories' => $active ? $this->categories($session['tenantId']) : [], 'acceptedRequests' => array_column($session['submissions'] ?? [], 'key'), 'settings' => ['taxRate' => $settings['taxRate'], 'serviceRate' => $settings['serviceRate']], 'menu' => $menu, 'orders' => $active ? $this->serializeOrders($session) : ($session['closedOrders'] ?? [])];
    }

    private function guest(string $token, bool $submit, array $body): array
    {
        $this->check(preg_match('/^[a-f0-9]{48}$/D', $token), 'ไม่พบ QR สำหรับโต๊ะนี้', 404);
        $session = &$this->record('tableSessions', fn ($s) => hash_equals($s['token'], $token), 'ไม่พบ QR สำหรับโต๊ะนี้');
        $this->check($this->first('tenants', fn ($t) => $t['id'] === $session['tenantId'])['plan'] !== 'Small', 'ร้านนี้ยังไม่เปิดรับออเดอร์ผ่าน QR', 403);
        if (! $submit) {
            return ['body' => $this->guestState($session)];
        }
        $this->check($this->active($session), 'QR หมดอายุหรือรอบบริการสิ้นสุดแล้ว กรุณาติดต่อพนักงาน', 410);
        $this->check($session['acceptingOrders'], 'โต๊ะนี้กำลังแยกหรือชำระบิล กรุณาติดต่อพนักงาน', 409);
        $this->check($this->first('shifts', fn ($s) => $s['branchId'] === $session['branchId'])['open'] ?? false, 'ร้านพักรับออเดอร์ชั่วคราว', 409);
        $key = $body['requestId'] ?? null;
        $this->check(is_string($key) && preg_match('/^[a-zA-Z0-9_-]{16,100}$/D', $key), 'กรุณาระบุรหัสคำขอสั่งอาหาร');
        $items = $body['items'] ?? null;
        $this->check(is_array($items) && array_is_list($items) && count($items) > 0 && count($items) <= 30, 'เลือกอาหาร 1–30 รายการต่อรอบ');
        $normalized = [];
        foreach ($items as $item) {
            $this->check(is_array($item) && is_int($item['qty'] ?? null) && $item['qty'] > 0 && $item['qty'] <= 20, 'สั่งได้ไม่เกิน 20 ต่อรายการ และ 50 จานต่อรอบ');
            $this->check(! isset($item['modifiers']) || (is_array($item['modifiers']) && array_is_list($item['modifiers'])), 'ตัวเลือกสินค้าไม่ถูกต้อง');
            $modifiers = [];
            foreach ($item['modifiers'] ?? [] as $modifier) {
                $this->check(is_array($modifier), 'ตัวเลือกสินค้าไม่ถูกต้อง');
                $modifiers[] = ['group' => $modifier['group'] ?? null, 'name' => $modifier['name'] ?? null];
            }
            $normalized[] = ['menuId' => $item['menuId'] ?? null, 'qty' => $item['qty'], 'note' => mb_substr((string) ($item['note'] ?? ''), 0, 300), 'modifiers' => $modifiers];
        }
        $this->check(array_sum(array_column($normalized, 'qty')) <= 50, 'สั่งได้ไม่เกิน 50 จานต่อรอบ');
        // Match JSON.stringify's Unicode and slash encoding for imported request hashes.
        $hash = hash('sha256', json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        foreach ($session['submissions'] ?? [] as $existing) {
            if ($existing['key'] === $key) {
                $this->check(hash_equals($existing['hash'], $hash), 'รหัสคำขอนี้ถูกใช้กับรายการอื่นแล้ว', 409);

                return ['body' => ['orderId' => $existing['orderId'], 'batchId' => $existing['batchId'], 'duplicate' => true, ...$this->guestState($session)]];
            }
        }
        $this->check(count($session['submissions'] ?? []) < 100, 'โต๊ะนี้สั่งครบจำนวนรอบที่รองรับแล้ว กรุณาติดต่อพนักงาน', 429);
        $parsed = $this->parseItems($session['tenantId'], $session['branchId'], $normalized);
        $found = $this->first('orders', fn ($o) => in_array($o['id'], $session['orderIds'], true) && ($o['tableId'] ?? null) === $session['tableId'] && ! in_array($o['status'], self::CLOSED, true));
        if (! $found) {
            $settings = $this->first('settings', fn ($s) => $s['tenantId'] === $session['tenantId']);
            $found = ['id' => $this->uid(), 'number' => $this->data['nextOrder']++, 'tenantId' => $session['tenantId'], 'branchId' => $session['branchId'], 'tableId' => $session['tableId'], 'type' => 'dinein', 'items' => [], 'discount' => 0, 'taxRate' => $settings['taxRate'], 'serviceRate' => $settings['serviceRate'], 'status' => 'pending', 'source' => 'customer_qr', 'serviceSessionId' => $session['id'], 'createdAt' => $this->now(), 'createdBy' => 'guest:'.$session['id']];
            $this->data['orders'][] = $found;
            $session['orderIds'][] = $found['id'];
        }
        $order = &$this->record('orders', fn ($o) => $o['id'] === $found['id']);
        $batch = $this->addBatch($order, $parsed, 'customer_qr');
        $session['submissions'][] = ['key' => $key, 'hash' => $hash, 'orderId' => $order['id'], 'batchId' => $batch['id'], 'at' => $this->now()];
        $tableName = $this->first('tables', fn ($t) => $t['id'] === $session['tableId'])['name'];
        $this->audit('ลูกค้าสั่งผ่าน QR', '#'.$order['number'].' · รอบ '.$batch['round'], $session['branchId'], ['tenantId' => $session['tenantId'], 'branchId' => $session['branchId'], 'name' => 'ลูกค้าโต๊ะ '.$tableName, 'role' => 'Customer']);

        return ['status' => 201, 'body' => ['orderId' => $order['id'], 'batchId' => $batch['id'], 'duplicate' => false, ...$this->guestState($session)]];
    }

    public function dispatch(Request $request): array
    {
        $method = $request->method();
        $path = '/'.trim(preg_replace('#^api/?#', '', $request->path()), '/');
        $body = $request->json()->all();
        if ($request->has('payload')) {
            $this->check(is_string($request->input('payload')), 'ข้อมูลไม่ถูกต้อง');
            try {
                $body = json_decode($request->input('payload'), true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException $error) {
                throw new ApiError('ข้อมูลไม่ถูกต้อง');
            }
            $this->check(is_array($body) && ! array_is_list($body), 'ข้อมูลไม่ถูกต้อง');
        }

        if ($path === '/demo' && $method === 'GET') {
            return ['body' => ['tenants' => $this->data['tenants'], 'accounts' => array_map($this->safe(...), $this->data['users'])]];
        }
        if ($path === '/auth/login' && $method === 'POST') {
            $user = $this->first('users', fn ($u) => $u['id'] === ($body['userId'] ?? null));
            $this->check($user && is_string($body['pin'] ?? null) && Hash::check($body['pin'], $user['pinHash']), 'บัญชีหรือ PIN ไม่ถูกต้อง', 401);
            $token = bin2hex(random_bytes(24));
            AuthToken::create(['id' => hash('sha256', $token), 'employee_id' => $user['id'], 'expires_at' => now()->addHours(12)]);

            return ['body' => ['token' => $token, 'user' => $this->safe($user)]];
        }
        if (preg_match('#^/guest/([^/]+)(/orders|/calls)?$#D', $path, $match)) {
            $this->check(($method === 'GET' && empty($match[2])) || ($method === 'POST' && ! empty($match[2])), 'ไม่พบ API', 404);
            if (($match[2] ?? '') === '/calls') {
                return $this->guestCall($match[1], $body);
            }

            return $this->guest($match[1], $method === 'POST', $body);
        }
        if (str_starts_with($path, '/guest/')) {
            throw new ApiError('ไม่พบช่องทางสั่งอาหาร', 404);
        }
        $hash = hash('sha256', $request->bearerToken() ?? '');
        $token = AuthToken::whereKey($hash)->where('expires_at', '>', now())->first();
        $user = $token ? $this->first('users', fn ($u) => $u['id'] === $token->employee_id) : null;
        $this->check($user, 'กรุณาเข้าสู่ระบบ', 401);
        $this->user = $user;
        if ($path === '/auth/logout' && $method === 'POST') {
            $token->delete();

            return ['body' => ['ok' => true]];
        }
        if ($method === 'GET' && preg_match('#^/audit/([^/]+)$#D', $path, $match)) {
            $this->allowed('audit');

            return ['body' => $this->record('audit', fn ($entry) => $entry['id'] === $match[1] && $this->scope($entry))];
        }
        if ($path === '/state' && $method === 'GET') {
            return ['body' => $this->state($request)];
        }
        if ($path === '/categories' && $method === 'GET') {
            return ['body' => $this->categories($user['tenantId'])];
        }
        if ($path === '/categories' || preg_match('#^/categories/[^/]+$#D', $path)) {
            return $this->manageCategory($path === '/categories' ? null : substr($path, 12), $method, $body);
        }
        if ($path === '/menu-items' && $method === 'GET') {
            return ['body' => $this->catalog($user['tenantId'])];
        }
        if ($path === '/branches' && $method === 'GET') {
            return ['body' => array_map($this->publicBranch(...), $this->list('branches', fn ($b) => $this->scope([...$b, 'branchId' => $b['id']])))];
        }
        if (preg_match('#^/branches/([^/]+)/payment-qr$#D', $path, $match)) {
            return ['body' => $this->paymentQr($match[1], $method, $body, $request->file('image'))];
        }
        if ($path === '/branches' || preg_match('#^/branches/[^/]+$#D', $path)) {
            return $this->manageBranch($path === '/branches' ? null : substr($path, 10), $method, $body);
        }
        if ($path === '/orders' && $method === 'POST') {
            return ['status' => 201, 'body' => $this->createOrder($body)];
        }
        if (preg_match('#^/orders/([^/]+)(?:/(.*))?$#D', $path, $m)) {
            return ['body' => $this->orderAction($m[1], $m[2] ?? '', $method, $body)];
        }
        if ($path === '/tables' && $method === 'POST') {
            return $this->createTable($body);
        }
        if (preg_match('#^/tables/([^/]+)$#D', $path, $m) && $method === 'DELETE') {
            return ['body' => $this->deleteTable($m[1])];
        }
        if (preg_match('#^/tables/([^/]+)$#D', $path, $m) && $method === 'PATCH') {
            return ['body' => $this->editTable($m[1], $body)];
        }
        if (preg_match('#^/tables/([^/]+)/(session|reservation)$#D', $path, $m)) {
            return ['body' => $this->tableAction($m[1], $m[2], $method, $body)];
        }
        if (preg_match('#^/table-sessions/([^/]+)/calls/([^/]+)/resolve$#D', $path, $m) && $method === 'POST') {
            $this->allowed('tables');
            $this->feature();
            $session = &$this->record('tableSessions', fn ($s) => $s['id'] === $m[1] && $this->scope($s));
            $index = array_search($m[2], array_column($session['calls'] ?? [], 'id'), true);
            $this->check($index !== false, 'ไม่พบการเรียกนี้', 404);
            if ($session['calls'][$index]['status'] === 'open') {
                $session['calls'][$index] = [...$session['calls'][$index], 'status' => 'done', 'doneAt' => $this->now(), 'doneBy' => $this->user['id']];
                $this->dirty = true;
            }

            return ['body' => ['ok' => true]];
        }
        if (preg_match('#^/table-sessions/([^/]+)/close$#D', $path, $m) && $method === 'POST') {
            $this->allowed('tables');
            $this->feature();
            $session = &$this->record('tableSessions', fn ($s) => $s['id'] === $m[1] && $this->scope($s));
            foreach ($session['orderIds'] as $id) {
                $this->check(! OrderFlow::serviceOpen($this->first('orders', fn ($o) => $o['id'] === $id) ?? ['status' => 'cancelled']), 'ยังมีบิลค้างหรืออาหารที่ยังเสิร์ฟไม่ครบ กรุณาดำเนินการก่อนปิดรอบ', 409);
            }
            $this->closeSession($session, 'พนักงานปิดรอบบริการแล้ว กรุณาขอ QR ใหม่');
            $this->audit('ปิด QR สั่งอาหาร', $session['tableId'], $session['branchId']);

            return ['body' => ['ok' => true]];
        }
        if ($path === '/menu-items' && $method === 'POST') {
            return $this->createMenu($body, $request->file('image'));
        }
        if (preg_match('#^/menu-items/([^/]+)$#D', $path, $m)) {
            if ($method === 'PATCH') {
                return ['body' => $this->editMenu($m[1], $body, $request->file('image'))];
            }
            if ($method === 'DELETE') {
                return ['body' => $this->deleteMenu($m[1])];
            }
        }
        if ($path === '/users' || preg_match('#^/users/[^/]+$#D', $path)) {
            return $this->staff($path === '/users' ? null : substr($path, 7), $method, $body);
        }

        if ($path === '/roles' || preg_match('#^/roles/[^/]+$#D', $path)) {
            return $this->roles($path === '/roles' ? null : substr($path, 7), $method, $body);
        }

        return ['body' => $this->management($path, $method, $body, $request)];
    }

    private function state(Request $request): array
    {
        $plan = $this->plan();
        $urls = config('pos.customer_base_url') ? [rtrim(config('pos.customer_base_url'), '/')] : [$request->getSchemeAndHttpHost()];

        return [...$this->roleState(), 'user' => $this->safe($this->user), 'customerBaseUrls' => $urls, 'tableSessions' => $plan === 'Small' || ! $this->can('tables') ? [] : array_map($this->summary(...), $this->list('tableSessions', fn ($s) => $this->scope($s) && $this->active($s))), 'tenant' => $this->first('tenants', fn ($t) => $t['id'] === $this->user['tenantId']), 'branches' => array_map($this->publicBranch(...), $this->list('branches', fn ($b) => $this->scope([...$b, 'branchId' => $b['id']]))), 'archivedTables' => $this->list('tables', fn ($table) => ! empty($table['deleted']) && $this->scope([...$table, 'deleted' => false])), 'categories' => $this->categories($this->user['tenantId']), 'menu' => $this->catalog($this->user['tenantId']), 'orders' => $this->list('orders', fn ($o) => $this->scope($o) && ($this->can('reports') || ! in_array($o['status'], ['paid', 'refunded'], true) || ($o['status'] === 'paid' && OrderFlow::needsService($o) && ($this->can('kitchen') || $this->can('tables') || $this->can('serve'))))), 'tables' => $plan === 'Small' ? [] : $this->list('tables', $this->scope(...)), 'ingredients' => $this->can('inventory') && $plan !== 'Small' ? $this->list('ingredients', $this->scope(...)) : [], 'users' => $this->can('staff') ? array_map($this->safe(...), $this->list('users', $this->scope(...))) : [], 'audit' => $this->can('audit') ? array_map(fn ($entry) => array_diff_key($entry, ['changes' => true]), $this->list('audit', $this->scope(...))) : [], 'transfers' => $plan === 'Enterprise' && $this->can('hq') ? $this->list('transfers', fn ($t) => $t['tenantId'] === $this->user['tenantId']) : [], 'shifts' => $this->list('shifts', $this->scope(...)), 'recipes' => $this->can('inventory') ? $this->data['recipes'] : [], 'settings' => $this->first('settings', fn ($s) => $s['tenantId'] === $this->user['tenantId']), 'permissions' => array_values(array_filter(array_keys(self::PERMISSIONS), $this->can(...)))];
    }
}
