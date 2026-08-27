import { readFile } from 'node:fs/promises'

const baseUrl = (process.env.API_BASE_URL || '').replace(/\/$/, '')
const token = process.env.FEILIU_ADMIN_TOKEN || ''
const action = process.env.POLICY_ACTION || ''
const policyVersion = process.env.POLICY_VERSION || ''

if (!baseUrl || !token) {
  throw new Error('API_BASE_URL and FEILIU_ADMIN_TOKEN are required')
}
if (!['publish', 'rollback'].includes(action)) {
  throw new Error('POLICY_ACTION must be publish or rollback')
}

let path
let body
if (action === 'publish') {
  const policyPath = process.env.POLICY_FILE || 'policy/fixtures/policy.json'
  const policy = JSON.parse(await readFile(policyPath, 'utf8'))
  if (policyVersion && policy.version !== policyVersion) {
    throw new Error(
      `policy file version ${policy.version} does not match requested ${policyVersion}`,
    )
  }
  path = '/v1/admin/policies/publish'
  body = { policy }
} else {
  if (!policyVersion) {
    throw new Error('POLICY_VERSION is required for rollback')
  }
  path = `/v1/admin/policies/${encodeURIComponent(policyVersion)}/rollback`
}

const response = await fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-actor': process.env.POLICY_ACTOR || 'github-actions:policy-admin',
  },
  body: body ? JSON.stringify(body) : undefined,
})
const text = await response.text()
let result
try {
  result = JSON.parse(text)
} catch {
  result = { raw: text.slice(0, 200) }
}

if (!response.ok) {
  throw new Error(`admin command returned HTTP ${response.status}`)
}

console.log(
  `[admin-command] action=${action} activeVersion=${result.activeVersion || 'unknown'} changed=${result.published ?? result.rolledBack ?? false}`,
)
