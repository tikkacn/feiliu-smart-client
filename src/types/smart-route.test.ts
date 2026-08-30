import { describe, expect, test } from 'vitest'

import { decideSmartOperatorPrompt } from './smart-route'

describe('smart operator prompt policy', () => {
  test('asks once when no operator has been confirmed', () => {
    expect(
      decideSmartOperatorPrompt({
        countryCode: 'CN',
        detectedOperator: 'telecom',
        preferredOperator: 'unknown',
        operatorConfirmed: false,
      }),
    ).toEqual({
      kind: 'initial',
      detectedOperator: 'telecom',
      selectedOperator: 'telecom',
    })
  })

  test('keeps a confirmed operator when the public IP becomes foreign', () => {
    expect(
      decideSmartOperatorPrompt({
        countryCode: 'US',
        detectedOperator: 'unknown',
        preferredOperator: 'telecom',
        operatorConfirmed: true,
      }),
    ).toEqual({ kind: 'none' })
  })

  test('keeps the saved operator when mainland detection is inconclusive', () => {
    expect(
      decideSmartOperatorPrompt({
        countryCode: 'CN',
        detectedOperator: 'unknown',
        preferredOperator: 'telecom',
        operatorConfirmed: true,
      }),
    ).toEqual({ kind: 'none' })
  })

  test('prompts only for a positive mainland operator change', () => {
    expect(
      decideSmartOperatorPrompt({
        countryCode: 'CN',
        detectedOperator: 'unicom',
        preferredOperator: 'telecom',
        operatorConfirmed: true,
      }),
    ).toEqual({
      kind: 'changed',
      detectedOperator: 'unicom',
      selectedOperator: 'unicom',
    })
  })

  test('remembers an explicit Other choice outside mainland China', () => {
    expect(
      decideSmartOperatorPrompt({
        countryCode: 'JP',
        detectedOperator: 'unknown',
        preferredOperator: 'unknown',
        operatorConfirmed: true,
      }),
    ).toEqual({ kind: 'none' })
  })

  test('treats a legacy non-unknown preference as already confirmed', () => {
    expect(
      decideSmartOperatorPrompt({
        countryCode: 'SG',
        detectedOperator: 'unknown',
        preferredOperator: 'telecom',
        operatorConfirmed: false,
      }),
    ).toEqual({ kind: 'none' })
  })
})
