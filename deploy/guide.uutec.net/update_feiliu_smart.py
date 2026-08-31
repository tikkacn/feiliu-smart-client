#!/usr/bin/env python3
import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path

from software_sync_common import (
    DB_PATH,
    R2_BUCKET,
    create_r2_client,
    download_file,
    ensure_base_dirs,
    fetch_json,
    finish_permissions,
    head_r2_object,
    normalize_sha256_digest,
    public_download_url,
    sha256_file,
    to_local_time,
    upload_file_to_r2,
    write_meta,
)

API_URL = 'https://api.github.com/repos/tikkacn/feiliu-smart-client/releases/latest'
GITHUB_REPO = 'tikkacn/feiliu-smart-client'
DOWNLOAD_DIR = Path('/www/wwwroot/guide.uutec.net/public/downloads')
SYNC_DIR = Path('/www/wwwroot/guide.uutec.net/data/software-sync')
META_PATH = SYNC_DIR / 'feiliu-smart.json'
MANIFEST_PATH = SYNC_DIR / 'feiliu-smart-latest.json'
MANIFEST_OBJECT = 'feiliu-smart/latest.json'

ASSET_SPECS = {
    'windows-x86_64': {
        'pattern': re.compile(r'^Clash\.Verge_[0-9][0-9A-Za-z.+-]*_x64-setup\.exe$'),
        'file': DOWNLOAD_DIR / 'feiliu-smart-windows-x64.exe',
        'object': 'feiliu-smart/feiliu-smart-windows-x64.exe',
        'slug': 'feiliu-smart-windows-x64',
        'title': '飞流 Smart 客户端（Windows 备选）',
        'summary': '功能较多，作为 Windows 64 位备选客户端下载。',
        'platform': 'Windows 64 位',
        'content': '仅建议具备一定学习能力和软件配置经验的老手使用。客户端不会自动升级，请在软件内手动检查更新。',
        'sort_order': 5,
    },
    'darwin-x86_64': {
        'pattern': re.compile(r'^Clash\.Verge_[0-9][0-9A-Za-z.+-]*_x64\.dmg$'),
        'file': DOWNLOAD_DIR / 'feiliu-smart-macos-x64.dmg',
        'object': 'feiliu-smart/feiliu-smart-macos-x64.dmg',
        'slug': 'feiliu-smart-macos-x64',
        'title': '飞流 Smart 客户端（macOS Intel 备选）',
        'summary': '适用于 Intel 芯片 Mac 的备选客户端。',
        'platform': 'macOS 11+（Intel 芯片）',
        'content': '该版本未测试，请谨慎下载使用。macOS 可能显示开发者验证或安全提示，请先核实下载来源。客户端不会自动升级，请在软件内手动检查更新。',
        'sort_order': 6,
    },
    'darwin-aarch64': {
        'pattern': re.compile(r'^Clash\.Verge_[0-9][0-9A-Za-z.+-]*_aarch64\.dmg$'),
        'file': DOWNLOAD_DIR / 'feiliu-smart-macos-arm64.dmg',
        'object': 'feiliu-smart/feiliu-smart-macos-arm64.dmg',
        'slug': 'feiliu-smart-macos-arm64',
        'title': '飞流 Smart 客户端（macOS Apple 芯片备选）',
        'summary': '适用于 M 系列 Apple 芯片 Mac 的备选客户端。',
        'platform': 'macOS 11+（Apple 芯片）',
        'content': '该版本未测试，请谨慎下载使用。macOS 可能显示开发者验证或安全提示，请先核实下载来源。客户端不会自动升级，请在软件内手动检查更新。',
        'sort_order': 7,
    },
}


def load_previous_meta():
    if not META_PATH.exists():
        return {}
    try:
        return json.loads(META_PATH.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def select_assets(release):
    selected = {}
    for platform, spec in ASSET_SPECS.items():
        matches = [
            asset
            for asset in release.get('assets', [])
            if spec['pattern'].match(asset.get('name', ''))
        ]
        if len(matches) != 1:
            raise SystemExit(
                'expected one asset for {}, found {} using {}'.format(
                    platform, len(matches), spec['pattern'].pattern
                )
            )
        selected[platform] = matches[0]
    return selected


def asset_identity(asset):
    return {
        'id': asset.get('id'),
        'name': asset.get('name', ''),
        'url': asset.get('browser_download_url', ''),
        'size': int(asset.get('size') or 0),
        'updated_at': asset.get('updated_at', ''),
        'digest': normalize_sha256_digest(asset.get('digest')),
    }


def sync_asset(platform, spec, asset, previous):
    identity = asset_identity(asset)
    if not identity['url'] or not identity['size']:
        raise RuntimeError('release asset is incomplete: {}'.format(identity['name']))

    old_identity = previous.get('assets', {}).get(platform, {}).get('identity', {})
    local_matches = spec['file'].exists() and spec['file'].stat().st_size == identity['size']
    if local_matches and old_identity != identity:
        local_matches = bool(identity['digest']) and (
            'sha256:' + sha256_file(spec['file']) == identity['digest']
        )

    downloaded = not local_matches
    if downloaded:
        download_file(
            identity['url'],
            spec['file'],
            expected_size=identity['size'],
            expected_digest=identity['digest'],
        )
        finish_permissions(spec['file'])

    remote = head_r2_object(spec['object'])
    remote_matches = remote and int(remote.get('ContentLength', -1)) == identity['size']
    if downloaded or not remote_matches:
        upload_file_to_r2(spec['file'], spec['object'])

    sha256 = sha256_file(spec['file'])
    return {
        'identity': identity,
        'downloaded': downloaded,
        'sha256': sha256,
        'url': public_download_url(spec['object'], identity['updated_at']),
    }


def upload_manifest(manifest):
    payload = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
    temporary = MANIFEST_PATH.with_name(MANIFEST_PATH.name + '.tmp')
    temporary.write_bytes(payload)
    temporary.replace(MANIFEST_PATH)
    finish_permissions(MANIFEST_PATH)

    client = create_r2_client()
    client.put_object(
        Bucket=R2_BUCKET,
        Key=MANIFEST_OBJECT,
        Body=payload,
        ContentLength=len(payload),
        ContentType='application/json; charset=utf-8',
        CacheControl='no-cache, no-store, must-revalidate',
    )
    head = head_r2_object(MANIFEST_OBJECT, client=client)
    if not head or int(head.get('ContentLength', -1)) != len(payload):
        raise RuntimeError('R2 manifest upload verification failed')


def update_software_records(release, synced_assets):
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    published_at = to_local_time(release.get('published_at', ''))
    connection = sqlite3.connect(DB_PATH)
    try:
        cursor = connection.cursor()
        for platform, spec in ASSET_SPECS.items():
            values = (
                spec['title'],
                spec['summary'],
                spec['platform'],
                GITHUB_REPO,
                release.get('tag_name', ''),
                release.get('html_url', ''),
                published_at,
                synced_assets[platform]['url'],
                spec['content'],
                spec['sort_order'],
                now,
            )
            cursor.execute('SELECT id FROM software WHERE slug=?', (spec['slug'],))
            row = cursor.fetchone()
            if row:
                cursor.execute(
                    'UPDATE software SET title=?, summary=?, platform=?, github_repo=?, '
                    'release_name=?, release_url=?, release_published_at=?, download_url=?, '
                    'content=?, sort_order=?, is_published=1, updated_at=? WHERE id=?',
                    values + (row[0],),
                )
            else:
                cursor.execute(
                    'INSERT INTO software (title, slug, summary, platform, github_repo, '
                    'release_name, release_url, release_published_at, download_url, content, '
                    'is_published, sort_order, created_at, updated_at) '
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
                    (
                        spec['title'],
                        spec['slug'],
                        spec['summary'],
                        spec['platform'],
                        GITHUB_REPO,
                        release.get('tag_name', ''),
                        release.get('html_url', ''),
                        published_at,
                        synced_assets[platform]['url'],
                        spec['content'],
                        spec['sort_order'],
                        now,
                        now,
                    ),
                )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main():
    ensure_base_dirs()
    release = fetch_json(API_URL)
    if release.get('draft') or release.get('prerelease'):
        raise SystemExit('latest release must be a published stable release')

    tag_name = release.get('tag_name', '')
    version = tag_name.lstrip('vV')
    if not re.match(r'^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$', version):
        raise SystemExit('unsupported release version: {}'.format(tag_name))

    previous = load_previous_meta()
    selected = select_assets(release)
    synced_assets = {
        platform: sync_asset(platform, spec, selected[platform], previous)
        for platform, spec in ASSET_SPECS.items()
    }

    manifest = {
        'schema_version': 1,
        'version': version,
        'notes': (release.get('body') or '飞流 Smart 客户端更新。').strip(),
        'pub_date': release.get('published_at', ''),
        'release_url': release.get('html_url', ''),
        'platforms': {
            platform: {
                'url': data['url'],
                'sha256': data['sha256'],
                'size': data['identity']['size'],
            }
            for platform, data in synced_assets.items()
        },
    }

    upload_manifest(manifest)
    update_software_records(release, synced_assets)
    meta = {
        'tag_name': tag_name,
        'html_url': release.get('html_url', ''),
        'published_at': release.get('published_at', ''),
        'synced_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'assets': synced_assets,
        'manifest_object': MANIFEST_OBJECT,
    }
    write_meta(META_PATH, meta)
    finish_permissions(META_PATH)
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    main()
