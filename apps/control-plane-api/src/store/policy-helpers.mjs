export function findPool(policy, operator, business) {
  const exact = policy.pools.find(
    (pool) => pool.id === `${operator}-${business}`,
  )
  if (exact) {
    return exact
  }

  const general = policy.pools.find((pool) => pool.id === `${operator}-general`)
  if (general) {
    return general
  }

  return policy.pools.find((pool) => pool.business === 'general')
}

export function buildConfig(policy) {
  return {
    schemaVersion: '0.1.0',
    policyVersion: policy.version,
    generatedAt: policy.generatedAt,
    overlay: {
      pools: policy.pools,
      nodeNames: policy.nodes.map((node) => ({
        id: node.id,
        displayName: node.displayName,
      })),
    },
  }
}
