export type SmartOperator = 'telecom' | 'unicom' | 'mobile' | 'unknown'

type SmartLineCategory =
  | 'telecom'
  | 'unicom'
  | 'mobile'
  | 'telecom-unicom'
  | 'telecom-mobile'
  | 'unicom-mobile'
  | 'three-network'

export interface SmartClassificationManifest {
  schemaVersion: number
  version: number
  updatedAt: string
  nodes: Array<{
    matchKey: string
    category: SmartLineCategory
  }>
}

export interface SmartClassificationSyncResult {
  version: number
  updatedAt: string
  categories: number
  fetchedAt: number
}

export type SmartOperatorPromptDecision =
  | { kind: 'none' }
  | {
      kind: 'initial' | 'changed'
      detectedOperator: SmartOperator
      selectedOperator: SmartOperator
    }

/**
 * Decides whether an operator prompt is necessary.
 *
 * A confirmed choice is stable while the public IP is outside mainland
 * China. Only a positive detection of a different mainland operator can
 * trigger a change prompt. `preferredOperator !== unknown` also treats older
 * installations as confirmed before the explicit confirmation flag existed.
 */
export function decideSmartOperatorPrompt(input: {
  countryCode: string
  detectedOperator: SmartOperator
  preferredOperator: SmartOperator
  operatorConfirmed: boolean
}): SmartOperatorPromptDecision {
  const isDomestic = input.countryCode.trim().toUpperCase() === 'CN'
  const hasConfirmedChoice =
    input.operatorConfirmed || input.preferredOperator !== 'unknown'

  if (!hasConfirmedChoice) {
    return {
      kind: 'initial',
      detectedOperator: isDomestic ? input.detectedOperator : 'unknown',
      selectedOperator: isDomestic ? input.detectedOperator : 'unknown',
    }
  }

  if (
    !isDomestic ||
    input.detectedOperator === 'unknown' ||
    input.detectedOperator === input.preferredOperator
  ) {
    return { kind: 'none' }
  }

  return {
    kind: 'changed',
    detectedOperator: input.detectedOperator,
    selectedOperator: input.detectedOperator,
  }
}

const ASN_OPERATOR_RULES: Record<number, SmartOperator> = {
  4134: 'telecom',
  4837: 'unicom',
  9929: 'unicom',
  9808: 'mobile',
}

export function classifySmartOperator(input: { asn: number; isp: string }): {
  operator: SmartOperator
  confidence: number
} {
  const asn = Number(input.asn)
  const asnOperator = ASN_OPERATOR_RULES[asn]
  if (asnOperator) {
    return { operator: asnOperator, confidence: 0.98 }
  }

  const isp = input.isp.toLowerCase()
  if (/中国电信|chinanet|telecom/.test(isp)) {
    return { operator: 'telecom', confidence: 0.78 }
  }
  if (/中国联通|china169|unicom/.test(isp)) {
    return { operator: 'unicom', confidence: 0.78 }
  }
  if (/中国移动|cmcc|mobile/.test(isp)) {
    return { operator: 'mobile', confidence: 0.78 }
  }

  return { operator: 'unknown', confidence: 0.15 }
}
