import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const serverPath = resolve(root, 'apps/control-plane-api/src/server.mjs')
const port = 18787
const token = 'smoke-test-token'
const adminToken = 'smoke-admin-token'
const databaseUrl = process.env.CONTROL_PLANE_DATABASE_URL || ''
const childEnv = { ...process.env }
if (databaseUrl) {
  childEnv.DATABASE_URL = databaseUrl
} else {
  delete childEnv.DATABASE_URL
}

const child = spawn(process.execPath, [serverPath], {
  env: {
    ...childEnv,
    HOST: '127.0.0.1',
    PORT: String(port),
    FEILIU_CLIENT_TOKEN: token,
    FEILIU_ADMIN_TOKEN: adminToken,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const baseUrl = `http://127.0.0.1:${port}`

function waitForExit() {
  return new Promise((resolveExit) => {
    child.once('exit', resolveExit)
  })
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/v1/health`)
      if (response.ok) {
        return
      }
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }
  }
  throw new Error('control-plane API did not become ready')
}

try {
  await waitForHealth()

  const manifestResponse = await fetch(`${baseUrl}/v1/client/manifest`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!manifestResponse.ok) {
    throw new Error(`manifest request failed: ${manifestResponse.status}`)
  }

  const manifest = await manifestResponse.json()
  if (manifest.activePolicyVersion !== 'policy-2026-08-25.1') {
    throw new Error('manifest returned an unexpected policy version')
  }

  const rulesManifestResponse = await fetch(
    `${baseUrl}/v1/client/rules/manifest`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!rulesManifestResponse.ok) {
    throw new Error(
      `rules manifest request failed: ${rulesManifestResponse.status}`,
    )
  }
  const rulesManifest = await rulesManifestResponse.json()
  if (rulesManifest.activeRulesVersion !== 'blackmatrix7-2026-08-25') {
    throw new Error('rules manifest returned an unexpected version')
  }

  const resolveResponse = await fetch(`${baseUrl}/v1/client/policy/resolve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operator: 'telecom',
      business: 'openai',
      clientVersion: '2.5.4',
    }),
  })
  if (!resolveResponse.ok) {
    throw new Error(`policy resolve request failed: ${resolveResponse.status}`)
  }

  const resolved = await resolveResponse.json()
  if (resolved.pool.id !== 'telecom-openai') {
    throw new Error('policy resolver returned the wrong pool')
  }

  const networkResponse = await fetch(`${baseUrl}/v1/client/network/resolve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ asn: 4134, isp: 'China Telecom' }),
  })
  if (!networkResponse.ok) {
    throw new Error(`network resolve request failed: ${networkResponse.status}`)
  }
  const network = await networkResponse.json()
  if (network.operator !== 'telecom') {
    throw new Error('network resolver returned the wrong operator')
  }

  const unauthorizedResponse = await fetch(`${baseUrl}/v1/client/manifest`)
  if (unauthorizedResponse.status !== 401) {
    throw new Error(
      'protected endpoint did not reject an unauthenticated request',
    )
  }

  const clientOnAdminResponse = await fetch(`${baseUrl}/v1/admin/policies`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (clientOnAdminResponse.status !== 401) {
    throw new Error('client token was accepted by an admin endpoint')
  }

  const invalidPolicyResponse = await fetch(
    `${baseUrl}/v1/admin/policies/validate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        policy: {
          nodes: [],
          pools: [
            {
              id: 'invalid',
              nodeIds: ['missing'],
              fallbackNodeIds: ['missing'],
            },
          ],
        },
      }),
    },
  )
  if (!invalidPolicyResponse.ok) {
    throw new Error(
      `admin policy validation request failed: ${invalidPolicyResponse.status}`,
    )
  }
  const invalidPolicy = await invalidPolicyResponse.json()
  if (invalidPolicy.valid !== false || invalidPolicy.errors.length === 0) {
    throw new Error('admin policy validation did not return validation errors')
  }

  if (databaseUrl) {
    const policiesResponse = await fetch(`${baseUrl}/v1/admin/policies`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!policiesResponse.ok) {
      throw new Error(
        `admin policies request failed: ${policiesResponse.status}`,
      )
    }
    const policies = await policiesResponse.json()
    if (!policies.policies.some((item) => item.status === 'active')) {
      throw new Error('postgres store did not return an active policy')
    }

    const auditResponse = await fetch(
      `${baseUrl}/v1/admin/audit-logs?limit=1`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    )
    if (!auditResponse.ok) {
      throw new Error(`admin audit request failed: ${auditResponse.status}`)
    }
  }

  console.log(
    '[control-plane-check] health, manifest, resolve, network, auth, and admin separation passed',
  )
} finally {
  child.kill()
  await waitForExit()
}
