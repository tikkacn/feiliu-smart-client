<?php

declare(strict_types=1);

const ROUTE_MANAGER_MANIFEST_SCHEMA_VERSION = 1;
const ROUTE_MANAGER_STORAGE_SCHEMA_VERSION = 2;

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
    category TEXT CHECK (category IS NULL OR category IN (
        'telecom', 'unicom', 'mobile', 'telecom-unicom',
        'telecom-mobile', 'unicom-mobile', 'three-network'
    )),
    enabled INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS node_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    last_scan_at TEXT,
    last_scan_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',
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

$nodeColumns = $database->query('PRAGMA table_info(nodes)')->fetchAll();
$categoryColumn = array_values(array_filter($nodeColumns, static fn (array $column): bool => $column['name'] === 'category'))[0] ?? null;
$hasSourceUrl = array_values(array_filter($nodeColumns, static fn (array $column): bool => $column['name'] === 'source_url')) !== [];
if (!$categoryColumn || (int) $categoryColumn['notnull'] === 1 || !$hasSourceUrl) {
    $database->beginTransaction();
    try {
        $database->exec('DROP INDEX IF EXISTS idx_nodes_updated_at');
        $database->exec('ALTER TABLE nodes RENAME TO nodes_legacy');
        $database->exec(<<<'SQL'
CREATE TABLE nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    match_key TEXT NOT NULL UNIQUE,
    category TEXT CHECK (category IS NULL OR category IN (
        'telecom', 'unicom', 'mobile', 'telecom-unicom',
        'telecom-mobile', 'unicom-mobile', 'three-network'
    )),
    enabled INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
SQL);
        $legacyColumns = $database->query('PRAGMA table_info(nodes_legacy)')->fetchAll();
        $legacyHasSourceUrl = array_values(array_filter($legacyColumns, static fn (array $column): bool => $column['name'] === 'source_url')) !== [];
        $sourceExpression = $legacyHasSourceUrl ? 'source_url' : "''";
        $database->exec("INSERT INTO nodes (id, display_name, match_key, category, enabled, notes, source_url, created_at, updated_at) SELECT id, display_name, match_key, NULLIF(category, ''), enabled, notes, $sourceExpression, created_at, updated_at FROM nodes_legacy");
        $database->exec('DROP TABLE nodes_legacy');
        $database->exec('CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at)');
        $database->commit();
    } catch (Throwable $error) {
        if ($database->inTransaction()) {
            $database->rollBack();
        }
        throw $error;
    }
}
$database->exec('PRAGMA user_version = ' . ROUTE_MANAGER_STORAGE_SCHEMA_VERSION);

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

function route_manager_category_or_null(mixed $value): ?string
{
    $category = trim((string) $value);
    return in_array($category, route_manager_categories(), true) ? $category : null;
}

function route_manager_default_source_url(): string
{
    global $routeManagerConfig;
    return trim((string) ($routeManagerConfig['default_source_url'] ?? 'https://guide.uutec.net/'));
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
            'schemaVersion' => ROUTE_MANAGER_MANIFEST_SCHEMA_VERSION,
            'version' => 1,
            'updatedAt' => gmdate('c'),
            'nodes' => [],
        ];
    }

    $items = $database->prepare('SELECT match_key, category FROM publish_items WHERE version_id = :version_id ORDER BY id ASC');
    $items->execute([':version_id' => $version['id']]);
    return [
        'schemaVersion' => ROUTE_MANAGER_MANIFEST_SCHEMA_VERSION,
        'version' => (int) $version['version'],
        'updatedAt' => $version['created_at'],
        'nodes' => array_map(static fn (array $item): array => [
            'matchKey' => $item['match_key'],
            'category' => $item['category'],
        ], $items->fetchAll()),
    ];
}

function route_manager_source_host_is_public(string $host): bool
{
    $host = trim($host, '[]');
    if ($host === '' || in_array(strtolower($host), ['localhost', 'localhost.localdomain'], true)) {
        return false;
    }
    $ip = filter_var($host, FILTER_VALIDATE_IP);
    if ($ip !== false) {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }
    $resolved = gethostbynamel($host);
    if (!$resolved) {
        return false;
    }
    foreach ($resolved as $address) {
        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
    }
    return true;
}

function route_manager_fetch_source(string $url): array
{
    $parts = parse_url($url);
    if (!$parts || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)) {
        throw new RuntimeException('来源地址必须使用 http 或 https');
    }
    if (!empty($parts['user']) || !empty($parts['pass']) || empty($parts['host']) || !route_manager_source_host_is_public($parts['host'])) {
        throw new RuntimeException('来源地址不安全或无法访问');
    }

    $headers = ['Accept: application/json, application/yaml, text/yaml, text/plain, text/html;q=0.8, */*;q=0.1'];
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_ENCODING => '',
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_USERAGENT => 'Feiliu-Route-Manager/1.0',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $body = curl_exec($handle);
        $error = curl_error($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $contentType = (string) curl_getinfo($handle, CURLINFO_CONTENT_TYPE);
        $effectiveUrl = (string) curl_getinfo($handle, CURLINFO_EFFECTIVE_URL);
        curl_close($handle);
        if ($body === false || $error !== '') {
            throw new RuntimeException('读取来源失败：' . $error);
        }
        if ($status < 200 || $status >= 300) {
            throw new RuntimeException("来源返回 HTTP $status");
        }
        $effectiveHost = parse_url($effectiveUrl, PHP_URL_HOST);
        if (!$effectiveHost || !route_manager_source_host_is_public($effectiveHost)) {
            throw new RuntimeException('来源重定向到了不安全地址');
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 20,
                'follow_location' => 0,
                'header' => implode("\r\n", $headers),
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $body = @file_get_contents($url, false, $context);
        $contentType = '';
        if (isset($http_response_header)) {
            foreach ($http_response_header as $header) {
                if (stripos($header, 'Content-Type:') === 0) {
                    $contentType = trim(substr($header, strlen('Content-Type:')));
                }
            }
        }
        if ($body === false) {
            throw new RuntimeException('读取来源失败');
        }
    }
    if (strlen($body) > 8 * 1024 * 1024) {
        throw new RuntimeException('来源内容超过 8 MB，已停止读取');
    }
    return ['body' => $body, 'contentType' => $contentType];
}

function route_manager_clean_node_name(string $value): string
{
    $value = trim(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $value = trim($value, " \t\r\n\"'");
    return preg_replace('/\s+/u', ' ', $value) ?? $value;
}

function route_manager_node_candidate(string $name, array $metadata = []): ?array
{
    $displayName = route_manager_clean_node_name($name);
    $length = function_exists('mb_strlen') ? mb_strlen($displayName, 'UTF-8') : strlen($displayName);
    if ($displayName === '' || $length > 180) {
        return null;
    }
    $matchKey = route_manager_normalize_key($displayName);
    return $matchKey === '' ? null : array_merge([
        'displayName' => $displayName,
        'matchKey' => $matchKey,
        'category' => null,
    ], $metadata);
}

function route_manager_scan_source(string $body): array
{
    $body = trim(preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body);
    $payloads = [$body];
    $decoded = base64_decode(preg_replace('/\s+/', '', $body) ?? '', true);
    if ($decoded !== false && $decoded !== $body && preg_match('/(?:proxies\s*:|(?:vmess|vless|trojan|ss|ssr|hysteria|hysteria2|tuic):\/\/)/i', $decoded)) {
        $payloads[] = $decoded;
    }

    $found = [];
    $add = static function (?array $candidate) use (&$found): void {
        if (!$candidate || isset($found[$candidate['matchKey']])) {
            return;
        }
        $found[$candidate['matchKey']] = $candidate;
    };
    $extractNamed = static function (mixed $value) use (&$extractNamed, $add): void {
        if (!is_array($value)) {
            return;
        }
        if (isset($value['name']) && is_string($value['name'])) {
            $add(route_manager_node_candidate($value['name']));
            return;
        }
        if (isset($value['displayName']) && is_string($value['displayName'])) {
            $add(route_manager_node_candidate($value['displayName']));
            return;
        }
        foreach ($value as $item) {
            $extractNamed($item);
        }
    };
    $walk = static function (mixed $value) use (&$walk, $extractNamed): void {
        if (!is_array($value)) {
            return;
        }
        if (array_is_list($value)) {
            $extractNamed($value);
            return;
        }
        foreach ($value as $key => $item) {
            if (in_array(strtolower((string) $key), ['proxies', 'nodes', 'servers', 'outbounds'], true)) {
                $extractNamed($item);
            }
        }
    };

    foreach ($payloads as $payload) {
        $json = json_decode($payload, true);
        if (is_array($json)) {
            $walk($json);
        }
        $inProxies = false;
        foreach (preg_split('/\R/u', $payload) ?: [] as $line) {
            if (preg_match('/^proxies\s*:/iu', $line)) {
                $inProxies = true;
                if (preg_match('/^proxies\s*:\s*\[([^\]]+)\]/iu', $line, $listMatch)) {
                    foreach (preg_split('/\s*,\s*/u', $listMatch[1]) ?: [] as $name) {
                        $add(route_manager_node_candidate($name));
                    }
                }
                continue;
            }
            if ($inProxies && preg_match('/^[A-Za-z_][A-Za-z0-9_-]*\s*:/u', $line)) {
                $inProxies = false;
            }
            if ($inProxies && preg_match('/^\s*-\s*(?:name|display_name)\s*:\s*(.+?)\s*$/iu', $line, $nameMatch)) {
                $add(route_manager_node_candidate($nameMatch[1]));
            }
        }
        if (preg_match_all("~(?:vmess|vless|trojan|ss|ssr|hysteria|hysteria2|tuic|socks5|socks):\/\/[^\s\"'<>]+~iu", $payload, $matches)) {
            foreach ($matches[0] as $uri) {
                $parts = parse_url($uri);
                $name = isset($parts['fragment']) ? urldecode($parts['fragment']) : '';
                if ($name === '' && stripos($uri, 'vmess://') === 0) {
                    $vmess = base64_decode(substr($uri, strlen('vmess://')), true);
                    $vmessData = $vmess !== false ? json_decode($vmess, true) : null;
                    $name = is_array($vmessData) ? (string) ($vmessData['ps'] ?? '') : '';
                }
                $add(route_manager_node_candidate($name));
            }
        }
        if (class_exists('DOMDocument') && strlen($payload) <= 2 * 1024 * 1024 && stripos($payload, '<table') !== false) {
            $previous = libxml_use_internal_errors(true);
            $document = new DOMDocument();
            $loaded = $document->loadHTML('<?xml encoding="utf-8" ?>' . $payload, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
            if ($loaded) {
                foreach ($document->getElementsByTagName('table') as $table) {
                    foreach ($table->getElementsByTagName('tr') as $row) {
                        $cells = [];
                        $hasHeader = false;
                        foreach ($row->childNodes as $cell) {
                            if (!$cell instanceof DOMElement || !in_array(strtolower($cell->tagName), ['th', 'td'], true)) {
                                continue;
                            }
                            $hasHeader = $hasHeader || strtolower($cell->tagName) === 'th';
                            $cells[] = trim((string) preg_replace('/\s+/u', ' ', $cell->textContent));
                        }
                        if ($hasHeader || count($cells) < 2 || !preg_match('/^\d+$/u', $cells[0])) {
                            continue;
                        }
                        $metadata = [];
                        if (count($cells) >= 5) {
                            $metadata = [
                                'reachability' => $cells[2],
                                'status' => $cells[3],
                                'lastSeen' => $cells[4],
                            ];
                        }
                        $add(route_manager_node_candidate($cells[1], $metadata));
                    }
                }
            }
        }
    }
    return array_values($found);
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
