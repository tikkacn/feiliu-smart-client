export type SmartOperator = 'telecom' | 'unicom' | 'mobile' | 'unknown'

const ASN_OPERATOR_RULES: Record<number, SmartOperator> = {
  4134: 'telecom',
  4837: 'unicom',
  9929: 'unicom',
  9808: 'mobile',
}

export function classifySmartOperator(input: {
  asn: number
  isp: string
}): { operator: SmartOperator; confidence: number } {
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
