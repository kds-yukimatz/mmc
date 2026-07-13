import { describe, expect, it } from 'vitest'
import { KeywordGrader } from './keywordGrader'

describe('KeywordGrader', () => {
  const grader = new KeywordGrader()
  it('果・切り口・効果語を配点どおり採点する', () => {
    const result = grader.grade({ expectedKeywords: ['権限委譲', '利益責任明確化'], expectedCuts: ['組織構造'], actualKeywords: ['権限委譲で意思決定を迅速化', '利益責任明確化'], actualCuts: ['組織構造'] })
    expect(result.keywordScore).toBe(60)
    expect(result.cutScore).toBe(25)
    expect(result.effectScore).toBe(5)
    expect(result.totalScore).toBe(90)
  })
  it('同義語を一致として扱う', () => {
    const result = grader.grade({ expectedKeywords: ['権限委譲'], expectedCuts: [], actualKeywords: ['裁量付与'], actualCuts: [], useSynonyms: true })
    expect(result.keywordScore).toBe(60)
  })
  it('同義語判定を無効化できる', () => {
    const result = grader.grade({ expectedKeywords: ['権限委譲'], expectedCuts: [], actualKeywords: ['裁量付与'], actualCuts: [], useSynonyms: false })
    expect(result.keywordScore).toBe(0)
  })
  it('全角・空白・記号を正規化する', () => {
    const result = grader.grade({ expectedKeywords: ['EC販路拡大'], expectedCuts: [], actualKeywords: ['ＥＣ　販路・拡大'], actualCuts: [] })
    expect(result.keywordScore).toBe(60)
  })
})
