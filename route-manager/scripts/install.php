<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$configDir = $root . '/config';
$storageDir = $root . '/storage';
if (!is_dir($configDir)) mkdir($configDir, 0770, true);
if (!is_dir($storageDir)) mkdir($storageDir, 0770, true);

$password = getenv('FEILIU_ADMIN_PASSWORD') ?: '';
if ($password === '') {
    fwrite(STDOUT, "Admin password: ");
    $password = trim((string) fgets(STDIN));
}
if (strlen($password) < 8) {
    fwrite(STDERR, "Password must contain at least 8 characters.\n");
    exit(1);
}

$config = "<?php\n\nreturn " . var_export([
    'site_name' => 'Feiliu 节点线路分类',
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    'session_name' => 'feiliu_route_manager',
    'cookie_secure' => true,
], true) . ";\n";
file_put_contents($configDir . '/config.php', $config, LOCK_EX);

require $root . '/app/bootstrap.php';
if (!is_file($storageDir . '/published.json')) {
    file_put_contents($storageDir . '/published.json', json_encode([
        'schemaVersion' => 1,
        'version' => 1,
        'updatedAt' => gmdate('c'),
        'nodes' => [],
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}
fwrite(STDOUT, "Route manager installed.\n");
