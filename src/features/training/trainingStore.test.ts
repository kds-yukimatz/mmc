import { describe, expect, it } from 'vitest'
import { useTrainingStore } from './trainingStore'
import { mapQuestion } from '../../repositories/questionRepository'
import type { RawQuestion } from '../../domain/question'
import payload from '../../../public/data/kahotore_mmc_base_v2.json'

describe('本試一問一答の二段階回答', () => {
  it('切り口から始まり、果の入力後は次問で切り口に戻る', () => {
    const question = mapQuestion(payload.records.find((record) => record.id === '2023-II-Q1')! as RawQuestion)
    useTrainingStore.getState().start([question, question])
    expect(useTrainingStore.getState().phase).toBe('cuts')
    useTrainingStore.getState().addCut('顧客')
    useTrainingStore.getState().advanceToKeywords()
    expect(useTrainingStore.getState().phase).toBe('keywords')
    expect(useTrainingStore.getState().inputCuts).toEqual(['顧客'])
    useTrainingStore.getState().next()
    expect(useTrainingStore.getState().phase).toBe('cuts')
    expect(useTrainingStore.getState().inputCuts).toEqual([])
  })
})
