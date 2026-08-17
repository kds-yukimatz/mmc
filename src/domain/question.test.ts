import { describe, expect, it } from 'vitest'
import type { Question } from './question'
import { isQuestionEligibleForTraining } from './question'

const question = (privateImport: boolean, answerStatus: Question['answerStatus']) => ({
  privateImport,
  answerStatus,
}) as Question

describe('演習対象の判定', () => {
  it('標準問題は確認状態にかかわらず対象にする', () => {
    expect(isQuestionEligibleForTraining(question(false, 'unverified'))).toBe(true)
  })

  it('個人用OCR教材は確認済みのものだけ対象にする', () => {
    expect(isQuestionEligibleForTraining(question(true, 'unverified'))).toBe(false)
    expect(isQuestionEligibleForTraining(question(true, 'verified'))).toBe(true)
  })
})
