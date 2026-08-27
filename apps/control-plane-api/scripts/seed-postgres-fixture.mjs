import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const policy = JSON.parse(
  await readFile(resolve(root, 'policy/fixtures/policy.json'), 'utf8'),
)
const pool = new Pool({ connectionString })

try {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      "update policy_versions set status = 'superseded' where status = 'active'",
    )
    await client.query(
      [
        'insert into policy_versions',
        '(version, content_hash, status, generated_by, policy_document, published_at)',
        "values ($1, $2, 'active', 'ci-fixture', $3, now())",
        'on conflict (version) do update set',
        'content_hash = excluded.content_hash,',
        'status = excluded.status,',
        'generated_by = excluded.generated_by,',
        'policy_document = excluded.policy_document,',
        'published_at = excluded.published_at,',
        'rollback_of = null',
      ].join(' '),
      [policy.version, policy.contentHash, policy],
    )

    const source = await client.query(
      [
        'insert into rule_sources (name, source_url)',
        "values ('blackmatrix7', 'https://example.invalid/blackmatrix7.yaml')",
        'on conflict (name) do update set source_url = excluded.source_url',
        'returning id',
      ].join(' '),
    )
    await client.query(
      [
        'insert into rule_versions',
        '(version, source_id, content_hash, categories, status)',
        "values ($1, $2, $3, $4, 'active')",
        'on conflict (version) do update set',
        'source_id = excluded.source_id,',
        'content_hash = excluded.content_hash,',
        'categories = excluded.categories,',
        'status = excluded.status,',
        'fetched_at = now()',
      ].join(' '),
      [
        policy.rulesVersion,
        source.rows[0].id,
        policy.contentHash,
        JSON.stringify(['AI', 'GitHub']),
      ],
    )
    await client.query(
      [
        'insert into audit_logs',
        '(actor, action, target_type, target_id, after_hash, details)',
        "values ('ci-fixture', 'seed', 'policy_version', $1, $2, $3)",
      ].join(' '),
      [policy.version, policy.contentHash, { source: 'policy-fixture' }],
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}

console.log(`[postgres-fixture] seeded policy=${policy.version}`)
