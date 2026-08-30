import { beforeEach, describe, expect, it, vi } from 'vitest'

import { version } from '@root/package.json'

const { fetchMock, systemMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  systemMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }))
vi.mock('@/services/cmds', () => ({ getSystemInfo: systemMock }))

import { checkUpdateSafe, resolveUpdatePlatform } from './update'

describe('resolveUpdatePlatform', () => {
  it('selects the Windows x64 package', () => {
    expect(resolveUpdatePlatform('Windows', 'x86_64')).toBe('windows-x86_64')
  })

  it('selects both supported macOS architectures', () => {
    expect(resolveUpdatePlatform('macOS', 'aarch64')).toBe('darwin-aarch64')
    expect(resolveUpdatePlatform('Darwin', 'x86_64')).toBe('darwin-x86_64')
  })

  it('rejects unsupported platforms', () => {
    expect(() => resolveUpdatePlatform('Linux', 'x86_64')).toThrow()
  })
})

describe('manual update manifest', () => {
  const manifest = {
    version: '999.0.0',
    notes: 'A verified custom release',
    platforms: {
      'windows-x86_64': {
        url: 'https://soft.uutec.net/feiliu-smart/feiliu-smart-windows-x64.exe?v=1',
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    systemMock.mockResolvedValue({
      system_name: 'Windows',
      system_arch: 'x86_64',
    })
    fetchMock.mockResolvedValue({ ok: true, json: async () => manifest })
  })

  it('checks only the owned manifest and selects the owned installer URL', async () => {
    const update = await checkUpdateSafe()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/soft\.uutec\.net\/feiliu-smart\/latest\.json\?t=/,
      ),
      expect.any(Object),
    )
    expect(update?.downloadUrl).toBe(manifest.platforms['windows-x86_64'].url)
  })

  it('does not offer equal or older versions', async () => {
    for (const remoteVersion of [version, '0.0.1']) {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ...manifest, version: remoteVersion }),
      })
      expect(await checkUpdateSafe()).toBeNull()
    }
  })

  it('rejects installer links outside the owned HTTPS distribution path', async () => {
    for (const url of [
      'https://github.com/clash-verge-rev/clash-verge-rev/releases/latest',
      'http://soft.uutec.net/feiliu-smart/client.exe',
      'https://soft.uutec.net/unrelated/client.exe',
    ]) {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...manifest,
          platforms: { 'windows-x86_64': { url } },
        }),
      })
      await expect(checkUpdateSafe()).rejects.toThrow('无效的下载地址')
    }
  })

  it('reports a missing package or HTTP failure rather than claiming latest', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    await expect(checkUpdateSafe()).rejects.toThrow('HTTP 503')
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ...manifest, platforms: {} }),
    })
    await expect(checkUpdateSafe()).rejects.toThrow('暂未提供当前平台安装包')
  })
})
