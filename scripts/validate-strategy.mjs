import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  fetchBlackmatrix7Rules,
  fetchV2BoardSubscription,
} from '../packages/sync-adapters/src/index.mjs'
import {
  buildPolicy,
  classifyOperator,
  validatePolicy,
} from '../packages/strategy-engine/src/index.mjs'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const fixture = JSON.parse(
  await readFile(resolve(root, 'policy/fixtures/policy.json'), 'utf8'),
)

const generated = buildPolicy({
  nodes: fixture.nodes.map((node) => ({
    ...node,
    sourceNodeKey: node.id,
  })),
  rulesVersion: fixture.rulesVersion,
  now: new Date('2026-08-25T00:00:00Z'),
})
const validation = validatePolicy(generated)
assert.equal(validation.valid, true, validation.errors.join('; '))
assert.equal(
  generated.nodes.find((node) => node.id === 'flystream-hk-01')?.displayName,
  'HK-01',
)
assert.equal(
  generated.pools.find((pool) => pool.id === 'telecom-openai')?.nodeIds.length >
    0,
  true,
)
assert.equal(JSON.stringify(generated).includes('password'), false)

const subscription = await fetchV2BoardSubscription({
  subscriptionUrl: 'https://panel.example.test/sub',
  fetchImpl: async () =>
    new Response(
      [
        'proxies:',
        '  - name: HK-01',
        '    type: vmess',
        '    server: hk.example.test',
        '    port: 443',
        '    uuid: hidden-value',
        '    password: hidden-value',
      ].join('\n'),
      { status: 200 },
    ),
})
assert.equal(subscription.nodes[0].displayName, 'HK-01')
assert.equal(JSON.stringify(subscription).includes('hidden-value'), false)
assert.equal(classifyOperator({ asn: 'AS9929' }).operator, 'unicom')
assert.equal(
  classifyOperator({ isp: 'China Mobile Guangdong' }).operator,
  'unknown',
)

const rules = await fetchBlackmatrix7Rules({
  sourceUrl:
    'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/AI/AI.yaml',
  fetchImpl: async () =>
    new Response('# OpenAI\npayload:\n  - DOMAIN-SUFFIX,openai.com', {
      status: 200,
    }),
})
assert.equal(rules.version.startsWith('blackmatrix7-'), true)
assert.equal(rules.categories.includes('openai'), true)

console.log(
  `[strategy-check] ${generated.nodes.length} nodes, ${generated.pools.length} pools, ${rules.version}`,
)
