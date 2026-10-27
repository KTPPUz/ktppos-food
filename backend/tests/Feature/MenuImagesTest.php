<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\PosRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class MenuImagesTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('menu_images');
        $this->artisan('pos:seed')->assertSuccessful();
        $this->token = $this->login('restaurant-u0');
    }

    private function login(string $user): string
    {
        return $this->postJson('/api/auth/login', ['userId' => $user, 'pin' => '1234'])->assertOk()->json('token');
    }

    private function upload(UploadedFile $image, array $payload = ['name' => 'อาหารรูปจริง'], ?string $token = null): TestResponse
    {
        return $this->post('/api/menu-items/m1', ['_method' => 'PATCH', 'payload' => json_encode($payload), 'image' => $image], ['Authorization' => 'Bearer '.($token ?? $this->token), 'Accept' => 'application/json']);
    }

    public function test_real_image_is_normalized_and_shared_by_catalog_and_guest_menu(): void
    {
        $response = $this->upload(UploadedFile::fake()->image('dish.jpg', 2400, 1200));
        $response->assertOk()->assertJsonPath('name', 'อาหารรูปจริง');
        $url = $response->json('image');
        $path = parse_url($url, PHP_URL_PATH);
        $filename = basename($path);
        $this->assertStringStartsWith('/media/menu-images/', $path);
        Storage::disk('menu_images')->assertExists($filename);
        $size = getimagesize(Storage::disk('menu_images')->path($filename));
        $this->assertSame(1600, $size[0]);
        $this->assertSame(800, $size[1]);
        $this->assertSame('image/webp', $size['mime']);
        $this->get($path)->assertOk()->assertHeader('Content-Type', 'image/webp')->assertHeader('X-Content-Type-Options', 'nosniff');
        $state = $this->getJson('/api/state', ['Authorization' => 'Bearer '.$this->token])->assertOk()->json();
        $this->assertSame($url, $state['menu'][0]['image']);
        $session = $this->postJson('/api/tables/r1-t15/session', [], ['Authorization' => 'Bearer '.$this->token])->assertOk()->json();
        $this->getJson('/api/guest/'.$session['token'])->assertOk()->assertJsonPath('menu.0.image', $url);
        $other = $this->getJson('/api/state', ['Authorization' => 'Bearer '.$this->login('cafe-u0')])->json();
        $this->assertNotSame($url, $other['menu'][0]['image']);
        $this->get('/media/menu-images/not-a-file.webp')->assertNotFound();
    }

    public function test_invalid_file_or_menu_does_not_save_any_file(): void
    {
        $this->upload(UploadedFile::fake()->createWithContent('evil.jpg', '<?php echo "unsafe";'))->assertStatus(400);
        $this->upload(UploadedFile::fake()->createWithContent('image.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'))->assertStatus(400);
        $this->upload(UploadedFile::fake()->image('large.jpg')->size(5121))->assertStatus(400);
        $this->upload(UploadedFile::fake()->image('wide.png', 6001, 1))->assertStatus(400);
        $this->upload(UploadedFile::fake()->image('valid.jpg'), ['discount' => ['type' => 'percent', 'value' => 101]])->assertStatus(400);
        $this->assertCount(0, Storage::disk('menu_images')->allFiles());
        $this->upload(UploadedFile::fake()->image('no-access.jpg'), ['name' => 'blocked'], $this->login('restaurant-u2'))->assertForbidden();
        $this->post('/api/menu-items/m1', ['_method' => 'PATCH', 'payload' => '{bad', 'image' => UploadedFile::fake()->image('bad.jpg')], ['Authorization' => 'Bearer '.$this->token])->assertStatus(400);
        $this->assertCount(0, Storage::disk('menu_images')->allFiles());
    }

    public function test_replacement_cleans_old_image_only_after_a_successful_save(): void
    {
        $first = $this->upload(UploadedFile::fake()->image('first.png'))->assertOk()->json('image');
        $second = $this->upload(UploadedFile::fake()->image('second.png'))->assertOk()->json('image');
        Storage::disk('menu_images')->assertMissing(basename($first));
        Storage::disk('menu_images')->assertExists(basename($second));
        $this->assertCount(1, Storage::disk('menu_images')->allFiles());
        PosRecord::saving(function (PosRecord $record): void {
            if ($record->getTable() === 'menu_overrides') {
                throw new \RuntimeException('Simulated database write failure');
            }
        });
        try {
            $this->upload(UploadedFile::fake()->image('rollback.png'), ['name' => 'must not save'])->assertStatus(503);
        } finally {
            PosRecord::flushEventListeners();
        }
        $this->assertCount(1, Storage::disk('menu_images')->allFiles());
        Storage::disk('menu_images')->assertExists(basename($second));
        $state = $this->getJson('/api/state', ['Authorization' => 'Bearer '.$this->token])->assertOk()->json();
        $this->assertSame($second, $state['menu'][0]['image']);
        $this->assertSame('อาหารรูปจริง', $state['menu'][0]['name']);
    }
}
