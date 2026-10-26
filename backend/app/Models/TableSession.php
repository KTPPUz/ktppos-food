<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

final class TableSession extends PosRecord
{
    protected $table = 'table_sessions';

    protected $casts = ['payload' => 'encrypted:array'];

    public function submissions(): HasMany
    {
        return $this->hasMany(GuestSubmission::class, 'parent_id')->orderBy('position');
    }
}
