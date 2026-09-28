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
  it('R5事例Ⅱの具体的な果に対応する一般的な果を正解にする', () => {
    const result = grader.grade({
      expectedKeywords: ['女子野球需要', '価格競争', '提案力', '加工技術', '仕入力', 'WEB販促力不足'],
      expectedCuts: ['顧客', '競合', '自社'],
      actualKeywords: ['新規需要', '競争激化', '顧客対応力', '技術力', '調達力', '情報発信力不足'],
      actualCuts: ['顧客', '競合', '自社'],
    })
    expect(result.keywordScore).toBe(60)
    expect(result.cutScore).toBe(25)
    expect(result.missedKeywords).toEqual([])
  })
  it('一般語1つで複数の個別語を埋めず、逆方向の語を正解にしない', () => {
    const result = grader.grade({ expectedKeywords: ['自然素材需要', '木育需要', 'WEB販促力不足'], expectedCuts: [], actualKeywords: ['新規需要', '販促力'], actualCuts: [] })
    expect(result.matchedKeywords).toHaveLength(1)
    expect(result.missedKeywords).toContain('WEB販促力不足')
  })
  it('同義語判定オフでは一般化した果も使わない', () => {
    const result = grader.grade({ expectedKeywords: ['加工技術'], expectedCuts: [], actualKeywords: ['技術力'], actualCuts: [], useSynonyms: false })
    expect(result.keywordScore).toBe(0)
  })
  it('競合圧力も価格競争と同じ方向の一般的な果とする', () => {
    const result = grader.grade({ expectedKeywords: ['価格競争'], expectedCuts: [], actualKeywords: ['競合圧力'], actualCuts: [] })
    expect(result.keywordScore).toBe(60)
  })
  it('個別語として使った回答を別の一般語にも再利用しない', () => {
    const result = grader.grade({ expectedKeywords: ['新規需要', '女子野球需要'], expectedCuts: [], actualKeywords: ['新規需要'], actualCuts: [] })
    expect(result.matchedKeywords).toHaveLength(1)
  })
})
