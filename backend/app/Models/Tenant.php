<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

final class Tenant extends PosRecord
{
    protected $table = 'tenants';

    public function roles(): HasMany
    {
        return $this->hasMany(RoleDefinition::class, 'tenant_id');
    }

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class, 'tenant_id');
    }
}
