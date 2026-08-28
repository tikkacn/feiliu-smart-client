<?php

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$manifestPath = dirname(__DIR__) . '/storage/published.json';
$manifest = is_file($manifestPath) ? json_decode((string) file_get_contents($manifestPath), true) : null;
if (!is_array($manifest)) {
    $manifest = [
        'schemaVersion' => 1,
        'version' => 1,
        'updatedAt' => gmdate('c'),
        'nodes' => [],
    ];
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300, stale-while-revalidate=3600');
echo json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
