import { describe, expect, it } from 'vitest'
import type { TrainingResult } from '../domain/answer'
import { migrateTrainingResult } from './questionRepository'

const base: TrainingResult = {
  id: 'history-1', questionId: '2023-IV-Q1', answeredAt: '2026-07-17T00:00:00.000Z',
  inputCuts: [], inputFruitKeywords: [], keywordScore: 0, cutScore: 0, effectScore: 0,
  totalScore: 0, selfRating: 0, needsReview: true,
}

describe('分割IDの学習履歴移行', () => {
  it('1対多の旧IDは個別レコードへ複製せず親グループの旧記録にする', () => {
    const migrated = migrateTrainingResult(base)
    expect(migrated.questionId).toBe('2023-IV-Q1')
    expect(migrated.legacyQuestionId).toBe('2023-IV-Q1')
    expect(migrated.legacyGroupId).toBe('2023-IV-Q1')
    expect(migrated.isLegacy).toBe(true)
  })

  it('1対1の旧IDは新IDに引き継ぐ', () => {
    expect(migrateTrainingResult({ ...base, questionId: '2023-IV-Q2' }).questionId).toBe('2023-IV-Q2-2-1')
  })

  it('既に移行された旧記録は再変換しない', () => {
    const legacy = { ...base, isLegacy: true, legacyQuestionId: '2023-IV-Q1', legacyGroupId: '2023-IV-Q1' }
    expect(migrateTrainingResult(legacy)).toEqual(legacy)
  })
})
