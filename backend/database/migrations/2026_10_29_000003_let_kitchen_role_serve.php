<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Kitchen staff hand over takeaway food themselves, so the default kitchen role may serve.
        foreach (DB::table('roles')->where('role_key', 'Kitchen')->get() as $role) {
            $payload = json_decode($role->payload, true, 512, JSON_THROW_ON_ERROR);
            foreach (['menus', 'permissions'] as $field) {
                if (! in_array('serve', $payload[$field] ?? [], true)) {
                    $payload[$field][] = 'serve';
                }
            }
            DB::table('roles')->where('id', $role->id)->update(['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
        }
    }

    public function down(): void
    {
        foreach (DB::table('roles')->where('role_key', 'Kitchen')->get() as $role) {
            $payload = json_decode($role->payload, true, 512, JSON_THROW_ON_ERROR);
            foreach (['menus', 'permissions'] as $field) {
                $payload[$field] = array_values(array_diff($payload[$field] ?? [], ['serve']));
            }
            DB::table('roles')->where('id', $role->id)->update(['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
        }
    }
};
