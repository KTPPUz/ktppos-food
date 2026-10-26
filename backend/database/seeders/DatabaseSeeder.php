<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use RuntimeException;

final class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (Artisan::call('pos:seed') !== 0) {
            throw new RuntimeException(trim(Artisan::output()));
        }
    }
}
