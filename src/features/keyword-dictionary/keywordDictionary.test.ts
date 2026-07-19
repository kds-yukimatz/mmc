import { describe, expect, it } from 'vitest'
import type { Question } from '../../domain/question'
import { buildFruitKeywordDictionary, buildFruitKeywordRanking } from './keywordDictionary'

const question = (id: string, fruitKeywords: string[], caseType: Question['case'] = 'I') => ({
  id,
  year: 2025,
  case: caseType,
  questionNo: 'Q1',
  answerUnitLabel: '回答対象',
  fruitKeywords,
}) as Question

describe('果キーワード辞典', () => {
  it('同一設問内の重複は一回として集計する', () => {
    const dictionary = buildFruitKeywordDictionary([
      question('2025-I-Q1', ['権限委譲', '権限委譲']),
      question('2025-I-Q2', ['権限委譲']),
    ])

    expect(dictionary.find((entry) => entry.keyword === '権限委譲')).toMatchObject({ count: 2 })
  })

  it('キーワードごとに使われた設問を集約する', () => {
    const dictionary = buildFruitKeywordDictionary([
      question('2024-I-Q2', ['情報共有']),
      question('2025-II-Q3', ['情報共有'], 'II'),
    ])
    const entry = dictionary.find((item) => item.keyword === '情報共有')

    expect(entry?.occurrences.map((occurrence) => occurrence.questionId)).toEqual(['2024-I-Q2', '2025-II-Q3'])
  })

  it('事例別ランキングは対象事例だけを集計する', () => {
    const ranking = buildFruitKeywordRanking([
      question('2025-I-Q1', ['権限委譲', '情報共有']),
      question('2025-I-Q2', ['権限委譲']),
      question('2025-II-Q1', ['情報共有'], 'II'),
    ], 'I')

    expect(ranking).toEqual([
      { keyword: '権限委譲', count: 2 },
      { keyword: '情報共有', count: 1 },
    ])
  })
})
