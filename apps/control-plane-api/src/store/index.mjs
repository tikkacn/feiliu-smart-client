import { createFixtureStore } from './fixture-store.mjs'

export async function createStore() {
  if (process.env.DATABASE_URL) {
    const { createPostgresStore } = await import('./postgres-store.mjs')
    return createPostgresStore(process.env.DATABASE_URL)
  }

  return createFixtureStore()
}
