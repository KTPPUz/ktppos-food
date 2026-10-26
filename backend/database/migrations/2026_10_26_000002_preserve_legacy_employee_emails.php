<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Preserve duplicate cashier/waiter emails from the original demo.
        // New/edited emails are checked under the transaction's state row lock.
        Schema::table('employees', function (Blueprint $table): void {
            $table->dropUnique(['tenant_id', 'email']);
            $table->index(['tenant_id', 'email']);
        });
    }

    public function down(): void
    {
        // Do not recreate uniqueness: valid imported rows may still duplicate.
    }
};
