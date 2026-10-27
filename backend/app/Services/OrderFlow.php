<?php

declare(strict_types=1);

namespace App\Services;

final class OrderFlow
{
    public static function kitchenStatus(array $order): string
    {
        // Older paid receipts have no reliable outstanding kitchen work. Do not reopen them.
        return $order['status'] === 'paid' ? ($order['kitchenStatus'] ?? 'served') : $order['status'];
    }

    public static function needsService(array $order): bool
    {
        return in_array(self::kitchenStatus($order), ['pending', 'cooking', 'ready'], true);
    }

    public static function serviceOpen(array $order): bool
    {
        return ! in_array($order['status'], ['paid', 'refunded', 'cancelled', 'merged', 'split'], true)
            || ($order['status'] === 'paid' && self::needsService($order));
    }

    public static function isCooking(array $order): bool
    {
        return self::kitchenStatus($order) === 'cooking'
            || (bool) array_filter($order['kitchenBatches'] ?? [], fn ($batch) => $batch['status'] === 'cooking');
    }
}
