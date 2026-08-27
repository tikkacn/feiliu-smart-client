export const defaultOperatorRules = [
  {
    asn: 4134,
    operator: 'telecom',
    priority: 100,
    source: 'default',
  },
  {
    asn: 4837,
    operator: 'unicom',
    priority: 100,
    source: 'default',
  },
  {
    asn: 9929,
    operator: 'unicom',
    priority: 110,
    source: 'default',
  },
  {
    asn: 9808,
    operator: 'mobile',
    priority: 100,
    source: 'default',
  },
]

export function classifyOperator({ asn, isp, rules = defaultOperatorRules }) {
  const numericAsn = normalizeAsn(asn)
  const asnRule = rules
    .filter((rule) => rule.enabled !== false && Number(rule.asn) === numericAsn)
    .sort(
      (left, right) => Number(right.priority || 0) - Number(left.priority || 0),
    )[0]

  if (asnRule) {
    return {
      operator: asnRule.operator,
      confidence: 0.98,
      matchedRule: `asn:${asnRule.asn}`,
    }
  }

  const normalizedIsp = String(isp || '').toLowerCase()
  const ispRule = rules
    .filter((rule) => rule.enabled !== false && rule.ispPattern)
    .find((rule) => {
      try {
        return new RegExp(rule.ispPattern, 'i').test(normalizedIsp)
      } catch {
        return false
      }
    })

  if (ispRule) {
    return {
      operator: ispRule.operator,
      confidence: 0.78,
      matchedRule: `isp:${ispRule.ispPattern}`,
    }
  }

  return {
    operator: 'unknown',
    confidence: 0.15,
    matchedRule: null,
  }
}

function normalizeAsn(asn) {
  const value = String(asn ?? '').replace(/^AS/i, '')
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) ? numeric : 0
}
