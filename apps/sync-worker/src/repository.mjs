import { Pool } from 'pg'

export function createSyncRepository(connectionString) {
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(
      process.env.DB_CONNECTION_TIMEOUT_MS || 5000,
    ),
  })

  return {
    async ensureSource({ sourceType, name, secretRef }) {
      const result = await pool.query(
        [
          'insert into sync_sources (source_type, name, secret_ref)',
          'values ($1, $2, $3)',
          'on conflict (source_type, name) do update set',
          'secret_ref = excluded.secret_ref, updated_at = now()',
          'returning id',
        ].join(' '),
        [sourceType, name, secretRef || null],
      )
      return result.rows[0].id
    },

    async startRun(sourceId, inputHash = null) {
      const result = await pool.query(
        [
          'insert into sync_runs (source_id, status, input_hash)',
          "values ($1, 'running', $2)",
          'returning id',
        ].join(' '),
        [sourceId, inputHash],
      )
      return result.rows[0].id
    },

    async finishRun(runId, { status, summary = {}, errorCode = null }) {
      await pool.query(
        [
          'update sync_runs',
          'set status = $2, finished_at = now(), result_summary = $3, error_code = $4',
          'where id = $1',
        ].join(' '),
        [runId, status, summary, errorCode],
      )
      if (status === 'succeeded') {
        await pool.query(
          [
            'update sync_sources',
            'set last_success_at = now(), updated_at = now()',
            'where id = (select source_id from sync_runs where id = $1)',
          ].join(' '),
          [runId],
        )
      }
    },

    async setRunInputHash(runId, inputHash) {
      await pool.query('update sync_runs set input_hash = $2 where id = $1', [
        runId,
        inputHash,
      ])
    },

    async upsertNodes(sourceId, nodes) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        for (const node of nodes) {
          await client.query(
            [
              'insert into node_catalog',
              '(source_id, source_node_key, display_name, protocol, address_hash)',
              'values ($1, $2, $3, $4, $5)',
              'on conflict (source_id, source_node_key) do update set',
              'display_name = excluded.display_name,',
              'protocol = excluded.protocol,',
              'address_hash = excluded.address_hash,',
              'last_seen_at = now()',
            ].join(' '),
            [
              sourceId,
              node.sourceNodeKey,
              node.displayName,
              node.protocol,
              node.addressHash,
            ],
          )
        }
        await client.query(
          [
            'update node_catalog',
            'set enabled = false',
            'where source_id = $1 and last_seen_at < now() and enabled = true',
          ].join(' '),
          [sourceId],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },

    async loadPolicyInputs(sourceId) {
      const [nodesResult, policiesResult, rulesResult] = await Promise.all([
        pool.query(
          [
            'select nc.id, nc.source_node_key, nc.display_name, nc.protocol, nc.enabled,',
            'nrm.route_types, nrm.region, nrm.ipv6, nrm.confidence,',
            'nos.operator, nos.score,',
            'ncap.business, ncap.supported, ncap.score as capability_score, ncap.verified_at',
            'from node_catalog nc',
            'left join node_route_metadata nrm on nrm.node_id = nc.id',
            'left join node_operator_scores nos on nos.node_id = nc.id',
            'left join node_capabilities ncap on ncap.node_id = nc.id',
            'where nc.source_id = $1',
            'order by nc.id, ncap.business, nos.operator',
          ].join(' '),
          [sourceId],
        ),
        pool.query(
          [
            'select business, mode, candidate_tags, fallback_tags, health_check_url, enabled',
            'from business_policies',
            'where enabled = true',
            'order by business',
          ].join(' '),
        ),
        pool.query(
          [
            'select version from rule_versions',
            "where status = 'active'",
            'order by fetched_at desc',
            'limit 1',
          ].join(' '),
        ),
      ])

      const nodes = new Map()
      for (const row of nodesResult.rows) {
        let node = nodes.get(row.id)
        if (!node) {
          node = {
            sourceNodeKey: row.source_node_key,
            displayName: row.display_name,
            protocol: row.protocol,
            enabled: row.enabled,
            route: {
              routeTypes: row.route_types || [],
              region: row.region || 'unknown',
              ipv6: Boolean(row.ipv6),
              confidence: Number(row.confidence ?? 0.5),
            },
            operatorScores: {},
            capabilities: [],
          }
          nodes.set(row.id, node)
        }

        if (row.operator) {
          node.operatorScores[row.operator] = Number(row.score)
        }
        if (row.business) {
          node.capabilities.push({
            business: row.business,
            supported: row.supported,
            score: Number(row.capability_score),
            verifiedAt: toIsoString(row.verified_at),
          })
        }
      }

      const overrides = await pool.query(
        [
          'select target_id, field, value',
          'from manual_overrides',
          "where target_type = 'node' and (expires_at is null or expires_at > now())",
        ].join(' '),
      )
      applyNodeOverrides(nodes, overrides.rows)

      return {
        nodes: [...nodes.values()],
        businessPolicies: policiesResult.rows.map((row) => ({
          business: row.business,
          mode: row.mode,
          candidateTags: row.candidate_tags || [],
          fallbackTags: row.fallback_tags || [],
          healthCheckUrl: row.health_check_url || undefined,
          enabled: row.enabled,
        })),
        rulesVersion: rulesResult.rows[0]?.version || 'unknown',
      }
    },

    async publishPolicy(policy, { actor, runId }) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const active = await client.query(
          [
            'select version, content_hash from policy_versions',
            "where status = 'active'",
            'for update',
          ].join(' '),
        )
        const current = active.rows[0]
        if (current?.content_hash === policy.contentHash) {
          await client.query('commit')
          return { published: false, activeVersion: current.version }
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
            'published_at = excluded.published_at',
          ].join(' '),
          [policy.version, policy.contentHash, actor, policy],
        )
        await client.query(
          [
            'insert into audit_logs',
            '(actor, action, target_type, target_id, before_hash, after_hash, details)',
            'values ($1, $2, $3, $4, $5, $6, $7)',
          ].join(' '),
          [
            actor,
            'publish',
            'policy_version',
            policy.version,
            current?.content_hash || null,
            policy.contentHash,
            { syncRunId: runId || null },
          ],
        )
        await client.query('commit')
        return { published: true, activeVersion: policy.version }
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },

    async ensureRuleSource({ name, sourceUrl }) {
      const result = await pool.query(
        [
          'insert into rule_sources (name, source_url)',
          'values ($1, $2)',
          'on conflict (name) do update set source_url = excluded.source_url',
          'returning id',
        ].join(' '),
        [name, sourceUrl],
      )
      return result.rows[0].id
    },

    async publishRules({ sourceId, rules }) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query(
          "update rule_versions set status = 'superseded' where source_id = $1 and status = 'active'",
          [sourceId],
        )
        await client.query(
          [
            'insert into rule_versions',
            '(version, source_id, content_hash, categories, status)',
            "values ($1, $2, $3, $4, 'active')",
            'on conflict (version) do update set',
            'content_hash = excluded.content_hash,',
            'categories = excluded.categories,',
            'status = excluded.status,',
            'fetched_at = now()',
          ].join(' '),
          [
            rules.version,
            sourceId,
            rules.contentHash,
            JSON.stringify(rules.categories),
          ],
        )
        await client.query(
          'update rule_sources set last_commit = $2, last_success_at = now() where id = $1',
          [sourceId, rules.version],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },

    async close() {
      await pool.end()
    },
  }
}

function applyNodeOverrides(nodes, overrides) {
  for (const override of overrides) {
    const node = [...nodes.values()].find(
      (candidate) =>
        candidate.sourceNodeKey === override.target_id ||
        candidate.sourceNodeKey.endsWith(`:${override.target_id}`),
    )
    if (!node) {
      continue
    }

    if (override.field === 'enabled') {
      node.enabled = Boolean(override.value)
    } else if (override.field === 'route') {
      node.route = { ...node.route, ...override.value }
    } else if (override.field === 'operatorScores') {
      node.operatorScores = { ...node.operatorScores, ...override.value }
    } else if (override.field === 'capabilities') {
      node.capabilities = override.value
    }
  }
}

function toIsoString(value) {
  if (!value) {
    return new Date(0).toISOString()
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString()
}
