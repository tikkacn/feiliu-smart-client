export interface FlystreamManifest {
  schemaVersion: string
  minimumClientVersion: string
  latestPolicyVersion: string
  activePolicyVersion: string
  latestRulesVersion: string
  policyUpdatedAt: string
  expiresAt: string
  apiFeatures: string[]
  stale?: boolean
}

export interface FlystreamRulesManifest {
  schemaVersion: string
  activeRulesVersion: string
  source: string
  categories: string[]
  updatedAt: string | null
}

export interface FlystreamPolicyNode {
  id: string
  displayName: string
  protocol: string
  enabled: boolean
  route: {
    routeTypes: string[]
    region: string
    ipv6: boolean
    confidence: number
  }
  operatorScores: Record<string, number>
  capabilities: Array<{
    business: string
    supported: boolean
    score: number
    verifiedAt: string
  }>
}

export interface FlystreamPolicyPool {
  id: string
  business: string
  mode: string
  nodeIds: string[]
  fallbackNodeIds: string[]
  healthCheckUrl?: string
}

export interface FlystreamPolicy {
  version: string
  status: string
  contentHash: string
  generatedAt: string
  operator: string
  rulesVersion: string
  nodes: FlystreamPolicyNode[]
  pools: FlystreamPolicyPool[]
}

export interface FlystreamNetworkResolution {
  schemaVersion: string
  operator: 'telecom' | 'unicom' | 'mobile' | 'unknown'
  confidence: number
  matchedRule: string | null
}

export type FlystreamApiErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'SERVICE_UNAVAILABLE'

export class FlystreamApiError extends Error {
  code: FlystreamApiErrorCode

  constructor(code: FlystreamApiErrorCode, message: string) {
    super(message)
    this.name = 'FlystreamApiError'
    this.code = code
  }
}
