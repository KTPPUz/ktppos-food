<?php

declare(strict_types=1);

namespace App\Services;

trait OrderActions
{
    private function createOrder(array $body): array
    {
        $this->allowed('pos');
        $this->check(is_string($body['branchId'] ?? null), 'กรุณาระบุสาขา');
        $branch = $this->branch($body['branchId']);
        $this->check($this->first('shifts', fn ($s) => $s['branchId'] === $branch['id'])['open'] ?? false, 'กรุณาเปิดกะก่อนรับออเดอร์', 409);
        $this->check(in_array($body['type'] ?? null, ['dinein', 'takeaway', 'delivery'], true), 'ประเภทออเดอร์ไม่ถูกต้อง');
        if (! empty($body['tableId'])) {
            $this->feature();
            $this->check($body['type'] === 'dinein', 'เลือกโต๊ะได้เฉพาะทานที่ร้าน');
            $this->check($this->first('tables', fn ($t) => $t['id'] === $body['tableId'] && $t['branchId'] === $branch['id']), 'โต๊ะไม่อยู่ในสาขานี้');
            $this->tableFree($body['tableId']);
        }
        $settings = $this->first('settings', fn ($s) => $s['tenantId'] === $this->user['tenantId']);
        $items = $this->parseItems($this->user['tenantId'], $branch['id'], $body['items'] ?? null);
        $order = ['id' => $this->uid(), 'number' => $this->data['nextOrder']++, 'tenantId' => $this->user['tenantId'], 'branchId' => $branch['id'], 'type' => $body['type'], 'tableId' => $body['tableId'] ?? null, 'items' => $items, 'status' => 'draft', 'discount' => 0, 'taxRate' => $settings['taxRate'], 'serviceRate' => $settings['serviceRate'], 'createdAt' => $this->now(), 'createdBy' => $this->user['id']];
        $session = $this->sessionForTable($order['tableId']);
        if ($session) {
            $this->check($session['acceptingOrders'], 'โต๊ะนี้กำลังแยกหรือชำระบิล กรุณาปิดรอบเดิมก่อน', 409);
            $target = &$this->record('tableSessions', fn ($s) => $s['id'] === $session['id']);
            $target['orderIds'][] = $order['id'];
            $order['serviceSessionId'] = $session['id'];
        }
        $this->data['orders'][] = $order;
        $this->audit('สร้างออเดอร์', '#'.$order['number'], $branch['id']);

        return [...$order, 'totals' => $this->totals($order)];
    }

    private function orderAction(string $id, string $action, string $method, array $body): array
    {
        $order = &$this->order($id);
        if ($action === 'refund' && $method === 'POST') {
            return $this->refund($order, $body);
        }
        $paidServiceUpdate = $order['status'] === 'paid' && OrderFlow::needsService($order)
            && $method === 'PATCH'
            && (($action === 'status' && ($body['status'] ?? '') !== 'cancelled') || preg_match('#^kitchen-batches/[^/]+/status$#D', $action));
        if (! $paidServiceUpdate) {
            $this->open($order);
        }
        if ($action === 'items' && $method === 'POST') {
            $this->allowed('pos');
            $items = $this->parseItems($this->user['tenantId'], $order['branchId'], $body['items'] ?? null);
            if (! empty($order['kitchenBatches'])) {
                $this->addBatch($order, $items, 'staff');
            } else {
                $order['items'] = [...$order['items'], ...$items];
                if (in_array($order['status'], ['ready', 'served'], true)) {
                    $order['status'] = 'pending';
                }
            }
            $this->audit('เพิ่มรายการ', '#'.$order['number'], $order['branchId']);
        } elseif (preg_match('#^items/([^/]+)/cancel$#D', $action, $m) && $method === 'POST') {
            $this->allowed('refund');
            $items = array_values(array_filter($order['items'], fn ($i) => $i['id'] === $m[1]));
            $this->check($items, 'ไม่พบรายการ', 404);
            $this->check(count($order['items']) > 1, 'รายการสุดท้าย กรุณายกเลิกทั้งบิล');
            $this->reason($body);
            $order['cancelledItems'][] = [...$items[0], 'reason' => $body['reason'], 'userId' => $this->user['id'], 'at' => $this->now()];
            $order['items'] = array_values(array_filter($order['items'], fn ($i) => $i['id'] !== $m[1]));
            $order['discount'] = min($order['discount'], $this->totals([...$order, 'discount' => 0])['subtotal']);
            if ($order['status'] !== 'draft') {
                $order['status'] = 'pending';
            }
            foreach ($order['kitchenBatches'] ?? [] as $key => $batch) {
                if ($batch['id'] === ($items[0]['batchId'] ?? null) && ! array_filter($order['items'], fn ($i) => ($i['batchId'] ?? null) === $batch['id'])) {
                    $order['kitchenBatches'][$key]['status'] = 'cancelled';
                }
            }
            $this->syncBatches($order);
            $this->audit('ยกเลิกรายการ', '#'.$order['number'].' · '.$items[0]['name'].' · '.$body['reason'], $order['branchId']);
        } elseif ($action === 'discount' && $method === 'POST') {
            $this->allowed('refund');
            $amount = $this->number($body['amount'] ?? null);
            $this->check($amount >= 0 && $amount <= $this->totals([...$order, 'discount' => 0])['subtotal'], 'ส่วนลดไม่ถูกต้อง');
            $order['discount'] = $amount;
            $this->audit('ให้ส่วนลด', '#'.$order['number'].' · ฿'.$amount, $order['branchId']);
        } elseif ($action === 'status' && $method === 'PATCH') {
            $status = $body['status'] ?? '';
            $previousKitchenStatus = OrderFlow::kitchenStatus($order);
            if ($status === 'cancelled') {
                $this->allowed('refund');
                $this->reason($body);
                $order['cancelReason'] = $body['reason'];
                $order['cancelledBy'] = $this->user['id'];
                $order['cancelledAt'] = $this->now();
            } else {
                $this->feature();
                $this->check((['draft' => 'pending', 'pending' => 'cooking', 'cooking' => 'ready', 'ready' => 'served'][OrderFlow::kitchenStatus($order)] ?? null) === $status, 'เปลี่ยนสถานะตามลำดับเท่านั้น', 409);
                $this->allowed($status === 'pending' ? 'pos' : ($status === 'served' ? 'tables' : 'kitchen'));
            }
            if ($order['status'] === 'paid') {
                $order['kitchenStatus'] = $status;
            } else {
                $order['status'] = $status;
            }
            if ($status === 'cancelled') {
                $this->onClosed($order);
            } elseif (! empty($order['kitchenBatches'])) {
                foreach ($order['kitchenBatches'] as &$batch) {
                    if (! in_array($batch['status'], ['served', 'cancelled'], true) && ($order['status'] !== 'paid' || $batch['status'] === $previousKitchenStatus)) {
                        $batch['status'] = $status;
                        foreach ($order['items'] as &$item) {
                            if (in_array($item['id'], $batch['itemIds'], true)) {
                                $item['status'] = $status;
                            }
                        }
                        unset($item);
                    }
                }
                unset($batch);
                $this->syncBatches($order);
            } else {
                foreach ($order['items'] as &$item) {
                    $item['status'] = $status;
                }
                unset($item);
            }
            $this->audit($status === 'cancelled' ? 'ยกเลิกออเดอร์' : 'สถานะครัว', '#'.$order['number'].' → '.$status.(! empty($body['reason']) ? ' · '.$body['reason'] : ''), $order['branchId']);
        } elseif (preg_match('#^kitchen-batches/([^/]+)/status$#D', $action, $m) && $method === 'PATCH') {
            $this->feature();
            $found = false;
            foreach ($order['kitchenBatches'] ?? [] as $index => $batch) {
                if ($batch['id'] !== $m[1]) {
                    continue;
                }
                $found = true;
                $next = ['pending' => 'cooking', 'cooking' => 'ready', 'ready' => 'served'][$batch['status']] ?? null;
                $this->check($next !== null && $next === ($body['status'] ?? null), 'สถานะรอบครัวไม่ถูกต้อง', 409);
                $this->allowed($next === 'served' ? 'tables' : 'kitchen');
                $order['kitchenBatches'][$index]['status'] = $next;
                foreach ($order['items'] as &$item) {
                    if (in_array($item['id'], $batch['itemIds'], true)) {
                        $item['status'] = $next;
                    }
                }
                unset($item);
                $this->audit('สถานะรอบครัว', '#'.$order['number'].' · รอบ '.$batch['round'].' → '.$next, $order['branchId']);
            }
            $this->check($found, 'ไม่พบรอบครัว', 404);
            $this->syncBatches($order);
        } elseif ($action === 'payments' && $method === 'POST') {
            return $this->pay($order, $body);
        } elseif ($action === 'move' && $method === 'POST') {
            $this->allowed('tables');
            $this->feature();
            $tableId = $body['tableId'] ?? '';
            $this->check(is_string($tableId) && $tableId !== $order['tableId'], 'กรุณาเลือกโต๊ะใหม่');
            $this->check($this->first('tables', fn ($t) => $t['id'] === $tableId && $t['branchId'] === $order['branchId']), 'โต๊ะต้องอยู่ในสาขาเดียวกัน');
            $this->tableFree($tableId, $order['id']);
            $this->check(! $this->sessionForTable($tableId), 'โต๊ะปลายทางมีรอบ QR เปิดอยู่ กรุณาปิดรอบก่อน', 409);
            $this->revokeForOrder($order, 'มีการย้ายโต๊ะ กรุณาขอ QR ของโต๊ะใหม่จากพนักงาน');
            $order['tableId'] = $tableId;
            $this->audit('ย้ายโต๊ะ', '#'.$order['number'].' → '.$tableId, $order['branchId']);
        } elseif ($action === 'merge' && $method === 'POST') {
            $this->allowed('tables');
            $this->feature();
            $this->check(is_string($body['targetId'] ?? null), 'กรุณาเลือกบิล');
            $target = &$this->order($body['targetId']);
            $this->open($target);
            $this->check($order['id'] !== $target['id'] && $order['branchId'] === $target['branchId'], 'ต้องเป็นบิลคนละใบในสาขาเดียวกัน');
            $this->check($order['taxRate'] == $target['taxRate'] && $order['serviceRate'] == $target['serviceRate'], 'อัตราภาษีและบริการต้องตรงกัน');
            $expected = $this->money($this->totals($target)['total'] + $this->totals($order)['total']);
            if (! empty($target['kitchenBatches']) || ! empty($order['kitchenBatches'])) {
                $this->ensureBatches($target);
                $this->ensureBatches($order);
                $offset = count($target['kitchenBatches']);
                foreach ($order['kitchenBatches'] as $batch) {
                    $target['kitchenBatches'][] = [...$batch, 'round' => $offset + $batch['round']];
                }
            }
            $target['items'] = [...$target['items'], ...$order['items']];
            $target['discount'] = $this->money($target['discount'] + $order['discount']);
            $target['roundingAdjustment'] = 0;
            $target['roundingAdjustment'] = $this->money($expected - $this->totals($target)['total']);
            $target['status'] = 'pending';
            $order['status'] = 'merged';
            $order['mergedInto'] = $target['id'];
            $this->revokeForOrder($order, 'บิลนี้ถูกรวมแล้ว กรุณาติดต่อพนักงาน');
            $this->syncBatches($target);
            $this->audit('รวมบิล', '#'.$order['number'].' → #'.$target['number'], $order['branchId']);

            return $target;
        } elseif ($action === 'split' && $method === 'POST') {
            return $this->split($order, $body);
        } else {
            throw new ApiError('ไม่พบ API', 404);
        }

        if ($order['status'] === 'paid') {
            $this->onClosed($order);
        }

        return $order;
    }

    private function number(mixed $value): float
    {
        $this->check((is_numeric($value) || is_int($value) || is_float($value)) && is_finite((float) $value), 'จำนวนไม่ถูกต้อง');

        return (float) $value;
    }

    private function reason(array $body): void
    {
        $this->check(is_string($body['reason'] ?? null) && mb_strlen(trim($body['reason'])) >= 3, 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร');
    }

    private function pay(array &$order, array $body): array
    {
        $this->allowed('pay');
        $this->check(in_array($body['method'] ?? null, ['cash', 'qr', 'card'], true), 'วิธีชำระเงินไม่ถูกต้อง');
        if ($body['method'] === 'qr') {
            $config = $this->branch($order['branchId'])['paymentQr'] ?? [];
            $this->check(! empty($config['enabled']) && ! empty($config['image']), 'สาขานี้ยังไม่ได้เปิดใช้ QR รับชำระเงิน', 409);
            $this->check(($body['verified'] ?? false) === true, 'กรุณาตรวจสอบเงินเข้าบัญชีและยืนยันก่อนรับชำระ');
            $this->check(is_string($body['qrVersion'] ?? null) && $body['qrVersion'] === ($config['version'] ?? null), 'ข้อมูล QR มีการเปลี่ยนแปลง กรุณารีเฟรชและตรวจสอบบัญชีอีกครั้ง', 409);
        }
        $sum = $this->totals($order);
        $received = $body['method'] === 'cash' ? $this->number($body['received'] ?? null) : $sum['total'];
        $this->check($received >= $sum['total'], 'เงินสดที่รับไม่เพียงพอ');
        $reductions = [];
        if ($this->plan() === 'Enterprise') {
            foreach ($order['items'] as $item) {
                $recipe = $this->first('recipes', fn ($r) => $r['menuId'] === $item['menuId']);
                foreach ($recipe['parts'] ?? [] as $part) {
                    $id = $order['branchId'].'-i'.$part['index'];
                    if ($this->first('ingredients', fn ($i) => $i['id'] === $id)) {
                        $reductions[$id] = ($reductions[$id] ?? 0) + $part['qty'] * $item['qty'];
                    }
                }
            }
        }
        foreach ($reductions as $id => $qty) {
            $ingredient = &$this->record('ingredients', fn ($i) => $i['id'] === $id);
            $this->check($ingredient['stock'] >= $qty, 'วัตถุดิบ '.$ingredient['name'].' ไม่เพียงพอ', 409);
            $ingredient['stock'] = $this->money($ingredient['stock'] - $qty);
            $this->data['movements'][] = ['id' => $this->uid(), 'tenantId' => $this->user['tenantId'], 'branchId' => $order['branchId'], 'ingredientId' => $id, 'qty' => -$qty, 'reason' => 'ขาย #'.$order['number'], 'userId' => $this->user['id'], 'at' => $this->now()];
        }
        // Payment settles the bill; kitchen work continues independently.
        $order['kitchenStatus'] = $this->plan() === 'Small' ? 'served' : ($order['status'] === 'draft' ? 'pending' : $order['status']);
        $order['status'] = 'paid';
        $order['totals'] = $sum;
        $order['paidAt'] = $this->now();
        $order['receipt'] = 'BT-'.$order['number'];
        $order['payment'] = ['method' => $body['method'], 'received' => $received, 'change' => $body['method'] === 'cash' ? $this->money($received - $sum['total']) : 0];
        if ($body['method'] === 'qr') {
            $order['payment'] = [...$order['payment'], 'verification' => 'manual', 'verifiedBy' => $this->user['id'], 'verifiedAt' => $this->now(), 'account' => array_intersect_key($config, array_flip(['bankName', 'accountName', 'accountNumber']))];
        }
        $this->onClosed($order);
        $this->audit($body['method'] === 'qr' ? 'รับโอนเงินผ่าน QR (ตรวจสอบเอง)' : 'ชำระเงินจำลอง', '#'.$order['number'].' · ฿'.$sum['total'].' · '.$body['method'], $order['branchId']);

        return $order;
    }

    private function refund(array &$order, array $body): array
    {
        $this->allowed('refund');
        $this->check($order['status'] === 'paid', 'คืนเงินได้เฉพาะบิลที่ชำระแล้ว', 409);
        $this->reason($body);
        $order['status'] = 'refunded';
        $order['refund'] = ['reason' => $body['reason'], 'userId' => $this->user['id'], 'at' => $this->now()];
        foreach ($this->list('movements', fn ($m) => $m['reason'] === 'ขาย #'.$order['number'] && $m['branchId'] === $order['branchId']) as $movement) {
            $ingredient = &$this->record('ingredients', fn ($i) => $i['id'] === $movement['ingredientId']);
            $ingredient['stock'] = $this->money($ingredient['stock'] - $movement['qty']);
            $this->data['movements'][] = [...$movement, 'id' => $this->uid(), 'qty' => -$movement['qty'], 'reason' => 'คืนเงิน #'.$order['number'], 'userId' => $this->user['id'], 'at' => $this->now()];
        }
        $this->onClosed($order);
        $this->audit('คืนเงินจำลอง', '#'.$order['number'].' · '.$body['reason'], $order['branchId']);

        return $order;
    }

    private function split(array &$order, array $body): array
    {
        $this->allowed('tables');
        $this->feature();
        $this->check(is_array($body['selected'] ?? null), 'เลือกรายการที่ต้องการแยก');
        $before = $this->totals($order);
        $moved = [];
        $remaining = [];
        foreach ($order['items'] as $item) {
            $qty = $body['selected'][$item['id']] ?? 0;
            $this->check(is_numeric($qty) && (float) $qty === (float) (int) $qty && $qty >= 0 && $qty <= $item['qty'], 'จำนวนแยกบิลไม่ถูกต้อง');
            if ($qty) {
                $moved[] = [...$item, 'qty' => (int) $qty];
            }
            if ($item['qty'] > $qty) {
                $remaining[] = [...$item, 'qty' => $item['qty'] - $qty];
            }
        }
        $this->check($moved && $remaining, 'ต้องเหลือรายการทั้งสองบิล');
        $child = [...$order, 'id' => $this->uid(), 'number' => $this->data['nextOrder']++, 'tableId' => null, 'items' => array_map(fn ($i) => [...$i, 'id' => $this->uid()], $moved), 'roundingAdjustment' => 0, 'createdAt' => $this->now(), 'createdBy' => $this->user['id']];
        $ratio = $before['subtotal'] ? $this->totals([...$child, 'discount' => 0])['subtotal'] / $before['subtotal'] : 0;
        $child['discount'] = $this->money($order['discount'] * $ratio);
        $order['items'] = $remaining;
        $order['discount'] = $this->money($order['discount'] - $child['discount']);
        $adjustment = $this->money($before['total'] - $this->money($this->totals($order)['total'] + $this->totals($child)['total']));
        if ($adjustment != 0) {
            $child['roundingAdjustment'] = $adjustment;
        }
        if (! empty($order['kitchenBatches'])) {
            $child['kitchenBatches'] = [];
            foreach ($order['kitchenBatches'] as $batch) {
                $newId = $this->uid();
                $ids = [];
                foreach ($child['items'] as &$item) {
                    if (($item['batchId'] ?? null) === $batch['id']) {
                        $item['batchId'] = $newId;
                        $ids[] = $item['id'];
                    }
                }
                unset($item);
                if ($ids) {
                    $child['kitchenBatches'][] = [...$batch, 'id' => $newId, 'itemIds' => $ids];
                }
            }
            $kept = [];
            foreach ($order['kitchenBatches'] as $batch) {
                $ids = array_column(array_filter($order['items'], fn ($i) => ($i['batchId'] ?? null) === $batch['id']), 'id');
                if ($ids) {
                    $kept[] = [...$batch, 'itemIds' => array_values($ids)];
                }
            }
            $order['kitchenBatches'] = $kept;
            $this->syncBatches($order);
            $this->syncBatches($child);
        }
        foreach ($this->data['tableSessions'] as &$session) {
            if ($session['status'] === 'active' && in_array($order['id'], $session['orderIds'], true)) {
                $session['orderIds'][] = $child['id'];
                $session['acceptingOrders'] = false;
                $child['serviceSessionId'] = $session['id'];
            }
        }
        $this->data['orders'][] = $child;
        $this->audit('แยกบิล', '#'.$order['number'].' → #'.$child['number'], $order['branchId']);

        return ['order' => $order, 'split' => $child];
    }

    private function tableAction(string $id, string $action, string $method, array $body): array
    {
        $this->allowed('tables');
        $this->feature();
        $table = &$this->record('tables', fn ($t) => $t['id'] === $id && $this->scope($t), 'ไม่พบโต๊ะ');
        if ($action === 'reservation' && $method === 'PATCH') {
            $reservation = $body['reservation'] ?? null;
            if ($reservation) {
                $this->check(is_array($reservation) && is_string($reservation['name'] ?? null) && trim($reservation['name']) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/D', $reservation['time'] ?? ''), 'กรุณาระบุชื่อและเวลาที่ถูกต้อง');
                $table['reservation'] = ['name' => mb_substr($reservation['name'], 0, 100), 'time' => $reservation['time']];
            } else {
                $table['reservation'] = null;
            }
            $this->audit('จัดการจองโต๊ะ', $table['name'], $table['branchId']);

            return $table;
        }
        $this->check($action === 'session' && $method === 'POST', 'ไม่พบ API', 404);
        $this->check($this->first('shifts', fn ($s) => $s['branchId'] === $table['branchId'])['open'] ?? false, 'กรุณาเปิดกะก่อนเปิด QR', 409);
        $session = $this->sessionForTable($id);
        if (! $session) {
            foreach ($this->data['tableSessions'] as &$old) {
                if ($old['tableId'] !== $id || $old['status'] !== 'active') {
                    continue;
                }
                if (! $old['acceptingOrders']) {
                    foreach ($old['orderIds'] as $orderId) {
                        $o = $this->first('orders', fn ($o) => $o['id'] === $orderId);
                        $this->check(! $o || ! OrderFlow::serviceOpen($o), 'กรุณาปิดบิลที่แยกไว้ให้ครบก่อนเปิด QR ใหม่', 409);
                    }
                }
                $this->closeSession($old, 'QR เดิมหมดอายุและถูกแทนที่แล้ว');
            }
            unset($old);
            $orders = $this->list('orders', fn ($o) => ($o['tableId'] ?? null) === $id && OrderFlow::serviceOpen($o));
            $session = ['id' => $this->uid(), 'token' => bin2hex(random_bytes(24)), 'tenantId' => $this->user['tenantId'], 'branchId' => $table['branchId'], 'tableId' => $id, 'status' => 'active', 'acceptingOrders' => ! array_filter($orders, fn ($o) => $o['status'] === 'paid'), 'orderIds' => array_column($orders, 'id'), 'submissions' => [], 'createdAt' => $this->now(), 'createdBy' => $this->user['id'], 'expiresAt' => now()->addHours(12)->utc()->format('Y-m-d\TH:i:s.v\Z')];
            foreach ($this->data['orders'] as &$order) {
                if (in_array($order['id'], $session['orderIds'], true)) {
                    $order['serviceSessionId'] = $session['id'];
                }
            }
            unset($order);
            $this->data['tableSessions'][] = $session;
            $this->audit('เปิด QR สั่งอาหาร', $table['name'].' · รอบ '.$session['id'], $table['branchId']);
        }

        return [...$this->summary($session), 'token' => $session['token']];
    }
}
