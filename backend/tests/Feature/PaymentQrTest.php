<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Branch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class PaymentQrTest extends TestCase
{
    use RefreshDatabase;

    private array $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('menu_images');
        $this->artisan('pos:seed')->assertSuccessful();
        $this->owner = $this->login('restaurant-u0');
    }

    private function login(string $id): array
    {
        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/login', ['userId' => $id, 'pin' => '1234'])->assertOk()->json('token')];
    }

    private function upload(?array $headers = null, string $branch = 'r1', ?UploadedFile $image = null): TestResponse
    {
        return $this->post('/api/branches/'.$branch.'/payment-qr', ['_method' => 'PATCH', 'payload' => json_encode(['accountName' => 'ร้านอาหาร', 'bankName' => 'พร้อมเพย์', 'accountNumber' => '0801234567', 'enabled' => true]), 'image' => $image ?? UploadedFile::fake()->image('qr.png', 400, 400)], ($headers ?? $this->owner) + ['Accept' => 'application/json']);
    }

    private function order(): string
    {
        return $this->postJson('/api/orders', ['branchId' => 'r1', 'type' => 'takeaway', 'items' => [['menuId' => 'm30', 'qty' => 1]]], $this->owner)->assertCreated()->json('id');
    }

    public function test_manual_qr_requires_configuration_verification_and_current_account_version(): void
    {
        $id = $this->order();
        $pay = '/api/orders/'.$id.'/payments';
        $cashier = $this->login('restaurant-u2');
        $this->postJson($pay, ['method' => 'qr', 'verified' => true], $cashier)->assertStatus(409);
        $qr = $this->upload()->assertOk()->json();
        $this->assertStringEndsWith('.png', $qr['image']);
        $this->get(parse_url($qr['image'], PHP_URL_PATH))->assertOk()->assertHeader('Content-Type', 'image/png');
        $state = $this->getJson('/api/state', $cashier)->assertOk()->json();
        $this->assertSame($qr['image'], $state['branches'][0]['paymentQr']['image']);
        $this->postJson($pay, ['method' => 'qr', 'verified' => false, 'qrVersion' => $qr['version']], $cashier)->assertStatus(400);
        $this->postJson($pay, ['method' => 'qr', 'verified' => true, 'qrVersion' => 'stale'], $cashier)->assertStatus(409);
        $this->postJson($pay, ['method' => 'qr', 'verified' => true, 'qrVersion' => $qr['version']], $cashier)->assertOk()->assertJsonPath('payment.verification', 'manual')->assertJsonPath('payment.verifiedBy', 'restaurant-u2')->assertJsonPath('payment.account.accountName', 'ร้านอาหาร')->assertJsonPath('status', 'paid');
        $this->postJson($pay, ['method' => 'qr', 'verified' => true, 'qrVersion' => $qr['version']], $cashier)->assertStatus(409);
        $next = $this->order();
        $new = $this->patchJson('/api/branches/r1/payment-qr', ['accountName' => 'บัญชีใหม่'], $this->owner)->assertOk()->json();
        $this->assertNotSame($qr['version'], $new['version']);
        $this->postJson('/api/orders/'.$next.'/payments', ['method' => 'qr', 'verified' => true, 'qrVersion' => $qr['version']], $cashier)->assertStatus(409);
        $this->patchJson('/api/branches/r1/payment-qr', ['enabled' => false], $this->owner)->assertOk();
        $this->postJson('/api/orders/'.$next.'/payments', ['method' => 'qr', 'verified' => true, 'qrVersion' => $new['version']], $cashier)->assertStatus(409);
    }

    public function test_qr_settings_are_owner_only_tenant_scoped_and_validated(): void
    {
        $this->upload($this->login('restaurant-u2'))->assertForbidden();
        $this->upload($this->owner, 'b1')->assertNotFound();
        $this->deleteJson('/api/branches/r1/payment-qr', [], $this->login('restaurant-u1'))->assertForbidden();
        $this->patchJson('/api/branches/r1/payment-qr', ['enabled' => true], $this->owner)->assertStatus(400);
        foreach ([['enabled' => 'true'], ['accountName' => []], ['accountNumber' => str_repeat('a', 51)], ['image' => 'https://example.com/fake.png']] as $body) {
            $this->patchJson('/api/branches/r1/payment-qr', $body, $this->owner)->assertStatus(400);
        }
        $this->upload(null, 'r1', UploadedFile::fake()->createWithContent('fake.png', '<script>bad</script>'))->assertStatus(400);
        $this->assertCount(0, Storage::disk('menu_images')->allFiles());
        $this->upload($this->login('cafe-u0'), 'c1')->assertOk(); // Small also accepts static QR.
    }

    public function test_replacement_deletion_and_rollback_keep_files_consistent(): void
    {
        $first = $this->upload()->assertOk()->json('image');
        $second = $this->upload()->assertOk()->json('image');
        Storage::disk('menu_images')->assertMissing(basename($first));
        Storage::disk('menu_images')->assertExists(basename($second));
        Branch::saving(function (Branch $record): void {
            if ($record->getTable() === 'branches') {
                throw new \RuntimeException('Simulated write failure');
            }
        });
        try {
            $this->upload()->assertStatus(503);
        } finally {
            Branch::flushEventListeners();
        }
        $this->assertCount(1, Storage::disk('menu_images')->allFiles());
        Storage::disk('menu_images')->assertExists(basename($second));
        $this->deleteJson('/api/branches/r1/payment-qr', [], $this->owner)->assertOk();
        $this->assertCount(0, Storage::disk('menu_images')->allFiles());
        $this->getJson('/api/branches', $this->owner)->assertJsonMissingPath('0.paymentQr');
    }
}
