<?php

declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    route_manager_json(['ok' => true]);
}

if ($action === 'login' && $method === 'POST') {
    $data = route_manager_input();
    $username = trim((string) ($data['username'] ?? ''));
    $password = (string) ($data['password'] ?? '');
    $statement = $database->prepare('SELECT id, username, password_hash FROM admin_users WHERE username = :username LIMIT 1');
    $statement->execute([':username' => $username]);
    $user = $statement->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        usleep(250000);
        route_manager_json(['error' => '用户名或密码错误'], 401);
    }
    session_regenerate_id(true);
    $_SESSION['route_manager_user'] = ['id' => (int) $user['id'], 'username' => $user['username']];
    $_SESSION['route_manager_csrf'] = bin2hex(random_bytes(24));
    route_manager_json([
        'user' => $_SESSION['route_manager_user'],
        'csrfToken' => $_SESSION['route_manager_csrf'],
    ]);
}

if ($action === 'logout' && $method === 'POST') {
    route_manager_require_auth(true);
    $_SESSION = [];
    session_destroy();
    route_manager_json(['ok' => true]);
}

if ($action === 'me' && $method === 'GET') {
    route_manager_require_auth();
    route_manager_json([
        'user' => $_SESSION['route_manager_user'],
        'csrfToken' => $_SESSION['route_manager_csrf'],
    ]);
}

if ($action === 'manifest' && $method === 'GET') {
    route_manager_json(route_manager_manifest($database));
}

if ($action === 'nodes' && $method === 'GET') {
    route_manager_require_auth();
    route_manager_json(['nodes' => $database->query('SELECT id, display_name AS displayName, match_key AS matchKey, category, enabled, notes, created_at AS createdAt, updated_at AS updatedAt FROM nodes ORDER BY updated_at DESC, id DESC')->fetchAll()]);
}

if ($action === 'save-node' && $method === 'POST') {
    route_manager_require_auth(true);
    $data = route_manager_input();
    $displayName = trim((string) ($data['displayName'] ?? ''));
    $matchKey = route_manager_normalize_key((string) ($data['matchKey'] ?? $displayName));
    $category = (string) ($data['category'] ?? '');
    $notes = trim((string) ($data['notes'] ?? ''));
    $enabled = !empty($data['enabled']) ? 1 : 0;
    if ($displayName === '' || $matchKey === '' || !in_array($category, route_manager_categories(), true)) {
        route_manager_json(['error' => '节点名称、匹配名称和线路分类不能为空'], 422);
    }
    $now = gmdate('c');
    $id = isset($data['id']) && $data['id'] !== '' ? (int) $data['id'] : null;
    if ($id) {
        $statement = $database->prepare('UPDATE nodes SET display_name = :display_name, match_key = :match_key, category = :category, enabled = :enabled, notes = :notes, updated_at = :updated_at WHERE id = :id');
        try {
            $statement->execute([
                ':display_name' => $displayName,
                ':match_key' => $matchKey,
                ':category' => $category,
                ':enabled' => $enabled,
                ':notes' => $notes,
                ':updated_at' => $now,
                ':id' => $id,
            ]);
        } catch (PDOException $error) {
            route_manager_json(['error' => str_contains($error->getMessage(), 'UNIQUE') ? '匹配名称已经存在' : '保存节点失败'], 422);
        }
    } else {
        $statement = $database->prepare('INSERT INTO nodes (display_name, match_key, category, enabled, notes, created_at, updated_at) VALUES (:display_name, :match_key, :category, :enabled, :notes, :created_at, :updated_at)');
        try {
            $statement->execute([
                ':display_name' => $displayName,
                ':match_key' => $matchKey,
                ':category' => $category,
                ':enabled' => $enabled,
                ':notes' => $notes,
                ':created_at' => $now,
                ':updated_at' => $now,
            ]);
        } catch (PDOException $error) {
            route_manager_json(['error' => str_contains($error->getMessage(), 'UNIQUE') ? '匹配名称已经存在' : '保存节点失败'], 422);
        }
    }
    route_manager_json(['ok' => true]);
}

if ($action === 'delete-node' && $method === 'POST') {
    route_manager_require_auth(true);
    $id = (int) (route_manager_input()['id'] ?? 0);
    $statement = $database->prepare('DELETE FROM nodes WHERE id = :id');
    $statement->execute([':id' => $id]);
    route_manager_json(['ok' => true]);
}

if ($action === 'bulk-import' && $method === 'POST') {
    route_manager_require_auth(true);
    $text = (string) (route_manager_input()['text'] ?? '');
    $rows = preg_split('/\R/u', $text) ?: [];
    $now = gmdate('c');
    $saved = 0;
    $database->beginTransaction();
    try {
        foreach ($rows as $row) {
            $row = trim($row);
            if ($row === '' || str_starts_with($row, '#')) {
                continue;
            }
            $parts = preg_split('/\s*[|\t,]\s*/u', $row, 2);
            if (count($parts) !== 2) {
                continue;
            }
            [$displayName, $category] = array_map('trim', $parts);
            $matchKey = route_manager_normalize_key($displayName);
            if ($matchKey === '' || !in_array($category, route_manager_categories(), true)) {
                continue;
            }
            $statement = $database->prepare(<<<'SQL'
INSERT INTO nodes (display_name, match_key, category, enabled, notes, created_at, updated_at)
VALUES (:display_name, :match_key, :category, 1, '', :created_at, :updated_at)
ON CONFLICT(match_key) DO UPDATE SET display_name = excluded.display_name, category = excluded.category, enabled = 1, updated_at = excluded.updated_at
SQL);
            $statement->execute([
                ':display_name' => $displayName,
                ':match_key' => $matchKey,
                ':category' => $category,
                ':created_at' => $now,
                ':updated_at' => $now,
            ]);
            $saved++;
        }
        $database->commit();
    } catch (Throwable $error) {
        if ($database->inTransaction()) {
            $database->rollBack();
        }
        route_manager_json(['error' => '批量导入失败'], 422);
    }
    route_manager_json(['saved' => $saved]);
}

if ($action === 'publish' && $method === 'POST') {
    route_manager_require_auth(true);
    $nodes = $database->query('SELECT match_key, category FROM nodes WHERE enabled = 1 ORDER BY id ASC')->fetchAll();
    $nextVersion = (int) ($database->query('SELECT COALESCE(MAX(version), 0) + 1 FROM publish_versions')->fetchColumn());
    $createdAt = gmdate('c');
    $payload = json_encode([
        'schemaVersion' => ROUTE_MANAGER_SCHEMA_VERSION,
        'version' => $nextVersion,
        'updatedAt' => $createdAt,
        'nodes' => array_map(static fn (array $node): array => ['matchKey' => $node['match_key'], 'category' => $node['category']], $nodes),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $database->beginTransaction();
    try {
        $versionStatement = $database->prepare('INSERT INTO publish_versions (version, checksum, node_count, created_at) VALUES (:version, :checksum, :node_count, :created_at)');
        $versionStatement->execute([
            ':version' => $nextVersion,
            ':checksum' => hash('sha256', $payload),
            ':node_count' => count($nodes),
            ':created_at' => $createdAt,
        ]);
        $versionId = (int) $database->lastInsertId();
        $itemStatement = $database->prepare('INSERT INTO publish_items (version_id, match_key, category) VALUES (:version_id, :match_key, :category)');
        foreach ($nodes as $node) {
            $itemStatement->execute([':version_id' => $versionId, ':match_key' => $node['match_key'], ':category' => $node['category']]);
        }
        $database->commit();
    } catch (Throwable $error) {
        if ($database->inTransaction()) {
            $database->rollBack();
        }
        route_manager_json(['error' => '发布分类配置失败'], 500);
    }
    try {
        $manifest = route_manager_write_manifest($database);
    } catch (Throwable $error) {
        route_manager_json(['error' => '分类已保存，但发布文件写入失败'], 500);
    }
    route_manager_json(['manifest' => $manifest]);
}

if ($action === 'history' && $method === 'GET') {
    route_manager_require_auth();
    route_manager_json(['versions' => $database->query('SELECT version, checksum, node_count AS nodeCount, created_at AS createdAt FROM publish_versions ORDER BY version DESC LIMIT 30')->fetchAll()]);
}

route_manager_json(['error' => 'not found'], 404);
