import { describe, expect, it } from 'vitest'
import type { GradingResult } from '../domain/grading'
import { hasAiCandidates, isCurrentAiRequest, mergeAiMatches, validateAiMatchResponse, type AiMatchResponse } from './aiGrading'
const base: GradingResult = { keywordScore: 0, cutScore: 0, effectScore: 5, totalScore: 5, matchedKeywords: [], missedKeywords: ['売上増加'], matchedCuts: [], missedCuts: ['販路開拓'], matchedEffects: ['向上'] }
const response = (cuts: AiMatchResponse['pairs']['cuts'] = [], fruits: AiMatchResponse['pairs']['fruits'] = []): AiMatchResponse => ({ version: 1, pairs: { cuts, fruits }, model: '@cf/qwen/qwen3-30b-a3b-fp8', evaluatedAt: '2026-10-13T09:00:00.000Z' })
describe('AI意味ペア照合', () => {
  it('意味同等の切り口と果のペアだけ既存配点へ加え、効果点は維持する', () => {
    const merged = mergeAiMatches({ response: response([{ expectedIndex: 0, actualIndex: 0, reason: '同じ販路施策' }], [{ expectedIndex: 0, actualIndex: 0, reason: '同じ売上成果' }]), expectedCuts: ['販路開拓'], expectedFruits: ['売上増加'], actualCuts: ['販売経路の拡大'], actualFruits: ['販売高の伸長'], base })
    expect(merged?.result).toMatchObject({ keywordScore: 60, cutScore: 25, effectScore: 5, totalScore: 90 })
    expect(merged?.result.matchedKeywords).toEqual([{ expected: '売上増加', actual: '販売高の伸長' }])
    expect(merged?.metadata?.fruits[0].reason).toBe('同じ売上成果')
  })
  it('NFKCの完全一致はAIなしでも一対一固定し、重複入力を二重加点しない', () => {
    const merged = mergeAiMatches({ response: response(), expectedCuts: ['ＡＢＣ', 'ABC'], expectedFruits: ['売上増加'], actualCuts: ['ABC'], actualFruits: ['売上増加'], base })
    expect(merged?.result.cutScore).toBe(13)
    expect(merged?.result.keywordScore).toBe(60)
    expect(hasAiCandidates(['ＡＢＣ'], ['売上増加'], ['ABC'], ['売上増加'])).toBe(false)
  })
  it.each([
    ['方向反転', ['売上増加'], ['売上減少']],
    ['3字未満果', ['売上増加'], ['増加']],
    ['否定・制限の差', ['売上増加'], ['売上減少']],
  ])('%sの果ペアを拒否する', (_label, expectedFruits, actualFruits) => {
    expect(mergeAiMatches({ response: response([], [{ expectedIndex: 0, actualIndex: 0, reason: '似ています' }]), expectedCuts: [], expectedFruits, actualCuts: [], actualFruits, base })).toBeNull()
  })
  it('削減と減少の同義ペアは狭い方向逆判定で拒否しない', () => {
    const merged = mergeAiMatches({ response: response([], [{ expectedIndex: 0, actualIndex: 0, reason: '同じ費用削減の成果' }]), expectedCuts: [], expectedFruits: ['コスト削減'], actualCuts: [], actualFruits: ['費用の減少'], base })
    expect(merged?.result.keywordScore).toBe(60)
  })
  it('同じactualへの二重得点と範囲外indexは全体拒否し、包含語もAI候補に残す', () => {
    expect(mergeAiMatches({ response: response([{ expectedIndex: 0, actualIndex: 0, reason: 'x' }, { expectedIndex: 1, actualIndex: 0, reason: 'x' }]), expectedCuts: ['販路開拓', '市場開拓'], expectedFruits: [], actualCuts: ['販売路の販路開拓'], actualFruits: [], base })).toBeNull()
    expect(hasAiCandidates(['販路開拓'], [], ['販路開拓強化'], [])).toBe(true)
    expect(mergeAiMatches({ response: response([{ expectedIndex: 2, actualIndex: 0, reason: 'x' }]), expectedCuts: ['販路開拓'], expectedFruits: [], actualCuts: ['販売経路拡大'], actualFruits: [], base })).toBeNull()
  })
  it('方向逆は対象語が同じ場合だけ拒否し、「わからない」は候補にしない', () => {
    expect(mergeAiMatches({ response: response([], [{ expectedIndex: 0, actualIndex: 0, reason: '逆' }]), expectedCuts: [], expectedFruits: ['生産能力向上'], actualCuts: [], actualFruits: ['生産能力低下'], base })).toBeNull()
    expect(mergeAiMatches({ response: response([], [{ expectedIndex: 0, actualIndex: 0, reason: '同じ方向' }]), expectedCuts: [], expectedFruits: ['コスト削減'], actualCuts: [], actualFruits: ['費用の減少'], base })?.result.keywordScore).toBe(60)
    expect(mergeAiMatches({ response: response([], [{ expectedIndex: 0, actualIndex: 0, reason: '同じ方向' }]), expectedCuts: [], expectedFruits: ['人材不足'], actualCuts: [], actualFruits: ['人材確保'], base })).toBeNull()
    expect(mergeAiMatches({ response: response([], [{ expectedIndex: 0, actualIndex: 0, reason: '同義' }]), expectedCuts: [], expectedFruits: ['人材不足解消'], actualCuts: [], actualFruits: ['人材確保'], base })?.result.keywordScore).toBe(60)
    expect(hasAiCandidates([], ['売上増加'], [], ['わからない'])).toBe(false)
  })
  it('応答の構造と理由の上限を検証する', () => {
    expect(validateAiMatchResponse(response())).toBe(true)
    expect(validateAiMatchResponse({ ...response(), pairs: { cuts: [{ expectedIndex: 0, actualIndex: 0, reason: 'x'.repeat(101) }], fruits: [] } })).toBe(false)
  })
  it('question・queue index・generation・入力が変わった遅延応答を拒否する', () => {
    const request = { questionId: 'q1', queueIndex: 0, generation: 3, inputCuts: ['販路'], inputFruitKeywords: ['売上'] }
    expect(isCurrentAiRequest(request, { ...request })).toBe(true)
    expect(isCurrentAiRequest(request, { ...request, queueIndex: 1 })).toBe(false)
    expect(isCurrentAiRequest(request, { ...request, generation: 4 })).toBe(false)
    expect(isCurrentAiRequest(request, { ...request, inputFruitKeywords: ['利益'] })).toBe(false)
  })
})
