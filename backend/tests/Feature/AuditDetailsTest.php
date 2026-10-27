<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class AuditDetailsTest extends TestCase
{
    use RefreshDatabase;

    private array $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('pos:seed')->assertSuccessful();
        $this->owner = $this->login('restaurant-u0');
    }

    private function login(string $user): array
    {
        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/login', ['userId' => $user, 'pin' => '1234'])->assertOk()->json('token')];
    }

    private function latest(?array $headers = null): array
    {
        return $this->getJson('/api/state', $headers ?? $this->owner)->assertOk()->json('audit.0');
    }

    public function test_effective_menu_values_are_captured_and_detail_reads_do_not_create_audits(): void
    {
        $this->patchJson('/api/menu-items/m1', ['price' => 199, 'name' => 'ชื่อใหม่'], $this->owner)->assertOk();
        $summary = $this->latest();
        $this->assertArrayNotHasKey('changes', $summary);
        $detail = $this->getJson('/api/audit/'.$summary['id'], $this->owner)->assertOk()->json();
        $change = collect($detail['changes'])->firstWhere('entity', 'เมนูอาหาร');
        $fields = collect($change['fields'])->keyBy('key');
        $this->assertEquals(129, $fields['price']['before']);
        $this->assertEquals(199, $fields['price']['after']);
        $this->assertSame('ชื่อใหม่', $fields['name']['after']);
        $this->assertSame('update', $change['type']);
        $count = DB::table('audit_entries')->count();
        $this->getJson('/api/audit/'.$summary['id'], $this->owner)->assertOk();
        $this->assertSame($count, DB::table('audit_entries')->count());
        $this->patchJson('/api/menu-items/m1', ['price' => 199], $this->owner)->assertOk();
        $same = $this->latest();
        $this->getJson('/api/audit/'.$same['id'], $this->owner)->assertOk()->assertJsonPath('changes', []);
        $this->patchJson('/api/branches/r1/payment-qr', ['enabled' => false], $this->owner)->assertOk();
        $this->patchJson('/api/branches/r1/payment-qr', ['enabled' => false], $this->owner)->assertOk();
        $same = $this->latest();
        $this->getJson('/api/audit/'.$same['id'], $this->owner)->assertOk()->assertJsonPath('changes', []);
    }

    public function test_pin_values_are_redacted_and_roles_have_readable_menu_changes(): void
    {
        $this->patchJson('/api/users/restaurant-u4', ['pin' => '7777'], $this->owner)->assertOk();
        $entry = $this->latest();
        $response = $this->getJson('/api/audit/'.$entry['id'], $this->owner)->assertOk();
        $this->assertStringNotContainsString('7777', $response->getContent());
        $this->assertStringNotContainsString('$2y$', $response->getContent());
        $field = collect($response->json('changes.0.fields'))->firstWhere('key', 'pinHash');
        $this->assertTrue($field['redacted']);
        $this->assertSame('ปกปิด', $field['before']);
        $this->assertSame('ปกปิด', $field['after']);
        $roles = $this->getJson('/api/roles', $this->owner)->json();
        $role = collect($roles)->firstWhere('key', 'Cashier');
        $this->patchJson('/api/roles/'.$role['id'], ['menus' => ['pos']], $this->owner)->assertOk();
        $entry = $this->latest();
        $detail = $this->getJson('/api/audit/'.$entry['id'], $this->owner)->assertOk()->json();
        $change = collect($detail['changes'])->firstWhere('entity', 'บทบาท');
        $menus = collect($change['fields'])->firstWhere('key', 'menus');
        $this->assertContains('รับชำระเงิน', $menus['before']);
        $this->assertSame(['ขายหน้าร้าน'], $menus['after']);
    }

    public function test_history_access_is_permission_tenant_and_branch_scoped(): void
    {
        $this->patchJson('/api/tables/r1-t15', ['name' => 'ใหม่'], $this->owner)->assertOk();
        $entry = $this->latest();
        $this->getJson('/api/audit/'.$entry['id'])->assertUnauthorized();
        $this->getJson('/api/audit/'.$entry['id'], $this->login('restaurant-u2'))->assertForbidden();
        $this->getJson('/api/audit/'.$entry['id'], $this->login('cafe-u0'))->assertNotFound();
        $brand = $this->login('brand-u0');
        $role = $this->postJson('/api/roles', ['name' => 'ตรวจประวัติสาขา', 'menus' => ['audit'], 'scope' => 'branch'], $brand)->assertCreated()->json();
        $this->patchJson('/api/users/brand-u4', ['role' => $role['key']], $brand)->assertOk();
        $this->patchJson('/api/tables/b2-t15', ['name' => 'อีกสาขา'], $brand)->assertOk();
        $audit = collect($this->getJson('/api/state', $brand)->json('audit'))->firstWhere('branchId', 'b2');
        $this->getJson('/api/audit/'.$audit['id'], $this->login('brand-u4'))->assertNotFound();
    }

    public function test_old_entries_remain_readable_and_failed_changes_have_no_history(): void
    {
        $row = ['id' => 'old-audit', 'tenantId' => 'restaurant', 'branchId' => 'r1', 'action' => 'รายการเดิม', 'detail' => 'ข้อมูลเดิม', 'user' => 'เจ้าของร้าน', 'role' => 'Owner', 'at' => now()->toISOString()];
        DB::table('audit_entries')->insert(['id' => $row['id'], 'tenant_id' => 'restaurant', 'branch_id' => 'r1', 'position' => 0, 'payload' => json_encode($row, JSON_UNESCAPED_UNICODE)]);
        $this->getJson('/api/audit/old-audit', $this->owner)->assertOk()->assertJsonMissingPath('changes');
        $count = DB::table('audit_entries')->count();
        $this->patchJson('/api/tables/r1-t15', ['seats' => 999], $this->owner)->assertStatus(400);
        $this->assertSame($count, DB::table('audit_entries')->count());
        $table = $this->postJson('/api/tables', ['branchId' => 'r1', 'name' => 'ใหม่สำหรับลบ', 'seats' => 4], $this->owner)->assertCreated()->json();
        $create = $this->latest();
        $this->getJson('/api/audit/'.$create['id'], $this->owner)->assertOk()->assertJsonPath('changes.0.type', 'create');
        $this->deleteJson('/api/tables/'.$table['id'], [], $this->owner)->assertOk();
        $deleted = $this->latest();
        $this->getJson('/api/audit/'.$deleted['id'], $this->owner)->assertOk()->assertJsonPath('changes.0.type', 'delete');
    }
}
