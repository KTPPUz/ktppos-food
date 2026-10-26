<?php

declare(strict_types=1);

namespace App\Models;

final class AuthToken extends PosRecord
{
    protected $table = 'auth_tokens';

    protected $hidden = ['id'];
}
