<?php

declare(strict_types=1);

use App\Services\RoleCatalog;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table): void {
            $table->string('id', 100)->primary();
            $table->string('tenant_id', 100);
            $table->foreign('tenant_id')->references('id')->on('tenants');
            $table->string('role_key', 100);
            $table->unique(['tenant_id', 'role_key']);
            $table->string('name', 100);
            $table->unsignedInteger('position');
            $table->json('payload');
        });
        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            foreach (RoleCatalog::defaults($tenantId) as $position => $role) {
                DB::table('roles')->insert(['id' => $role['id'], 'tenant_id' => $tenantId, 'role_key' => $role['key'], 'name' => $role['name'], 'position' => $position, 'payload' => json_encode($role, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
