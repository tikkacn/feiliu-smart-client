import { runBlackmatrix7Sync } from '../src/blackmatrix7-sync.mjs'

try {
  const rules = await runBlackmatrix7Sync()
  console.log(`[blackmatrix7-sync] published ${rules.version}`)
} catch (error) {
  console.error(`[blackmatrix7-sync] failed: ${error.message}`)
  process.exitCode = 1
}
