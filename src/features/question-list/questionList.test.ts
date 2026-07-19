import { describe, expect, it } from 'vitest'
import type { Question } from '../../domain/question'
import { getOverviewQuestions } from './questionList'
import { getLearningSequence, getNextLearningTarget, resolveLearningTarget } from './learningSequence'

const question = (id: string, year = 2025, caseType: Question['case'] = 'I') => ({ id, year, case: caseType }) as Question

describe('年度別一覧の並び順', () => {
  it('年度と事例で絞り込み、本試験の順序で並べる', () => {
    const result = getOverviewQuestions([
      question('2025-I-Q2'), question('2025-I-Q1-T'), question('2024-I-Q1-S', 2024),
      question('2025-I-Q1-W'), question('2025-II-Q1', 2025, 'II'), question('2025-I-Q1-S'),
      question('2025-I-Q1-O'),
    ], 2025, 'I')
    expect(result.map((item) => item.id)).toEqual([
      '2025-I-Q1-S', '2025-I-Q1-W', '2025-I-Q1-O', '2025-I-Q1-T', '2025-I-Q2',
    ])
  })

  it('数値の小問を文字列順ではなく数値順に並べる', () => {
    const result = getOverviewQuestions([question('2025-I-Q2-10'), question('2025-I-Q2-2'), question('2025-I-Q2-1')], 2025, 'I')
    expect(result.map((item) => item.id)).toEqual(['2025-I-Q2-1', '2025-I-Q2-2', '2025-I-Q2-10'])
  })

  it('事例優先・年度降順の学習順をデータから生成する', () => {
    const questions = [
      question('2025-I-Q1'), question('2024-I-Q1', 2024), question('2023-I-Q1', 2023),
      question('2025-II-Q1', 2025, 'II'), question('2024-II-Q1', 2024, 'II'), question('2023-II-Q1', 2023, 'II'),
    ]
    expect(getLearningSequence(questions)).toEqual([
      { year: 2025, caseType: 'I' }, { year: 2024, caseType: 'I' }, { year: 2023, caseType: 'I' },
      { year: 2025, caseType: 'II' }, { year: 2024, caseType: 'II' }, { year: 2023, caseType: 'II' },
    ])
  })

  it('同じ事例を年度横断し、最古年度の次は次の事例の最新年度へ進む', () => {
    const questions = [
      question('2025-I-Q1'), question('2024-I-Q1', 2024), question('2023-I-Q1', 2023),
      question('2025-II-Q1', 2025, 'II'),
    ]
    expect(getNextLearningTarget(questions, { year: 2025, caseType: 'I' })).toEqual({ year: 2024, caseType: 'I' })
    expect(getNextLearningTarget(questions, { year: 2023, caseType: 'I' })).toEqual({ year: 2025, caseType: 'II' })
    expect(getNextLearningTarget(questions, { year: 2025, caseType: 'II' })).toBeUndefined()
  })

  it('存在しない事例を選んだ場合は同年度の事例Ⅰへ戻す', () => {
    const questions = [question('2025-I-Q1'), question('2025-II-Q1', 2025, 'II')]
    expect(resolveLearningTarget(questions, { year: 2025, caseType: 'III' })).toEqual({ year: 2025, caseType: 'I' })
  })
})
