<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\PosOrder;
use App\Models\PosRecord;
use App\Models\RoleDefinition;
use App\Models\TableSession;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

final class PosRepository
{
    public const TABLES = [
        'tenants' => 'tenants', 'roles' => 'roles', 'branches' => 'branches', 'users' => 'employees',
        'menu' => 'menu_items', 'tables' => 'dining_tables', 'ingredients' => 'ingredients',
        'recipes' => 'recipes', 'shifts' => 'shifts', 'settings' => 'tenant_settings',
        'orders' => 'pos_orders', 'tableSessions' => 'table_sessions',
        'movements' => 'stock_movements', 'transfers' => 'stock_transfers', 'audit' => 'audit_entries',
    ];

    private function model(string $table): PosRecord
    {
        return match ($table) {
            'branches' => new Branch,
            'employees' => new Employee,
            'roles' => new RoleDefinition,
            'pos_orders' => new PosOrder,
            'table_sessions' => new TableSession,
            default => (new PosRecord)->setTable($table),
        };
    }

    public function load(): array
    {
        $counter = DB::table('pos_counters')->where('id', 'state')->first();
        if (! $counter?->initialized) {
            throw new RuntimeException('Database is empty. Run php artisan pos:import or pos:seed.');
        }
        $data = ['nextOrder' => $counter->value, 'menuCustom' => []];
        foreach (self::TABLES as $key => $table) {
            $query = $this->model($table)->newQuery()->orderBy('position');
            if ($key === 'orders') {
                $query->with(['items', 'batches']);
            }
            if ($key === 'tableSessions') {
                $query->with('submissions');
            }
            $data[$key] = $query->get()->map(function (PosRecord $record) use ($key): array {
                $payload = $record->payload;
                if ($key === 'users') {
                    $payload['pinHash'] = $record->pin_hash;
                }
                if ($key === 'orders') {
                    $payload['items'] = $record->items->pluck('payload')->all();
                    if ($record->has_batches) {
                        $payload['kitchenBatches'] = $record->batches->pluck('payload')->all();
                    }
                }
                if ($key === 'tableSessions') {
                    $payload['submissions'] = $record->submissions->pluck('payload')->all();
                }

                return $payload;
            })->all();
        }
        foreach ($this->model('menu_overrides')->newQuery()->get() as $record) {
            $data['menuCustom'][$record->tenant_id][$record->payload['menuId']] = $record->payload['custom'];
        }

        return $data;
    }

    private function encode(array $data): array
    {
        $rows = array_fill_keys([...array_values(self::TABLES), 'menu_overrides', 'order_items', 'kitchen_batches', 'guest_submissions'], []);
        foreach (self::TABLES as $key => $table) {
            foreach ($data[$key] ?? [] as $position => $payload) {
                $id = $payload['id'] ?? $payload['menuId'] ?? $payload['tenantId'];
                $row = ['id' => $id, 'position' => $position];
                if ($key === 'roles') {
                    $row['role_key'] = $payload['key'];
                    $row['name'] = $payload['name'];
                }
                if (isset($payload['tenantId']) && $key !== 'menu') {
                    $row['tenant_id'] = $payload['tenantId'];
                }
                if (isset($payload['branchId'])) {
                    $row['branch_id'] = $payload['branchId'];
                }
                if ($key === 'users') {
                    $row['email'] = mb_strtolower($payload['email']);
                    $row['pin_hash'] = $payload['pinHash'];
                    unset($payload['pinHash'], $payload['pin']);
                }
                if ($key === 'orders' || $key === 'tableSessions') {
                    $row['table_id'] = $payload['tableId'] ?? null;
                    $row['status'] = $payload['status'];
                }
                if ($key === 'orders') {
                    $row['number'] = $payload['number'];
                    $row['has_batches'] = isset($payload['kitchenBatches']);
                    foreach (['items' => 'order_items', 'kitchenBatches' => 'kitchen_batches'] as $field => $childTable) {
                        foreach ($payload[$field] ?? [] as $i => $child) {
                            $childId = hash('sha256', $id.':'.$child['id']);
                            $rows[$childTable][$childId] = ['id' => $childId, 'parent_id' => $id, 'record_key' => $child['id'], 'position' => $i, 'payload' => $child];
                        }
                        unset($payload[$field]);
                    }
                }
                if ($key === 'tableSessions') {
                    $row['token_hash'] = hash('sha256', $payload['token']);
                    $row['expires_at'] = date('Y-m-d H:i:s', strtotime($payload['expiresAt']));
                    foreach ($payload['submissions'] ?? [] as $i => $child) {
                        $childId = hash('sha256', $id.':'.$child['key']);
                        $rows['guest_submissions'][$childId] = ['id' => $childId, 'parent_id' => $id, 'record_key' => $child['key'], 'position' => $i, 'payload' => $child];
                    }
                    unset($payload['submissions']);
                }
                $rows[$table][$id] = [...$row, 'payload' => $payload];
            }
        }
        foreach ($data['menuCustom'] ?? [] as $tenantId => $overrides) {
            foreach ($overrides as $menuId => $custom) {
                $id = $tenantId.':'.$menuId;
                $rows['menu_overrides'][$id] = ['id' => $id, 'tenant_id' => $tenantId, 'position' => 0, 'payload' => compact('menuId', 'custom')];
            }
        }

        return $rows;
    }

    public function save(?array $before, array $after): void
    {
        $rows = $this->encode($after);
        $old = $before ? $this->encode($before) : [];
        foreach (array_reverse(array_keys($rows)) as $table) {
            $deleted = array_diff(array_keys($old[$table] ?? []), array_keys($rows[$table]));
            if ($deleted) {
                $this->model($table)->newQuery()->whereIn('id', $deleted)->delete();
            }
        }
        foreach ($rows as $table => $records) {
            foreach ($records as $id => $record) {
                if (($old[$table][$id] ?? null) === $record) {
                    continue;
                }
                $model = $this->model($table)->newInstance($record);
                $model->exists = isset($old[$table][$id]);
                $model->save();
            }
        }
        DB::table('pos_counters')->where('id', 'state')->update(['value' => $after['nextOrder'], 'initialized' => true]);
    }

    public function transaction(callable $callback, int $attempts = 3): mixed
    {
        return DB::transaction(function () use ($callback): mixed {
            DB::table('pos_counters')->where('id', 'state')->lockForUpdate()->firstOrFail();

            return $callback();
        }, $attempts);
    }

    public function initialize(array $data): void
    {
        foreach (self::TABLES as $key => $table) {
            if (! in_array($key, ['tableSessions', 'roles'], true) && ! is_array($data[$key] ?? null)) {
                throw new RuntimeException("Invalid source collection: {$key}");
            }
        }
        $maxNumber = max([0, ...array_column($data['orders'], 'number')]);
        if (! is_int($data['nextOrder'] ?? null) || $data['nextOrder'] <= $maxNumber) {
            throw new RuntimeException('Invalid nextOrder counter.');
        }
        $data['tableSessions'] ??= [];
        $data['roles'] ??= array_merge(...array_map(fn ($tenant) => RoleCatalog::defaults($tenant['id']), $data['tenants']));
        foreach ($data['users'] as &$user) {
            if (! array_filter($data['roles'], fn ($role) => $role['tenantId'] === $user['tenantId'] && $role['key'] === $user['role'])) {
                throw new RuntimeException('Employee references an unknown role.');
            }
            $user['email'] = mb_strtolower($user['email']);
            if (isset($user['pin'])) {
                $user['pinHash'] = Hash::make((string) $user['pin']);
            }
            if (! isset($user['pinHash']) || ! password_get_info($user['pinHash'])['algo']) {
                throw new RuntimeException('Missing or invalid employee PIN hash.');
            }
            unset($user['pin']);
        }
        unset($user);
        $this->transaction(function () use ($data): void {
            if (DB::table('pos_counters')->where('id', 'state')->value('initialized') || DB::table('tenants')->exists()) {
                throw new RuntimeException('Database already contains data; import refused.');
            }
            $this->save(null, $data);
        });
    }
}
