<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\PosRepository;
use Illuminate\Console\Command;
use Throwable;

final class ImportPos extends Command
{
    protected $signature = 'pos:import {file : JSON export from the previous backend}';

    protected $description = 'Import POS data atomically into an empty database; never overwrite existing data';

    public function handle(PosRepository $repository): int
    {
        try {
            $path = realpath($this->argument('file'));
            if (! $path || ! is_readable($path)) {
                $this->error('Source JSON file not found or not readable.');

                return self::FAILURE;
            }
            $data = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            $repository->initialize($data);
            $this->info('Imported '.count($data['tenants']).' tenants and '.count($data['orders']).' orders. Source file unchanged.');

            return self::SUCCESS;
        } catch (Throwable $error) {
            $this->error('Import failed: '.$error->getMessage());

            return self::FAILURE;
        }
    }
}
