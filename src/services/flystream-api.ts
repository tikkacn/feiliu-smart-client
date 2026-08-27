import { fetch } from '@tauri-apps/plugin-http'

import {
  FlystreamApiError,
  type FlystreamManifest,
  type FlystreamNetworkResolution,
  type FlystreamPolicy,
  type FlystreamRulesManifest,
} from '@/types/flystream'

const baseUrl = (import.meta.env.VITE_FEILIU_API_BASE_URL || '').replace(
  /\/$/,
  '',
)
const clientToken = import.meta.env.VITE_FEILIU_CLIENT_TOKEN || ''
const manifestCacheKey = 'feiliu-smart-client:manifest'
const rulesManifestCacheKey = 'feiliu-smart-client:rules-manifest'

export const isFlystreamApiConfigured = Boolean(baseUrl)

export async function getFlystreamManifest(): Promise<FlystreamManifest> {
  const cached = readCache<FlystreamManifest>(manifestCacheKey)
  const headers = buildHeaders()
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag
  }

  const response = await request('/v1/client/manifest', headers)
  if (response.status === 304 && cached?.data) {
    return { ...cached.data, stale: false }
  }

  const data = await parseJson<FlystreamManifest>(response)
  writeCache(manifestCacheKey, data, response.headers.get('etag') ?? undefined)
  return data
}

export async function getFlystreamPolicy(
  version: string,
): Promise<FlystreamPolicy> {
  const cacheKey = `feiliu-smart-client:policy:${version}`
  try {
    const response = await request(
      `/v1/client/policy/${encodeURIComponent(version)}`,
      buildHeaders(),
    )
    const data = await parseJson<FlystreamPolicy>(response)
    writeCache(cacheKey, data)
    return data
  } catch (error) {
    const cached = readCache<FlystreamPolicy>(cacheKey)?.data
    if (cached) {
      return { ...cached, status: `${cached.status}:stale` }
    }
    throw error
  }
}

export async function getFlystreamRulesManifest(): Promise<FlystreamRulesManifest> {
  try {
    const response = await request('/v1/client/rules/manifest', buildHeaders())
    const data = await parseJson<FlystreamRulesManifest>(response)
    writeCache(rulesManifestCacheKey, data)
    return data
  } catch (error) {
    const cached = readCache<FlystreamRulesManifest>(
      rulesManifestCacheKey,
    )?.data
    if (cached) {
      return cached
    }
    throw error
  }
}

export async function resolveFlystreamNetwork(input: {
  asn: number
  isp: string
}): Promise<FlystreamNetworkResolution> {
  const response = await request(
    '/v1/client/network/resolve',
    {
      ...buildHeaders(),
      'Content-Type': 'application/json',
    },
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  return parseJson<FlystreamNetworkResolution>(response)
}

export function getCachedFlystreamManifest() {
  return readCache<FlystreamManifest>(manifestCacheKey)?.data
}

export function getFlystreamApiBaseUrl() {
  return baseUrl
}

async function request(
  path: string,
  headers: Record<string, string>,
  init: RequestInit = {},
) {
  if (!isFlystreamApiConfigured) {
    throw new FlystreamApiError('NOT_CONFIGURED', '飞流控制面 API 尚未配置')
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method || 'GET',
      headers,
      connectTimeout: 5000,
      body: init.body,
    })
    if (!response.ok && response.status !== 304) {
      throw new FlystreamApiError(
        response.status === 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
        `控制面 API 返回 ${response.status}`,
      )
    }
    return response
  } catch (error) {
    if (error instanceof FlystreamApiError) {
      throw error
    }
    throw new FlystreamApiError('NETWORK_ERROR', '控制面 API 暂时不可用')
  }
}

async function parseJson<T>(response: Response) {
  try {
    return (await response.json()) as T
  } catch {
    throw new FlystreamApiError('INVALID_RESPONSE', '控制面 API 响应格式无效')
  }
}

function buildHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (clientToken) {
    headers.Authorization = `Bearer ${clientToken}`
  }
  return headers
}

function readCache<T>(key: string): { data: T; etag?: string } | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { data: T; etag?: string }) : undefined
  } catch {
    return undefined
  }
}

function writeCache<T>(key: string, data: T, etag?: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, etag }))
  } catch {
    // Cache failure must not affect the normal client path.
  }
}
