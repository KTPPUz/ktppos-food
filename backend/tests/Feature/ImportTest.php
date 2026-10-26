<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class ImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_preserves_data_hashes_pins_and_refuses_overwrite(): void
    {
        $data = json_decode(file_get_contents(resource_path('data/demo.json')), true);
        foreach ($data['users'] as &$user) {
            $user['pin'] = '1234';
        }
        unset($user);
        $file = tempnam(sys_get_temp_dir(), 'pos-import-');
        file_put_contents($file, json_encode($data));
        try {
            $this->artisan('pos:import', ['file' => $file])->assertSuccessful();
            $this->assertSame(count($data['orders']), DB::table('pos_orders')->count());
            $this->assertSame(count($data['users']), Employee::count());
            $this->assertSame(json_encode($data), file_get_contents($file));
            $this->artisan('pos:import', ['file' => $file])->assertFailed();
            $this->assertSame(count($data['orders']), DB::table('pos_orders')->count());
        } finally {
            unlink($file);
        }
    }

    public function test_invalid_import_never_initializes_the_database(): void
    {
        $this->artisan('pos:import', ['file' => '/missing/pos-source.json'])->assertFailed();
        $file = tempnam(sys_get_temp_dir(), 'pos-invalid-');
        file_put_contents($file, '{bad json');
        try {
            $this->artisan('pos:import', ['file' => $file])->assertFailed();
            $this->assertSame(0, DB::table('tenants')->count());
            $this->assertFalse((bool) DB::table('pos_counters')->value('initialized'));
        } finally {
            unlink($file);
        }
    }

    public function test_sql_export_is_private_and_can_only_run_on_mariadb(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            $this->artisan('pos:export-sql', ['file' => sys_get_temp_dir().'/pos-test-unused.sql'])->assertFailed();

            return;
        }
        $this->artisan('pos:seed')->assertSuccessful();
        $file = sys_get_temp_dir().'/pos-sql-'.bin2hex(random_bytes(8)).'.sql';
        try {
            $this->artisan('pos:export-sql', ['file' => $file])->assertSuccessful();
            $sql = file_get_contents($file);
            $this->assertStringContainsString('CREATE TABLE `employees`', $sql);
            $this->assertStringContainsString('INSERT INTO `pos_orders`', $sql);
            $this->assertStringNotContainsString('"pin":"1234"', $sql);
            $this->assertSame(0600, fileperms($file) & 0777);
            $this->artisan('pos:export-sql', ['file' => public_path('unsafe.sql')])->assertFailed();
        } finally {
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }
}
