import { runMigrations } from '../src/migrate.mjs'

const result = await runMigrations()
console.log(
  `[db-migrate] applied=${result.applied.length} skipped=${result.skipped.length}`,
)
