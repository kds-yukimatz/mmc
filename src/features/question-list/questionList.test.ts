import { describe, expect, it } from 'vitest'
import type { Question } from '../../domain/question'
import { getOverviewQuestions } from './questionList'

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
})
