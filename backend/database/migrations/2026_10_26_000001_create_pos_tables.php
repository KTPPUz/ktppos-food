<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $tables = ['tenants', 'branches', 'employees', 'menu_items', 'dining_tables', 'ingredients', 'recipes', 'shifts', 'tenant_settings', 'pos_orders', 'table_sessions', 'stock_movements', 'stock_transfers', 'audit_entries', 'menu_overrides'];

    public function up(): void
    {
        Schema::create('pos_counters', function (Blueprint $table): void {
            $table->string('id', 100)->primary();
            $table->unsignedInteger('value')->default(0);
            $table->boolean('initialized')->default(false);
        });
        DB::table('pos_counters')->insert(['id' => 'state', 'value' => 0, 'initialized' => false]);
        foreach ($this->tables as $name) {
            Schema::create($name, function (Blueprint $table) use ($name): void {
                $table->string('id', 100)->primary();
                $table->unsignedInteger('position')->default(0);
                if (! in_array($name, ['tenants', 'menu_items', 'recipes'])) {
                    $table->string('tenant_id', 100)->index();
                    $table->foreign('tenant_id')->references('id')->on('tenants');
                }
                if (in_array($name, ['employees', 'dining_tables', 'ingredients', 'shifts', 'pos_orders', 'table_sessions', 'stock_movements', 'stock_transfers', 'audit_entries'])) {
                    $table->string('branch_id', 100)->index();
                    $table->foreign('branch_id')->references('id')->on('branches');
                }
                if ($name === 'employees') {
                    $table->string('email', 254);
                    $table->string('pin_hash');
                    $table->unique(['tenant_id', 'email']);
                }
                if (in_array($name, ['dining_tables', 'pos_orders', 'table_sessions'])) {
                    if ($name !== 'dining_tables') {
                        $table->string('table_id', 100)->nullable();
                        $table->foreign('table_id')->references('id')->on('dining_tables');
                        $table->string('status', 30)->index();
                    }
                }
                if ($name === 'pos_orders') {
                    $table->unsignedInteger('number')->unique();
                    $table->boolean('has_batches')->default(false);
                }
                if ($name === 'table_sessions') {
                    $table->string('token_hash', 64)->unique();
                    $table->dateTime('expires_at');
                    $table->longText('payload'); // Encrypted QR capabilities and history.
                } else {
                    $table->json('payload');
                }
            });
        }
        foreach (['order_items', 'kitchen_batches', 'guest_submissions'] as $name) {
            Schema::create($name, function (Blueprint $table) use ($name): void {
                $table->string('id', 64)->primary();
                $table->string('parent_id', 100);
                $table->foreign('parent_id')->references('id')->on($name === 'guest_submissions' ? 'table_sessions' : 'pos_orders')->cascadeOnDelete();
                $table->string('record_key', 100);
                $table->unique(['parent_id', 'record_key']);
                $table->unsignedInteger('position');
                $table->json('payload');
            });
        }
        Schema::create('auth_tokens', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->string('employee_id', 100);
            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
            $table->dateTime('expires_at')->index();
        });
    }

    public function down(): void
    {
        foreach (['auth_tokens', 'guest_submissions', 'kitchen_batches', 'order_items', ...array_reverse($this->tables), 'pos_counters'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
