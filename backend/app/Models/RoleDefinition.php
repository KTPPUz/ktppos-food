<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class RoleDefinition extends PosRecord
{
    protected $table = 'roles';

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
