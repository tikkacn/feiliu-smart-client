export async function createPostgresStore(connectionString) {
  const { Pool } = await import('pg')
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(
      process.env.DB_CONNECTION_TIMEOUT_MS || 5000,
    ),
  })

  const store = {
    mode: 'postgres',

    async getSnapshot() {
      const policyResult = await pool.query(
        [
          'select version, content_hash, policy_document, created_at, published_at',
          'from policy_versions',
          "where status = 'active'",
          'order by published_at desc nulls last, created_at desc',
          'limit 1',
        ].join(' '),
      )

      if (policyResult.rows.length === 0) {
        throw new Error('no active policy version found')
      }

      const row = policyResult.rows[0]
      const policy = row.policy_document
      const ruleResult = await pool.query(
        [
          'select version',
          'from rule_versions',
          "where status = 'active'",
          'order by fetched_at desc',
          'limit 1',
        ].join(' '),
      )
      const rulesVersion =
        ruleResult.rows[0]?.version || policy.rulesVersion || 'unknown'

      const generatedAt =
        policy.generatedAt ||
        toIsoString(row.published_at) ||
        toIsoString(row.created_at) ||
        new Date().toISOString()
      const normalizedPolicy = {
        ...policy,
        version: row.version || policy.version,
        contentHash: row.content_hash || policy.contentHash,
        generatedAt,
        rulesVersion,
      }

      return {
        policy: normalizedPolicy,
        manifest: buildManifest(normalizedPolicy, rulesVersion),
      }
    },

    async getRulesManifest() {
      const result = await pool.query(
        [
          'select rv.version, rv.categories, rv.fetched_at, rs.name',
          'from rule_versions rv',
          'join rule_sources rs on rs.id = rv.source_id',
          "where rv.status = 'active'",
          'order by rv.fetched_at desc',
          'limit 1',
        ].join(' '),
      )
      const row = result.rows[0]
      return {
        schemaVersion: '0.1.0',
        activeRulesVersion: row?.version || 'unknown',
        source: row?.name || 'unknown',
        categories: row?.categories || [],
        updatedAt: toIsoString(row?.fetched_at),
      }
    },

    async listSources() {
      const result = await pool.query(
        [
          'select id, source_type, name, enabled, schedule, last_success_at, updated_at',
          'from sync_sources',
          'order by source_type, name',
        ].join(' '),
      )
      return result.rows.map((row) => ({
        id: String(row.id),
        sourceType: row.source_type,
        name: row.name,
        enabled: row.enabled,
        schedule: row.schedule || null,
        lastSuccessAt: toIsoString(row.last_success_at),
        updatedAt: toIsoString(row.updated_at),
      }))
    },

    async listPolicies() {
      const result = await pool.query(
        [
          'select version, content_hash, status, generated_by, created_at, published_at, rollback_of',
          'from policy_versions',
          'order by created_at desc, version desc',
        ].join(' '),
      )
      return result.rows.map((row) => ({
        version: row.version,
        contentHash: row.content_hash,
        status: row.status,
        generatedBy: row.generated_by,
        createdAt: toIsoString(row.created_at),
        publishedAt: toIsoString(row.published_at),
        rollbackOf: row.rollback_of,
      }))
    },

    async listSyncRuns(limit = 50) {
      const result = await pool.query(
        [
          'select sr.id, ss.source_type, ss.name, sr.status, sr.started_at, sr.finished_at,',
          'sr.input_hash, sr.result_summary, sr.error_code',
          'from sync_runs sr',
          'join sync_sources ss on ss.id = sr.source_id',
          'order by sr.started_at desc',
          'limit $1',
        ].join(' '),
        [limit],
      )
      return result.rows.map((row) => ({
        id: String(row.id),
        sourceType: row.source_type,
        sourceName: row.name,
        status: row.status,
        startedAt: toIsoString(row.started_at),
        finishedAt: toIsoString(row.finished_at),
        inputHash: row.input_hash,
        resultSummary: row.result_summary || {},
        errorCode: row.error_code,
      }))
    },

    async listAuditLogs(limit = 100) {
      const result = await pool.query(
        [
          'select id, actor, action, target_type, target_id, before_hash, after_hash, request_id, details, created_at',
          'from audit_logs',
          'order by created_at desc',
          'limit $1',
        ].join(' '),
        [limit],
      )
      return result.rows.map((row) => ({
        id: String(row.id),
        actor: row.actor,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        beforeHash: row.before_hash,
        afterHash: row.after_hash,
        requestId: row.request_id,
        details: row.details || {},
        createdAt: toIsoString(row.created_at),
      }))
    },

    async getPolicyVersion(version) {
      const result = await pool.query(
        [
          'select version, content_hash, status, generated_by, policy_document, created_at, published_at, rollback_of',
          'from policy_versions',
          'where version = $1',
        ].join(' '),
        [version],
      )
      const row = result.rows[0]
      if (!row) {
        return null
      }
      return {
        ...row.policy_document,
        version: row.version,
        contentHash: row.content_hash,
        status: row.status,
        generatedBy: row.generated_by,
        createdAt: toIsoString(row.created_at),
        publishedAt: toIsoString(row.published_at),
        rollbackOf: row.rollback_of,
      }
    },

    async publishPolicy(policy, { actor, requestId }) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const existingResult = await client.query(
          'select version, content_hash from policy_versions where version = $1 for update',
          [policy.version],
        )
        const existing = existingResult.rows[0]
        if (existing && existing.content_hash !== policy.contentHash) {
          throw policyError(
            'POLICY_VERSION_CONFLICT',
            `policy version ${policy.version} already has different content`,
          )
        }

        const activeResult = await client.query(
          [
            'select version, content_hash from policy_versions',
            "where status = 'active'",
            'for update',
          ].join(' '),
        )
        const active = activeResult.rows[0]
        if (active?.content_hash === policy.contentHash) {
          await client.query('commit')
          return { published: false, activeVersion: active.version }
        }

        await client.query(
          "update policy_versions set status = 'superseded' where status = 'active'",
        )
        await client.query(
          [
            'insert into policy_versions',
            '(version, content_hash, status, generated_by, policy_document, published_at)',
            "values ($1, $2, 'active', $3, $4, now())",
            'on conflict (version) do update set',
            'content_hash = excluded.content_hash,',
            'status = excluded.status,',
            'generated_by = excluded.generated_by,',
            'policy_document = excluded.policy_document,',
            'published_at = excluded.published_at,',
            'rollback_of = null',
          ].join(' '),
          [policy.version, policy.contentHash, actor, policy],
        )
        await client.query(
          [
            'insert into audit_logs',
            '(actor, action, target_type, target_id, before_hash, after_hash, request_id, details)',
            'values ($1, $2, $3, $4, $5, $6, $7, $8)',
          ].join(' '),
          [
            actor,
            'publish',
            'policy_version',
            policy.version,
            active?.content_hash || null,
            policy.contentHash,
            requestId || null,
            {},
          ],
        )
        await client.query('commit')
        return { published: true, activeVersion: policy.version }
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },

    async rollbackPolicy(version, { actor, requestId }) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const targetResult = await client.query(
          'select version, content_hash from policy_versions where version = $1 for update',
          [version],
        )
        const target = targetResult.rows[0]
        if (!target) {
          throw policyError(
            'POLICY_NOT_FOUND',
            `policy version ${version} not found`,
          )
        }

        const activeResult = await client.query(
          [
            'select version, content_hash from policy_versions',
            "where status = 'active'",
            'for update',
          ].join(' '),
        )
        const active = activeResult.rows[0]
        if (active?.version === version) {
          await client.query('commit')
          return { rolledBack: false, activeVersion: version }
        }

        await client.query(
          "update policy_versions set status = 'rolled-back' where status = 'active'",
        )
        await client.query(
          [
            'update policy_versions',
            "set status = 'active', published_at = now(), rollback_of = $2",
            'where version = $1',
          ].join(' '),
          [version, active?.version || null],
        )
        await client.query(
          [
            'insert into audit_logs',
            '(actor, action, target_type, target_id, before_hash, after_hash, request_id, details)',
            'values ($1, $2, $3, $4, $5, $6, $7, $8)',
          ].join(' '),
          [
            actor,
            'rollback',
            'policy_version',
            version,
            active?.content_hash || null,
            target.content_hash,
            requestId || null,
            { previousActiveVersion: active?.version || null },
          ],
        )
        await client.query('commit')
        return { rolledBack: true, activeVersion: version }
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },

    async health() {
      await pool.query('select 1')
      return {
        status: 'ok',
        mode: 'postgres',
        database: 'reachable',
      }
    },

    async close() {
      await pool.end()
    },
  }

  return store
}

export function buildManifest(policy, rulesVersion) {
  const generatedAt = new Date(policy.generatedAt || Date.now())
  const expiresAt = new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000)

  return {
    schemaVersion: '0.1.0',
    minimumClientVersion: process.env.MINIMUM_CLIENT_VERSION || '2.5.4',
    latestPolicyVersion: policy.version,
    activePolicyVersion: policy.version,
    latestRulesVersion: rulesVersion,
    policyUpdatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    apiFeatures: ['operator-detection', 'business-pools', 'policy-cache'],
  }
}

function toIsoString(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function policyError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}
