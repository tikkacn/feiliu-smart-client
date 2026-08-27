import { createHash } from 'node:crypto'

import * as yaml from 'js-yaml'

const defaultUserAgent = 'feiliu-smart-client-sync/0.1.0'

export async function fetchV2BoardSubscription({
  subscriptionUrl,
  token,
  sourceName = 'v2board',
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
}) {
  if (!subscriptionUrl) {
    throw new Error('v2board subscriptionUrl is required')
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is not available')
  }

  const headers = {
    accept: 'application/yaml, text/yaml, text/plain, */*',
    'user-agent': defaultUserAgent,
  }
  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    subscriptionUrl,
    { headers },
    timeoutMs,
  )
  if (!response.ok) {
    throw new Error(`v2board subscription request failed: ${response.status}`)
  }

  const text = await response.text()
  const document = yaml.load(text)
  return normalizeClashSubscription(document, sourceName)
}

export function normalizeClashSubscription(
  document,
  sourceName = 'subscription',
) {
  if (!document || !Array.isArray(document.proxies)) {
    throw new Error('subscription payload does not contain a proxies array')
  }

  const nodes = document.proxies
    .map((proxy, index) => normalizeProxy(proxy, sourceName, index))
    .filter(Boolean)

  if (nodes.length === 0) {
    throw new Error('subscription payload contains no usable proxies')
  }

  return {
    sourceType: 'v2board',
    sourceName,
    nodes,
    inputHash: hashValue(nodes),
  }
}

export async function fetchBlackmatrix7Rules({
  sourceUrl,
  fetchImpl = globalThis.fetch,
  headers = {},
  timeoutMs = 30000,
}) {
  if (!sourceUrl) {
    throw new Error('blackmatrix7 sourceUrl is required')
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is not available')
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    sourceUrl,
    {
      headers: {
        accept: 'text/plain, application/json, */*',
        'user-agent': defaultUserAgent,
        ...headers,
      },
    },
    timeoutMs,
  )
  if (!response.ok) {
    throw new Error(`blackmatrix7 request failed: ${response.status}`)
  }

  const content = await response.text()
  const digest = sha256(content)
  return {
    sourceType: 'blackmatrix7',
    sourceUrl,
    version: `blackmatrix7-${digest.slice(0, 12)}`,
    contentHash: `sha256:${digest}`,
    categories: extractRuleCategories(content, sourceUrl),
  }
}

export function extractRuleCategories(content, sourceUrl = '') {
  const categories = new Set()
  for (const line of String(content).split(/\r?\n/)) {
    const heading = line.match(/^\s*#\s*[-= ]*([A-Za-z][A-Za-z0-9 _+.-]{2,})/)
    if (heading) {
      categories.add(heading[1].trim().toLowerCase().replaceAll(' ', '-'))
    }
  }

  if (categories.size === 0) {
    const fileName = sourceUrl.split('/').pop()?.split('?')[0]
    if (fileName) {
      categories.add(fileName.replace(/\.[^.]+$/, '').toLowerCase())
    }
  }

  return [...categories].slice(0, 100)
}

export function hashValue(value) {
  return `sha256:${sha256(JSON.stringify(value))}`
}

function normalizeProxy(proxy, sourceName, index) {
  if (!proxy || typeof proxy !== 'object' || !proxy.name) {
    return null
  }

  const displayName = String(proxy.name)
  const sourceNodeKey = `${sourceName}:${displayName}`
  const address = [proxy.server, proxy.port, proxy.type]
    .filter((value) => value !== undefined && value !== null)
    .join('|')

  return {
    sourceNodeKey,
    displayName,
    protocol: String(proxy.type || 'unknown').toLowerCase(),
    addressHash: address ? `sha256:${sha256(address)}` : null,
    sourceOrder: index,
    enabled: true,
  }
}

async function fetchWithTimeout(fetchImpl, input, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}
