import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

import { classifyOperator, validatePolicy } from '@feiliu/strategy-engine'

import { buildConfig, findPool } from './store/policy-helpers.mjs'
import { createStore } from './store/index.mjs'

const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const clientToken = process.env.FEILIU_CLIENT_TOKEN || ''
const adminToken = process.env.FEILIU_ADMIN_TOKEN || ''
const store = await createStore()

if (process.env.NODE_ENV === 'production' && !clientToken) {
  throw new Error('FEILIU_CLIENT_TOKEN is required in production')
}

function requestId(request) {
  return request.headers['x-request-id'] || randomUUID()
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  response.end(JSON.stringify(payload))
}

function sendError(response, statusCode, code, message, id) {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
      requestId: id,
    },
  })
}

function isAuthorized(request) {
  if (!clientToken) {
    return true
  }

  return request.headers.authorization === `Bearer ${clientToken}`
}

function isAdminAuthorized(request) {
  return (
    Boolean(adminToken) &&
    request.headers.authorization === `Bearer ${adminToken}`
  )
}

function adminActor(request) {
  const value = request.headers['x-actor']
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 120)
    : 'admin-api'
}

function validatePolicyDocument(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return { valid: false, errors: ['policy must be a JSON object'] }
  }

  try {
    return validatePolicy(policy)
  } catch {
    return { valid: false, errors: ['policy shape is invalid'] }
  }
}

function validatePublishDocument(policy) {
  const result = validatePolicyDocument(policy)
  const errors = [...result.errors]
  if (!policy?.version) {
    errors.push('policy version is required')
  }
  if (!policy?.contentHash) {
    errors.push('policy contentHash is required')
  }
  return { valid: errors.length === 0, errors }
}

function isKnownOperator(value) {
  return ['telecom', 'unicom', 'mobile', 'unknown'].includes(value)
}

function isKnownBusiness(value) {
  return [
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
  ].includes(value)
}

async function readRequestBody(request) {
  const chunks = []
  let length = 0

  for await (const chunk of request) {
    length += chunk.length
    if (length > 1024 * 1024) {
      throw new Error('request body too large')
    }
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = createServer(async (request, response) => {
  const id = requestId(request)
  const url = new URL(
    request.url || '/',
    `http://${request.headers.host || host}`,
  )

  try {
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      const [health, snapshot] = await Promise.all([
        store.health(),
        store.getSnapshot(),
      ])
      return sendJson(response, 200, {
        ...health,
        schemaVersion: snapshot.manifest.schemaVersion,
        activePolicyVersion: snapshot.manifest.activePolicyVersion,
        requestId: id,
      })
    }

    if (url.pathname.startsWith('/v1/admin/')) {
      if (!adminToken) {
        return sendError(
          response,
          503,
          'ADMIN_NOT_CONFIGURED',
          'admin authorization is not configured',
          id,
        )
      }
      if (!isAdminAuthorized(request)) {
        return sendError(
          response,
          401,
          'UNAUTHORIZED',
          'admin authorization required',
          id,
        )
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/sources') {
        if (typeof store.listSources !== 'function') {
          return sendError(
            response,
            503,
            'DATABASE_REQUIRED',
            'admin data requires PostgreSQL mode',
            id,
          )
        }
        return sendJson(response, 200, {
          sources: await store.listSources(),
          requestId: id,
        })
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/policies') {
        if (typeof store.listPolicies !== 'function') {
          return sendError(
            response,
            503,
            'DATABASE_REQUIRED',
            'admin data requires PostgreSQL mode',
            id,
          )
        }
        return sendJson(response, 200, {
          policies: await store.listPolicies(),
          requestId: id,
        })
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/sync-runs') {
        if (typeof store.listSyncRuns !== 'function') {
          return sendError(
            response,
            503,
            'DATABASE_REQUIRED',
            'admin data requires PostgreSQL mode',
            id,
          )
        }
        return sendJson(response, 200, {
          runs: await store.listSyncRuns(parseLimit(url, 50, 200)),
          requestId: id,
        })
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/audit-logs') {
        if (typeof store.listAuditLogs !== 'function') {
          return sendError(
            response,
            503,
            'DATABASE_REQUIRED',
            'admin data requires PostgreSQL mode',
            id,
          )
        }
        return sendJson(response, 200, {
          logs: await store.listAuditLogs(parseLimit(url, 100, 500)),
          requestId: id,
        })
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/v1/admin/policies/validate'
      ) {
        const body = await readRequestBody(request)
        const policy = body?.policy || body
        const result = validatePolicyDocument(policy)
        return sendJson(response, 200, { ...result, requestId: id })
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/v1/admin/policies/publish'
      ) {
        if (typeof store.publishPolicy !== 'function') {
          return sendError(
            response,
            503,
            'DATABASE_REQUIRED',
            'admin publishing requires PostgreSQL mode',
            id,
          )
        }
        const body = await readRequestBody(request)
        const policy = body?.policy || body
        const validation = validatePublishDocument(policy)
        if (!validation.valid) {
          return sendJson(response, 422, {
            ...validation,
            requestId: id,
          })
        }
        const result = await store.publishPolicy(policy, {
          actor: adminActor(request),
          requestId: id,
        })
        return sendJson(response, 200, { ...result, requestId: id })
      }

      const rollbackMatch = url.pathname.match(
        /^\/v1\/admin\/policies\/([^/]+)\/rollback$/,
      )
      if (request.method === 'POST' && rollbackMatch) {
        if (typeof store.rollbackPolicy !== 'function') {
          return sendError(
            response,
            503,
            'DATABASE_REQUIRED',
            'admin rollback requires PostgreSQL mode',
            id,
          )
        }
        const result = await store.rollbackPolicy(
          decodeURIComponent(rollbackMatch[1]),
          { actor: adminActor(request), requestId: id },
        )
        return sendJson(response, 200, { ...result, requestId: id })
      }

      const policyMatch = url.pathname.match(/^\/v1\/admin\/policies\/([^/]+)$/)
      if (request.method === 'GET' && policyMatch) {
        if (typeof store.getPolicyVersion !== 'function') {
          return sendError(
            response,
            503,
            'DATABASE_REQUIRED',
            'admin data requires PostgreSQL mode',
            id,
          )
        }
        const policy = await store.getPolicyVersion(
          decodeURIComponent(policyMatch[1]),
        )
        if (!policy) {
          return sendError(
            response,
            404,
            'POLICY_NOT_FOUND',
            'policy version not found',
            id,
          )
        }
        return sendJson(response, 200, { ...policy, requestId: id })
      }

      return sendError(response, 404, 'NOT_FOUND', 'admin route not found', id)
    }

    if (!isAuthorized(request)) {
      return sendError(
        response,
        401,
        'UNAUTHORIZED',
        'client authorization required',
        id,
      )
    }

    if (request.method === 'GET' && url.pathname === '/v1/client/manifest') {
      const snapshot = await store.getSnapshot()
      const etag = `"${snapshot.policy.contentHash}"`
      if (request.headers['if-none-match'] === etag) {
        response.writeHead(304, { etag })
        return response.end()
      }

      return sendJson(
        response,
        200,
        {
          ...snapshot.manifest,
          requestId: id,
        },
        { etag },
      )
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/v1/client/rules/manifest'
    ) {
      return sendJson(response, 200, {
        ...(await store.getRulesManifest()),
        requestId: id,
      })
    }

    if (
      request.method === 'GET' &&
      url.pathname.startsWith('/v1/client/policy/')
    ) {
      const snapshot = await store.getSnapshot()
      const version = decodeURIComponent(
        url.pathname.slice('/v1/client/policy/'.length),
      )
      if (version !== snapshot.policy.version) {
        return sendError(
          response,
          404,
          'POLICY_NOT_FOUND',
          'policy version not found',
          id,
        )
      }

      return sendJson(response, 200, { ...snapshot.policy, requestId: id })
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/v1/client/policy/resolve'
    ) {
      const body = await readRequestBody(request)
      const operator = body?.operator || 'unknown'
      const business = body?.business || 'general'

      if (!isKnownOperator(operator)) {
        return sendError(
          response,
          400,
          'INVALID_OPERATOR',
          'unsupported operator',
          id,
        )
      }
      if (!isKnownBusiness(business)) {
        return sendError(
          response,
          400,
          'INVALID_BUSINESS',
          'unsupported business',
          id,
        )
      }

      const snapshot = await store.getSnapshot()
      const pool = findPool(snapshot.policy, operator, business)
      if (!pool) {
        return sendError(
          response,
          503,
          'POOL_UNAVAILABLE',
          'no policy pool available',
          id,
        )
      }

      return sendJson(response, 200, {
        schemaVersion: snapshot.manifest.schemaVersion,
        policyVersion: snapshot.policy.version,
        operator,
        business,
        pool,
        stale: false,
        expiresAt: snapshot.manifest.expiresAt,
        requestId: id,
      })
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/v1/client/network/resolve'
    ) {
      const body = await readRequestBody(request)
      const result = classifyOperator({
        asn: body?.asn,
        isp: body?.isp,
      })
      return sendJson(response, 200, {
        schemaVersion: '0.1.0',
        ...result,
        requestId: id,
      })
    }

    if (request.method === 'GET' && url.pathname === '/v1/client/config') {
      const snapshot = await store.getSnapshot()
      return sendJson(response, 200, {
        ...buildConfig(snapshot.policy),
        requestId: id,
      })
    }

    return sendError(response, 404, 'NOT_FOUND', 'route not found', id)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return sendError(
        response,
        400,
        'INVALID_JSON',
        'request body must be valid JSON',
        id,
      )
    }

    if (error?.code === 'POLICY_VERSION_CONFLICT') {
      return sendError(response, 409, error.code, error.message, id)
    }
    if (error?.code === 'POLICY_NOT_FOUND') {
      return sendError(response, 404, error.code, error.message, id)
    }

    console.error(`[${id}] control-plane request failed`, error)
    return sendError(
      response,
      503,
      'SERVICE_UNAVAILABLE',
      'control-plane service unavailable',
      id,
    )
  }
})

async function closeStore() {
  await store.close()
  server.close()
}

process.once('SIGINT', () => void closeStore())
process.once('SIGTERM', () => void closeStore())

server.listen(port, host, () => {
  console.log(
    `Flystream control-plane API listening on http://${host}:${port} (${store.mode})`,
  )
})

function parseLimit(url, fallback, maximum) {
  const value = Number(url.searchParams.get('limit'))
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(1, Math.min(maximum, Math.floor(value)))
}
