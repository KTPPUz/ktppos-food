<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class DiningTable extends PosRecord
{
    protected $table = 'dining_tables';

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
