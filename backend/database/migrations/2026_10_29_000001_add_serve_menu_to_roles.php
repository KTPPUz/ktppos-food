<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Roles that manage tables could already serve food; give them the serving page too.
        foreach (DB::table('roles')->get() as $role) {
            $payload = json_decode($role->payload, true, 512, JSON_THROW_ON_ERROR);
            if (in_array('tables', $payload['menus'] ?? [], true) && ! in_array('serve', $payload['menus'], true)) {
                $payload['menus'][] = 'serve';
                DB::table('roles')->where('id', $role->id)->update(['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
            }
        }
    }

    public function down(): void
    {
        foreach (DB::table('roles')->get() as $role) {
            $payload = json_decode($role->payload, true, 512, JSON_THROW_ON_ERROR);
            $payload['menus'] = array_values(array_diff($payload['menus'] ?? [], ['serve']));
            DB::table('roles')->where('id', $role->id)->update(['payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
        }
    }
};
