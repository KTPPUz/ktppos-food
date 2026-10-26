<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class Employee extends PosRecord
{
    protected $table = 'employees';

    protected $hidden = ['pin_hash'];

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
