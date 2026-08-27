import { fetchBlackmatrix7Rules } from '@feiliu/sync-adapters'

import { createSyncRepository } from './repository.mjs'

export async function runBlackmatrix7Sync({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const repository = createSyncRepository(
    required(env.DATABASE_URL, 'DATABASE_URL'),
  )
  const sourceUrl = required(
    env.BLACKMATRIX7_SOURCE_URL,
    'BLACKMATRIX7_SOURCE_URL',
  )

  try {
    const rules = await fetchBlackmatrix7Rules({
      sourceUrl,
      fetchImpl,
      timeoutMs: Number(env.SYNC_TIMEOUT_MS || 30000),
    })
    const sourceId = await repository.ensureRuleSource({
      name: env.BLACKMATRIX7_SOURCE_NAME || 'blackmatrix7',
      sourceUrl,
    })
    await repository.publishRules({ sourceId, rules })
    return rules
  } finally {
    await repository.close()
  }
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}
