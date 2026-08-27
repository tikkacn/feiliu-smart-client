import { createHash } from 'node:crypto'

export { classifyOperator, defaultOperatorRules } from './operator.mjs'

const operators = ['telecom', 'unicom', 'mobile', 'unknown']
const businesses = [
  'general',
  'github',
  'google',
  'docker',
  'telegram',
  'microsoft',
  'apple',
  'openai',
  'claude',
  'gemini',
  'netflix',
  'disney-plus',
  'tiktok',
  'youtube',
]

const defaultPolicies = Object.fromEntries(
  businesses.map((business) => [
    business,
    {
      mode: business === 'general' ? 'url-test' : 'fallback',
      candidateTags: [],
      fallbackTags: [],
      healthCheckUrl:
        business === 'general'
          ? 'https://www.gstatic.com/generate_204'
          : undefined,
      enabled: true,
    },
  ]),
)

export function buildPolicy({
  nodes,
  routeMetadata = {},
  operatorScores = {},
  capabilities = {},
  businessPolicies = {},
  rulesVersion = 'unknown',
  now = new Date(),
  version,
}) {
  const generatedAt = new Date(now).toISOString()
  const policyNodes = nodes
    .map((node, sourceOrder) =>
      buildPolicyNode(
        node,
        sourceOrder,
        routeMetadata[node.sourceNodeKey] || node.route,
        operatorScores[node.sourceNodeKey] || node.operatorScores,
        capabilities[node.sourceNodeKey] || node.capabilities,
      ),
    )
    .filter((node) => node.enabled)

  if (policyNodes.length === 0) {
    throw new Error('strategy engine cannot publish an empty node catalog')
  }

  const pools = []
  for (const operator of operators) {
    const generalCandidates = selectCandidates({
      nodes: policyNodes,
      operator,
      business: 'general',
      policy: mergedBusinessPolicy(businessPolicies, 'general'),
    })

    for (const business of businesses) {
      const policy = mergedBusinessPolicy(businessPolicies, business)
      if (policy.enabled === false) {
        continue
      }

      const candidates = selectCandidates({
        nodes: policyNodes,
        operator,
        business,
        policy,
      })
      const selected = candidates.length > 0 ? candidates : generalCandidates
      if (selected.length === 0) {
        continue
      }

      const fallbackCandidates = selectFallbackCandidates(
        selected,
        generalCandidates,
        policy,
      )
      pools.push({
        id: `${operator}-${business}`,
        business,
        mode: policy.mode,
        nodeIds: selected.map((node) => node.id),
        fallbackNodeIds: fallbackCandidates.map((node) => node.id),
        ...(policy.healthCheckUrl
          ? { healthCheckUrl: policy.healthCheckUrl }
          : {}),
      })
    }
  }

  const publicPolicyNodes = policyNodes.map(({ sourceOrder, ...node }) => node)
  const basePolicy = {
    version:
      version ||
      `policy-${generatedAt.slice(0, 10)}-${shortHash({
        policyNodes,
        pools,
        rulesVersion,
      })}`,
    status: 'validated',
    generatedAt,
    operator: 'unknown',
    rulesVersion,
    nodes: publicPolicyNodes,
    pools,
  }
  const contentHash = `sha256:${sha256(stableStringify(basePolicy))}`
  return {
    ...basePolicy,
    contentHash,
  }
}

export function validatePolicy(policy) {
  const errors = []
  const nodeIds = new Set()

  if (!Array.isArray(policy?.nodes) || policy.nodes.length === 0) {
    errors.push('policy has no nodes')
  }
  if (!Array.isArray(policy?.pools) || policy.pools.length === 0) {
    errors.push('policy has no pools')
  }

  for (const node of policy?.nodes || []) {
    if (nodeIds.has(node.id)) {
      errors.push(`duplicate node id: ${node.id}`)
    }
    nodeIds.add(node.id)
    if (!node.displayName) {
      errors.push(`node ${node.id} has no display name`)
    }
    if (containsSensitiveKey(node)) {
      errors.push(`node ${node.id} contains sensitive fields`)
    }
  }

  for (const pool of policy?.pools || []) {
    if (!pool || typeof pool !== 'object') {
      errors.push('pool must be an object')
      continue
    }
    if (!Array.isArray(pool.nodeIds)) {
      errors.push(`pool ${pool.id || 'unknown'} has no nodeIds`)
      continue
    }
    if (pool.nodeIds.length === 0) {
      errors.push(`pool ${pool.id} is empty`)
    }
    if (!Array.isArray(pool.fallbackNodeIds)) {
      errors.push(`pool ${pool.id || 'unknown'} has no fallbackNodeIds`)
      continue
    }
    if (pool.fallbackNodeIds.length === 0) {
      errors.push(`pool ${pool.id} has no fallback`)
    }
    for (const id of [...pool.nodeIds, ...pool.fallbackNodeIds]) {
      if (!nodeIds.has(id)) {
        errors.push(`pool ${pool.id} references unknown node ${id}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

function buildPolicyNode(node, sourceOrder, route, scoreMap, capabilityList) {
  const capabilities = normalizeCapabilities(capabilityList)
  const normalizedRoute = {
    routeTypes: route?.routeTypes || [],
    region: route?.region || 'unknown',
    ipv6: Boolean(route?.ipv6),
    confidence: clamp(route?.confidence ?? 0.5),
  }

  return {
    id: node.sourceNodeKey || node.id || `node-${sourceOrder}`,
    displayName: node.displayName || node.name || `Node-${sourceOrder + 1}`,
    protocol: node.protocol || 'unknown',
    enabled: node.enabled !== false,
    route: normalizedRoute,
    operatorScores: normalizeScores(scoreMap),
    capabilities,
    sourceOrder,
  }
}

function selectCandidates({ nodes, operator, business, policy }) {
  const candidates = nodes
    .filter((node) => matchesTags(node.route.routeTypes, policy.candidateTags))
    .filter((node) => supportsBusiness(node, business))
    .map((node) => ({
      node,
      score: scoreNode(node, operator, business),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.node.sourceOrder - right.node.sourceOrder,
    )

  return candidates.map(({ node }) => node)
}

function selectFallbackCandidates(selected, generalCandidates, policy) {
  const fallbackPool = policy.fallbackTags.length
    ? generalCandidates.filter((node) =>
        matchesTags(node.route.routeTypes, policy.fallbackTags),
      )
    : generalCandidates
  const fallback = fallbackPool.length > 0 ? fallbackPool : selected
  return fallback.slice(0, Math.max(1, Math.min(3, fallback.length)))
}

function supportsBusiness(node, business) {
  if (business === 'general') {
    return true
  }

  const capability = node.capabilities.find(
    (item) => item.business === business,
  )
  return capability?.supported === true && capability.score > 0
}

function scoreNode(node, operator, business) {
  const operatorScore =
    node.operatorScores[operator] ?? node.operatorScores.unknown ?? 0.5
  const capability = node.capabilities.find(
    (item) => item.business === business,
  )
  const capabilityScore = business === 'general' ? 1 : capability?.score || 0
  return (
    operatorScore * 0.6 + capabilityScore * 0.25 + node.route.confidence * 0.15
  )
}

function mergedBusinessPolicy(policies, business) {
  const override = Array.isArray(policies)
    ? policies.find((item) => item.business === business)
    : policies[business]
  return {
    ...defaultPolicies[business],
    ...override,
    candidateTags: normalizeTags(override?.candidateTags),
    fallbackTags: normalizeTags(override?.fallbackTags),
  }
}

function normalizeCapabilities(capabilities) {
  if (Array.isArray(capabilities)) {
    return capabilities.map((item) => ({
      business: item.business,
      supported: Boolean(item.supported),
      score: clamp(item.score ?? 0),
      verifiedAt: item.verifiedAt || new Date(0).toISOString(),
    }))
  }
  return Object.entries(capabilities || {}).map(([business, value]) => ({
    business,
    supported: Boolean(value?.supported ?? value),
    score: clamp(value?.score ?? (value ? 1 : 0)),
    verifiedAt: value?.verifiedAt || new Date(0).toISOString(),
  }))
}

function normalizeScores(scores) {
  return Object.fromEntries(
    Object.entries(scores || {}).map(([operator, score]) => [
      operator,
      clamp(score),
    ]),
  )
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.map(String) : []
}

function matchesTags(nodeTags, expectedTags) {
  if (expectedTags.length === 0) {
    return true
  }
  const normalized = nodeTags.map((tag) => tag.toLowerCase())
  return expectedTags.some((tag) =>
    normalized.includes(String(tag).toLowerCase()),
  )
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function containsSensitiveKey(value) {
  return Object.entries(value || {}).some(([key, child]) => {
    if (/(password|secret|token|private.?key)/i.test(key)) {
      return true
    }
    return child && typeof child === 'object'
      ? containsSensitiveKey(child)
      : false
  })
}

function shortHash(value) {
  return sha256(stableStringify(value)).slice(0, 8)
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
