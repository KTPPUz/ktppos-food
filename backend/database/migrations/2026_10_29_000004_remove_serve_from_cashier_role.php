<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Cashiers take payment; serving is handled by waiters and the kitchen.
        foreach (DB::table('roles')->where('role_key', 'Cashier')->get() as $role) {
            $payload = json_decode($role->payload, true, 512, JSON_THROW_ON_ERROR);
            foreach (['menus', 'permissions'] as $field) {
                $payload[$field] = array_values(array_diff($payload[$field] ?? [], ['serve']));
            }
            DB::table('roles')->where('id', $role->id)->update(['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
        }
    }

    public function down(): void
    {
        foreach (DB::table('roles')->where('role_key', 'Cashier')->get() as $role) {
            $payload = json_decode($role->payload, true, 512, JSON_THROW_ON_ERROR);
            foreach (['menus', 'permissions'] as $field) {
                if (! in_array('serve', $payload[$field] ?? [], true)) {
                    $payload[$field][] = 'serve';
                }
            }
            DB::table('roles')->where('id', $role->id)->update(['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
        }
    }
};
