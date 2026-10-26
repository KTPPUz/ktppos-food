<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\PosRepository;
use Illuminate\Console\Command;
use Throwable;

final class SeedPos extends Command
{
    protected $signature = 'pos:seed';

    protected $description = 'Initialize an empty database with demonstration data (PIN 1234)';

    public function handle(PosRepository $repository): int
    {
        try {
            $data = json_decode(file_get_contents(resource_path('data/demo.json')), true, 512, JSON_THROW_ON_ERROR);
            foreach ($data['users'] as &$user) {
                $user['pin'] = '1234';
            }
            unset($user);
            foreach ($data['orders'] as &$order) {
                $order['createdAt'] = now()->subMinutes(10)->toISOString();
            }
            unset($order);
            $repository->initialize($data);
            $this->info('Demo data imported. Demo accounts use PIN 1234.');

            return self::SUCCESS;
        } catch (Throwable $error) {
            $this->error($error->getMessage());

            return self::FAILURE;
        }
    }
}
