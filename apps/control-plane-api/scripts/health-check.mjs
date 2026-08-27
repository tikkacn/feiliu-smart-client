const baseUrl = (process.env.API_BASE_URL || '').replace(/\/$/, '')
const token = process.env.FEILIU_CLIENT_TOKEN || ''

if (!baseUrl) {
  throw new Error('API_BASE_URL is required')
}

const headers = token ? { authorization: `Bearer ${token}` } : {}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 200) }
  }

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`)
  }
  return body
}

const health = await getJson('/v1/health')
if (health.status !== 'ok') {
  throw new Error('Control-plane health status is not ok')
}

const manifest = await getJson('/v1/client/manifest')
if (!manifest.activePolicyVersion || !manifest.policyUpdatedAt) {
  throw new Error('Control-plane manifest is incomplete')
}

console.log(
  `[control-plane-health] ok policy=${manifest.activePolicyVersion} updatedAt=${manifest.policyUpdatedAt}`,
)
