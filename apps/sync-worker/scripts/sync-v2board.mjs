import { runV2BoardSync } from '../src/v2board-sync.mjs'

try {
  const result = await runV2BoardSync()
  console.log(
    `[v2board-sync] ${result.publication.published ? 'published' : 'unchanged'} ${result.policy.version}`,
  )
} catch (error) {
  console.error(`[v2board-sync] failed: ${error.message}`)
  process.exitCode = 1
}
