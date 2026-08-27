import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const policy = JSON.parse(
  readFileSync(resolve(root, 'policy/fixtures/policy.json'), 'utf8'),
)
const manifest = JSON.parse(
  readFileSync(resolve(root, 'policy/fixtures/manifest.json'), 'utf8'),
)

const fail = (message) => {
  throw new Error(`[policy-check] ${message}`)
}

const required = (value, path) => {
  if (value === undefined || value === null || value === '') {
    fail(`missing ${path}`)
  }
}

required(policy.version, 'policy.version')
required(policy.contentHash, 'policy.contentHash')
required(policy.status, 'policy.status')
required(policy.rulesVersion, 'policy.rulesVersion')
required(manifest.schemaVersion, 'manifest.schemaVersion')
required(manifest.activePolicyVersion, 'manifest.activePolicyVersion')

if (manifest.activePolicyVersion !== policy.version) {
  fail('manifest.activePolicyVersion must match policy.version')
}

const nodes = new Map()
for (const node of policy.nodes) {
  required(node.id, 'node.id')
  required(node.displayName, `node(${node.id}).displayName`)
  if (nodes.has(node.id)) {
    fail(`duplicate node id: ${node.id}`)
  }
  nodes.set(node.id, node)
  if (!Array.isArray(node.route?.routeTypes)) {
    fail(`node(${node.id}).route.routeTypes must be an array`)
  }
  if (node.route.confidence < 0 || node.route.confidence > 1) {
    fail(`node(${node.id}).route.confidence must be between 0 and 1`)
  }
}

const sensitiveFieldPattern = /(password|secret|token|private.?key|uuid)/i
const serializedPolicy = JSON.stringify(policy)
if (sensitiveFieldPattern.test(serializedPolicy)) {
  fail('fixture contains a sensitive field name')
}

const poolIds = new Set()
for (const pool of policy.pools) {
  required(pool.id, 'pool.id')
  required(pool.business, `pool(${pool.id}).business`)
  if (poolIds.has(pool.id)) {
    fail(`duplicate pool id: ${pool.id}`)
  }
  poolIds.add(pool.id)
  for (const nodeId of [...pool.nodeIds, ...pool.fallbackNodeIds]) {
    if (!nodes.has(nodeId)) {
      fail(`pool(${pool.id}) references unknown node: ${nodeId}`)
    }
  }
  if (pool.nodeIds.length === 0) {
    fail(`pool(${pool.id}) cannot be empty`)
  }
}

console.log(
  '[policy-check] valid ' +
    policy.version +
    ': ' +
    nodes.size +
    ' nodes, ' +
    poolIds.size +
    ' pools, ' +
    policy.rulesVersion,
)
