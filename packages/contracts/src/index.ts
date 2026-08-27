export const contractVersion = '0.1.0'

export type Operator = 'telecom' | 'unicom' | 'mobile' | 'unknown'

export type Business =
  | 'general'
  | 'github'
  | 'google'
  | 'docker'
  | 'telegram'
  | 'microsoft'
  | 'apple'
  | 'openai'
  | 'claude'
  | 'gemini'
  | 'netflix'
  | 'disney-plus'
  | 'tiktok'
  | 'youtube'

export type PoolMode = 'auto' | 'url-test' | 'fallback' | 'manual'

export type PolicyStatus =
  | 'draft'
  | 'validated'
  | 'active'
  | 'superseded'
  | 'rolled-back'

export interface NodeRouteMetadata {
  routeTypes: string[]
  region: string
  ipv6: boolean
  confidence: number
}

export interface NodeCapability {
  business: Business
  supported: boolean
  score: number
  verifiedAt: string
}

export interface PolicyNode {
  id: string
  displayName: string
  protocol: string
  enabled: boolean
  route: NodeRouteMetadata
  operatorScores: Partial<Record<Operator, number>>
  capabilities: NodeCapability[]
}

export interface PolicyPool {
  id: string
  business: Business
  mode: PoolMode
  nodeIds: string[]
  fallbackNodeIds: string[]
  healthCheckUrl?: string
}

export interface PolicyVersion {
  version: string
  status: PolicyStatus
  contentHash: string
  generatedAt: string
  operator: Operator
  nodes: PolicyNode[]
  pools: PolicyPool[]
  rulesVersion: string
}

export interface ClientManifest {
  schemaVersion: string
  minimumClientVersion: string
  latestPolicyVersion: string
  activePolicyVersion: string
  latestRulesVersion: string
  policyUpdatedAt: string
  expiresAt: string
  apiFeatures: string[]
}

export interface RulesManifest {
  schemaVersion: string
  activeRulesVersion: string
  source: string
  categories: string[]
  updatedAt: string | null
}

export interface AdminSyncRunSummary {
  id: string
  sourceType: string
  sourceName: string
  status: string
  startedAt: string
  finishedAt: string | null
  inputHash: string | null
  resultSummary: Record<string, unknown>
  errorCode: string | null
}

export interface AdminAuditLogSummary {
  id: string
  actor: string
  action: string
  targetType: string
  targetId: string | null
  beforeHash: string | null
  afterHash: string | null
  requestId: string | null
  details: Record<string, unknown>
  createdAt: string
}

export interface PolicyResolveRequest {
  operator: Operator
  business: Business
  clientVersion: string
  capabilities?: string[]
}

export interface PolicyResolveResponse {
  schemaVersion: string
  policyVersion: string
  operator: Operator
  business: Business
  pool: PolicyPool
  stale: boolean
  expiresAt: string
}

export interface AdminSourceSummary {
  id: string
  sourceType: string
  name: string
  enabled: boolean
  schedule: string | null
  lastSuccessAt: string | null
  updatedAt: string | null
}

export interface AdminPolicySummary {
  version: string
  contentHash: string
  status: PolicyStatus
  generatedBy: string
  createdAt: string | null
  publishedAt: string | null
  rollbackOf: string | null
}

export interface PolicyValidationResult {
  valid: boolean
  errors: string[]
}

export interface AdminPolicyOperationResult {
  published?: boolean
  rolledBack?: boolean
  activeVersion: string
}

export function isOperator(value: string): value is Operator {
  return ['telecom', 'unicom', 'mobile', 'unknown'].includes(value)
}

export function isBusiness(value: string): value is Business {
  return [
    'general',
    'github',
    'google',
    'docker',
    'telegram',
    'microsoft',
    'apple',
    'openai',
    'claude',
    'gemini',
    'netflix',
    'disney-plus',
    'tiktok',
    'youtube',
  ].includes(value)
}
