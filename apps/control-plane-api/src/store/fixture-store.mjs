import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const policyPath = resolve(root, 'policy/fixtures/policy.json')
const manifestPath = resolve(root, 'policy/fixtures/manifest.json')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function createFixtureStore() {
  const [policy, manifest] = await Promise.all([
    readJson(policyPath),
    readJson(manifestPath),
  ])

  return {
    mode: 'fixture',

    async getSnapshot() {
      return { policy, manifest }
    },

    async getRulesManifest() {
      return {
        schemaVersion: manifest.schemaVersion,
        activeRulesVersion: manifest.latestRulesVersion,
        source: 'blackmatrix7',
        categories: [],
        updatedAt: policy.generatedAt || manifest.policyUpdatedAt || null,
      }
    },

    async health() {
      return {
        status: 'ok',
        mode: 'fixture',
        database: 'not-configured',
      }
    },

    async close() {},
  }
}
