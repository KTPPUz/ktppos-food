<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\PosRepository;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

final class ExportPosSql extends Command
{
    protected $signature = 'pos:export-sql {file : Private destination SQL file (must not already exist)}';

    protected $description = 'Export MariaDB schema and data for import with phpMyAdmin; preserve APP_KEY when restoring';

    public function handle(PosRepository $repository): int
    {
        $handle = null;
        try {
            if (DB::getDriverName() !== 'mysql') {
                throw new RuntimeException('SQL export requires MySQL/MariaDB.');
            }
            $file = $this->argument('file');
            $directory = realpath(dirname($file));
            if (! $directory || str_starts_with($directory.DIRECTORY_SEPARATOR, realpath(public_path()).DIRECTORY_SEPARATOR)) {
                throw new RuntimeException('Choose an existing private directory outside public/.');
            }
            $path = $directory.DIRECTORY_SEPARATOR.basename($file);
            // Never overwrite a backup or create a world-readable export.
            $oldMask = umask(0077);
            try {
                $handle = fopen($path, 'x');
            } finally {
                umask($oldMask);
            }
            if (! $handle) {
                throw new RuntimeException('Cannot create destination file.');
            }
            $repository->transaction(function () use ($repository, $handle): void {
                $repository->load(); // Reject an uninitialized source.
                fwrite($handle, "-- KTP Table: restore into an EMPTY database; keep the original Laravel APP_KEY.\nSET NAMES utf8mb4;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\nSET FOREIGN_KEY_CHECKS=0;\n");
                $tables = ['migrations', 'pos_counters', ...array_values(PosRepository::TABLES), 'menu_overrides', 'order_items', 'kitchen_batches', 'guest_submissions', 'auth_tokens'];
                foreach ($tables as $table) {
                    // Table names come exclusively from the fixed application schema.
                    $create = DB::selectOne('SHOW CREATE TABLE `'.$table.'`');
                    fwrite($handle, $create->{'Create Table'}.";\n");
                    if ($table === 'auth_tokens') {
                        continue;
                    }
                    foreach (DB::table($table)->get() as $record) {
                        $values = (array) $record;
                        $columns = implode(',', array_map(fn (string $key): string => '`'.$key.'`', array_keys($values)));
                        $quoted = implode(',', array_map(fn (mixed $value): string => $value === null ? 'NULL' : DB::getPdo()->quote((string) $value), array_values($values)));
                        fwrite($handle, 'INSERT INTO `'.$table.'` ('.$columns.') VALUES ('.$quoted.");\n");
                    }
                }
                fwrite($handle, "SET FOREIGN_KEY_CHECKS=1;\n");
            });
            $this->info('SQL exported. Keep this file private and restore with the SAME APP_KEY. Staff must log in again.');

            return self::SUCCESS;
        } catch (Throwable $error) {
            $this->error($error->getMessage());

            return self::FAILURE;
        } finally {
            if (is_resource($handle)) {
                fclose($handle);
            }
        }
    }
}
