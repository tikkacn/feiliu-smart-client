<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$storageDir = $root . '/storage';
if (!is_dir($storageDir)) mkdir($storageDir, 0770, true);

require $root . '/app/bootstrap.php';

$manifestPath = $storageDir . '/published.json';
if (!is_file($manifestPath)) {
    file_put_contents($manifestPath, json_encode([
        'schemaVersion' => 1,
        'version' => 1,
        'updatedAt' => gmdate('c'),
        'nodes' => [],
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}
fwrite(STDOUT, "Route manager database is ready.\n");

