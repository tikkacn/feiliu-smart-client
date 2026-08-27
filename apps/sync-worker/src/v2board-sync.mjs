import { buildPolicy, validatePolicy } from '@feiliu/strategy-engine'
import { fetchV2BoardSubscription } from '@feiliu/sync-adapters'

import { createSyncRepository } from './repository.mjs'

export async function runV2BoardSync({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  const connectionString = required(env.DATABASE_URL, 'DATABASE_URL')
  const subscriptionUrl = required(
    env.V2BOARD_SUBSCRIPTION_URL,
    'V2BOARD_SUBSCRIPTION_URL',
  )
  const sourceName = env.V2BOARD_SOURCE_NAME || 'primary'
  const repository = createSyncRepository(connectionString)
  let runId

  try {
    const sourceId = await repository.ensureSource({
      sourceType: 'v2board',
      name: sourceName,
      secretRef: env.V2BOARD_TOKEN_SECRET_REF || 'V2BOARD_TOKEN',
    })
    runId = await repository.startRun(sourceId)
    const subscription = await fetchV2BoardSubscription({
      subscriptionUrl,
      token: env.V2BOARD_TOKEN,
      sourceName,
      fetchImpl,
      timeoutMs: Number(env.SYNC_TIMEOUT_MS || 30000),
    })
    await repository.setRunInputHash(runId, subscription.inputHash)
    await repository.upsertNodes(sourceId, subscription.nodes)
    const inputs = await repository.loadPolicyInputs(sourceId)
    const policy = buildPolicy({
      ...inputs,
      rulesVersion: inputs.rulesVersion,
      now,
    })
    const validation = validatePolicy(policy)
    if (!validation.valid) {
      throw new Error(
        `generated policy is invalid: ${validation.errors.join('; ')}`,
      )
    }

    const publication = await repository.publishPolicy(policy, {
      actor: env.SYNC_ACTOR || 'github-actions:v2board',
      runId,
    })
    await repository.finishRun(runId, {
      status: 'succeeded',
      summary: {
        nodeCount: inputs.nodes.length,
        poolCount: policy.pools.length,
        policyVersion: policy.version,
        published: publication.published,
      },
    })
    return { policy, publication }
  } catch (error) {
    if (runId) {
      await repository.finishRun(runId, {
        status: 'failed',
        errorCode: 'V2BOARD_SYNC_FAILED',
        summary: { message: error.message },
      })
    }
    throw error
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
