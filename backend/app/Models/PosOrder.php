<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

final class PosOrder extends PosRecord
{
    protected $table = 'pos_orders';

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'parent_id')->orderBy('position');
    }

    public function batches(): HasMany
    {
        return $this->hasMany(KitchenBatch::class, 'parent_id')->orderBy('position');
    }
}
