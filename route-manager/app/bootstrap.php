<?php

declare(strict_types=1);

const ROUTE_MANAGER_SCHEMA_VERSION = 1;

$configPath = dirname(__DIR__) . '/config/config.php';
if (!is_file($configPath)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'route manager is not installed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$routeManagerConfig = require $configPath;
$storageDir = dirname(__DIR__) . '/storage';
if (!is_dir($storageDir)) {
    mkdir($storageDir, 0770, true);
}

$database = new PDO('sqlite:' . $storageDir . '/routes.sqlite');
$database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$database->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$database->exec('PRAGMA foreign_keys = ON');

$database->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    match_key TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN (
        'telecom', 'unicom', 'mobile', 'telecom-unicom',
        'telecom-mobile', 'unicom-mobile', 'three-network'
    )),
    enabled INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publish_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    node_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publish_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL REFERENCES publish_versions(id) ON DELETE CASCADE,
    match_key TEXT NOT NULL,
    category TEXT NOT NULL,
    UNIQUE(version_id, match_key)
);
CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_publish_items_version ON publish_items(version_id);
SQL);

$now = gmdate('c');
$admin = $database->query("SELECT id FROM admin_users WHERE username = 'admin' LIMIT 1")->fetch();
if (!$admin && !empty($routeManagerConfig['password_hash'])) {
    $statement = $database->prepare(
        'INSERT INTO admin_users (username, password_hash, created_at, updated_at) VALUES (:username, :password_hash, :created_at, :updated_at)'
    );
    $statement->execute([
        ':username' => 'admin',
        ':password_hash' => $routeManagerConfig['password_hash'],
        ':created_at' => $now,
        ':updated_at' => $now,
    ]);
}

function route_manager_json(mixed $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function route_manager_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function route_manager_normalize_key(string $value): string
{
    $value = trim($value);
    $value = preg_replace('/\s+/u', ' ', $value) ?? $value;
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function route_manager_categories(): array
{
    return [
        'telecom', 'unicom', 'mobile', 'telecom-unicom',
        'telecom-mobile', 'unicom-mobile', 'three-network',
    ];
}

function route_manager_require_auth(bool $csrf = false): void
{
    if (empty($_SESSION['route_manager_user'])) {
        route_manager_json(['error' => 'authentication required'], 401);
    }
    if ($csrf && !hash_equals($_SESSION['route_manager_csrf'] ?? '', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
        route_manager_json(['error' => 'invalid csrf token'], 419);
    }
}

function route_manager_manifest(PDO $database): array
{
    $version = $database->query('SELECT id, version, created_at FROM publish_versions ORDER BY version DESC LIMIT 1')->fetch();
    if (!$version) {
        return [
            'schemaVersion' => ROUTE_MANAGER_SCHEMA_VERSION,
            'version' => 1,
            'updatedAt' => gmdate('c'),
            'nodes' => [],
        ];
    }

    $items = $database->prepare('SELECT match_key, category FROM publish_items WHERE version_id = :version_id ORDER BY id ASC');
    $items->execute([':version_id' => $version['id']]);
    return [
        'schemaVersion' => ROUTE_MANAGER_SCHEMA_VERSION,
        'version' => (int) $version['version'],
        'updatedAt' => $version['created_at'],
        'nodes' => array_map(static fn (array $item): array => [
            'matchKey' => $item['match_key'],
            'category' => $item['category'],
        ], $items->fetchAll()),
    ];
}

function route_manager_write_manifest(PDO $database): array
{
    $manifest = route_manager_manifest($database);
    $path = dirname(__DIR__) . '/storage/published.json';
    $temporary = $path . '.tmp';
    $payload = json_encode(
        $manifest,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR,
    );
    if (file_put_contents($temporary, $payload, LOCK_EX) === false || !rename($temporary, $path)) {
        throw new RuntimeException('failed to publish manifest file');
    }
    return $manifest;
}

$sessionName = $routeManagerConfig['session_name'] ?? 'feiliu_route_manager';
session_name($sessionName);
session_set_cookie_params([
    'path' => '/',
    'httponly' => true,
    'secure' => (bool) ($routeManagerConfig['cookie_secure'] ?? true),
    'samesite' => 'Lax',
]);
session_start();
