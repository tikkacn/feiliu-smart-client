import { fetch } from '@tauri-apps/plugin-http'
import { compareVersions } from 'compare-versions'

import { getSystemInfo } from '@/services/cmds'
import { version as appVersion } from '@root/package.json'

const UPDATE_MANIFEST_URL = 'https://soft.uutec.net/feiliu-smart/latest.json'

export type UpdatePlatform =
  | 'windows-x86_64'
  | 'darwin-x86_64'
  | 'darwin-aarch64'

type UpdateAsset = {
  url: string
  sha256?: string
  size?: number
}

type UpdateManifest = {
  version: string
  notes?: string
  pub_date?: string
  release_url?: string
  platforms: Partial<Record<UpdatePlatform, UpdateAsset>>
}

export type FeiliuUpdate = {
  available: true
  version: string
  body: string
  date?: string
  downloadUrl: string
  releaseUrl?: string
  platform: UpdatePlatform
  sha256?: string
  size?: number
}

const normalizeVersion = (input: string): string =>
  input.trim().replace(/^v/i, '')

export const resolveUpdatePlatform = (
  systemName: string,
  systemArch: string,
): UpdatePlatform => {
  const name = systemName.toLowerCase()
  const arch = systemArch.toLowerCase()

  if (name.includes('windows')) {
    if (arch.includes('x86_64') || arch.includes('amd64') || arch === 'x64') {
      return 'windows-x86_64'
    }
    throw new Error(`暂不支持此 Windows 架构：${systemArch}`)
  }

  if (name.includes('mac') || name.includes('darwin')) {
    if (arch.includes('aarch64') || arch.includes('arm64')) {
      return 'darwin-aarch64'
    }
    if (arch.includes('x86_64') || arch.includes('amd64') || arch === 'x64') {
      return 'darwin-x86_64'
    }
    throw new Error(`暂不支持此 macOS 架构：${systemArch}`)
  }

  throw new Error(`当前系统暂不提供客户端更新：${systemName}`)
}

const validateDownloadUrl = (raw: string): string => {
  const url = new URL(raw)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'soft.uutec.net' ||
    !url.pathname.startsWith('/feiliu-smart/')
  ) {
    throw new Error('更新清单包含无效的下载地址')
  }
  return url.toString()
}

const parseManifest = (input: unknown): UpdateManifest => {
  if (!input || typeof input !== 'object') {
    throw new Error('更新清单格式无效')
  }
  const manifest = input as Partial<UpdateManifest>
  if (
    typeof manifest.version !== 'string' ||
    !manifest.version.trim() ||
    !manifest.platforms ||
    typeof manifest.platforms !== 'object'
  ) {
    throw new Error('更新清单缺少版本或平台信息')
  }
  return manifest as UpdateManifest
}

export const checkUpdateSafe = async (): Promise<FeiliuUpdate | null> => {
  const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`检查更新失败：HTTP ${response.status}`)
  }

  const manifest = parseManifest(await response.json())
  const remoteVersion = normalizeVersion(manifest.version)
  const localVersion = normalizeVersion(appVersion)
  if (compareVersions(remoteVersion, localVersion) <= 0) {
    return null
  }

  const system = await getSystemInfo()
  const platform = resolveUpdatePlatform(system.system_name, system.system_arch)
  const asset = manifest.platforms[platform]
  if (!asset?.url) {
    throw new Error(`新版本暂未提供当前平台安装包：${platform}`)
  }

  return {
    available: true,
    version: remoteVersion,
    body: manifest.notes?.trim() || '发现飞流 Smart 客户端新版本。',
    date: manifest.pub_date,
    downloadUrl: validateDownloadUrl(asset.url),
    releaseUrl: manifest.release_url,
    platform,
    sha256: asset.sha256,
    size: asset.size,
  }
}
