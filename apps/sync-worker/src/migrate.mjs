import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

export async function runMigrations({
  connectionString = process.env.DATABASE_URL,
  migrationsDir = resolve(repositoryRoot, 'db/migrations'),
} = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  const migrationFiles = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))

  const pool = new Pool({ connectionString })
  const applied = []
  const skipped = []

  try {
    await pool.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `)

    for (const fileName of migrationFiles) {
      const version = fileName.slice(0, -4)
      const existing = await pool.query(
        'select 1 from schema_migrations where version = $1',
        [version],
      )

      if (existing.rowCount > 0) {
        skipped.push(version)
        continue
      }

      const sql = await readFile(join(migrationsDir, fileName), 'utf8')
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query(sql)
        await client.query(
          'insert into schema_migrations (version) values ($1)',
          [version],
        )
        await client.query('commit')
        applied.push(version)
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw new Error(`Migration ${version} failed`, { cause: error })
      } finally {
        client.release()
      }
    }

    return { applied, skipped }
  } finally {
    await pool.end()
  }
}
