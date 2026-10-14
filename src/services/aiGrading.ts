import type { GradingResult, MatchDetail } from '../domain/grading'
import type { Question } from '../domain/question'
import { normalizeText } from './synonymNormalizer'

export const AI_GRADING_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8' as const
export interface AiPair { expectedIndex: number; actualIndex: number; reason: string }
export interface AiMatchResponse {
  version: 1
  pairs: { cuts: AiPair[]; fruits: AiPair[] }
  model: typeof AI_GRADING_MODEL
  evaluatedAt: string
}
export interface AiMatchRequest {
  version: 1
  question: Pick<Question, 'id' | 'case' | 'questionText' | 'questionSummary' | 'questionStatus' | 'mmcTheme' | 'themeStatus' | 'modelAnswer' | 'answerStatus'>
  expected: { cuts: string[]; fruits: string[] }
  actual: { cuts: string[]; fruits: string[] }
}
export interface AiMatchingMetadata {
  version: 1
  model: typeof AI_GRADING_MODEL | 'local-exact'
  evaluatedAt: string
  baseScore: Pick<GradingResult, 'keywordScore' | 'cutScore' | 'effectScore' | 'totalScore'>
  cuts: Array<AiPair & { expected: string; actual: string }>
  fruits: Array<AiPair & { expected: string; actual: string }>
}
export interface AiMergedGrading { result: GradingResult; metadata?: AiMatchingMetadata }
export interface AiRequestSnapshot { questionId: string; queueIndex: number; generation: number; inputCuts: string[]; inputFruitKeywords: string[] }
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const OPPOSITE_GROUPS = [
  ['増加', '減少'], ['増加', '削減'], ['向上', '低下'], ['改善', '悪化'], ['拡大', '縮小'], ['強化', '弱体化'], ['確保', '不足'], ['安定', '不安定'], ['流入', '流出'], ['促進', '抑制'], ['高騰', '低下'], ['上昇', '下落'],
]
export const hasOppositeDirection = (expected: string, actual: string) => {
  const left = normalizeText(expected), right = normalizeText(actual)
  return OPPOSITE_GROUPS.some(([positive, negative]) => {
    if (left.endsWith(positive) && right.endsWith(negative)) {
      const leftTarget = left.slice(0, -positive.length), rightTarget = right.slice(0, -negative.length)
      return leftTarget.length >= 2 && leftTarget === rightTarget
    }
    if (left.endsWith(negative) && right.endsWith(positive)) {
      const leftTarget = left.slice(0, -negative.length), rightTarget = right.slice(0, -positive.length)
      return leftTarget.length >= 2 && leftTarget === rightTarget
    }
    return false
  })
}
const validDate = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
export function validateAiMatchResponse(value: unknown): value is AiMatchResponse {
  if (!record(value) || !exactKeys(value, ['version', 'pairs', 'model', 'evaluatedAt']) || value.version !== 1 || value.model !== AI_GRADING_MODEL || !validDate(value.evaluatedAt) || !record(value.pairs) || !exactKeys(value.pairs, ['cuts', 'fruits'])) return false
  const pairsValid = (items: unknown): items is AiPair[] => Array.isArray(items) && items.length <= 20 && items.every((item) => record(item) && exactKeys(item, ['expectedIndex', 'actualIndex', 'reason']) && Number.isInteger(item.expectedIndex) && Number(item.expectedIndex) >= 0 && Number.isInteger(item.actualIndex) && Number(item.actualIndex) >= 0 && typeof item.reason === 'string' && item.reason.trim().length > 0 && item.reason.length <= 100)
  return pairsValid(value.pairs.cuts) && pairsValid(value.pairs.fruits)
}
export function aiGradingEndpoint(): string | null {
  const value = import.meta.env.VITE_AI_GRADING_URL as string | undefined
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && !(import.meta.env.DEV && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null
    return `${url.origin}${url.pathname.replace(/\/$/, '')}/v1/match`
  } catch { return null }
}
export function toAiMatchRequest(question: Question, expectedCuts: string[], expectedFruits: string[], actualCuts: string[], actualFruits: string[]): AiMatchRequest {
  return {
    version: 1,
    question: {
      id: question.id, case: question.case, questionText: question.questionText ?? '', questionSummary: question.questionSummary,
      questionStatus: question.questionStatus ?? 'unverified', mmcTheme: question.mmcTheme, themeStatus: question.themeStatus,
      modelAnswer: question.modelAnswer, answerStatus: question.answerStatus,
    },
    expected: { cuts: [...expectedCuts], fruits: [...expectedFruits] },
    actual: { cuts: [...actualCuts], fruits: [...actualFruits] },
  }
}
export async function requestAiMatches(request: AiMatchRequest, token: string, signal: AbortSignal): Promise<AiMatchResponse> {
  const endpoint = aiGradingEndpoint()
  if (!endpoint) throw new Error('service_unavailable')
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(request), signal })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = record(payload) && typeof payload.error === 'string' ? payload.error : 'request_failed'
    throw new Error(code)
  }
  if (!validateAiMatchResponse(payload)) throw new Error('invalid_model_response')
  return payload
}
const sameMeaningText = (a: string, b: string) => normalizeText(a) === normalizeText(b)
const validFruit = (expected: string, actual: string) => normalizeText(actual).length >= 3 && normalizeText(actual) !== normalizeText('わからない') && !hasOppositeDirection(expected, actual)
function exactPairs(expected: string[], actual: string[], category: 'cut' | 'fruit') {
  const pairs: AiPair[] = [], usedActual = new Set<number>()
  expected.forEach((word, expectedIndex) => {
    const actualIndex = actual.findIndex((candidate, i) => !usedActual.has(i) && !(category === 'fruit' && normalizeText(candidate) === normalizeText('わからない')) && sameMeaningText(word, candidate) && (category === 'cut' || validFruit(word, candidate)))
    if (actualIndex >= 0) { pairs.push({ expectedIndex, actualIndex, reason: '' }); usedActual.add(actualIndex) }
  })
  return pairs
}
function validAiPairs(pairs: AiPair[], expected: string[], actual: string[], fixed: AiPair[], category: 'cut' | 'fruit') {
  const usedExpected = new Set(fixed.map((p) => p.expectedIndex)), usedActual = new Set(fixed.map((p) => p.actualIndex))
  for (const pair of pairs) {
    if (pair.expectedIndex >= expected.length || pair.actualIndex >= actual.length || usedExpected.has(pair.expectedIndex) || usedActual.has(pair.actualIndex)) return false
    const e = expected[pair.expectedIndex], a = actual[pair.actualIndex]
    if (sameMeaningText(e, a) || hasOppositeDirection(e, a) || (category === 'fruit' && !validFruit(e, a))) return false
    usedExpected.add(pair.expectedIndex); usedActual.add(pair.actualIndex)
  }
  return true
}
const weighted = (matched: number, total: number, max: number) => total ? Math.round(matched / total * max) : 0
const combine = (expected: string[], actual: string[], pairs: AiPair[]): MatchDetail[] => pairs.map((pair) => ({ expected: expected[pair.expectedIndex], actual: actual[pair.actualIndex] }))
export function mergeAiMatches(input: {
  response: AiMatchResponse
  expectedCuts: string[]; expectedFruits: string[]; actualCuts: string[]; actualFruits: string[]
  base: GradingResult
}): AiMergedGrading | null {
  const { response, expectedCuts, expectedFruits, actualCuts, actualFruits, base } = input
  if (!validateAiMatchResponse(response)) return null
  const fixedCuts = exactPairs(expectedCuts, actualCuts, 'cut'), fixedFruits = exactPairs(expectedFruits, actualFruits, 'fruit')
  if (!validAiPairs(response.pairs.cuts, expectedCuts, actualCuts, fixedCuts, 'cut') || !validAiPairs(response.pairs.fruits, expectedFruits, actualFruits, fixedFruits, 'fruit')) return null
  const allCuts = [...fixedCuts, ...response.pairs.cuts], allFruits = [...fixedFruits, ...response.pairs.fruits]
  const matchedCuts = combine(expectedCuts, actualCuts, allCuts), matchedKeywords = combine(expectedFruits, actualFruits, allFruits)
  const keywordScore = weighted(matchedKeywords.length, expectedFruits.length, 60), cutScore = weighted(matchedCuts.length, expectedCuts.length, 25)
  const result: GradingResult = { ...base, keywordScore, cutScore, effectScore: base.effectScore, totalScore: keywordScore + cutScore + base.effectScore, matchedCuts, matchedKeywords, missedCuts: expectedCuts.filter((_, i) => !allCuts.some((p) => p.expectedIndex === i)), missedKeywords: expectedFruits.filter((_, i) => !allFruits.some((p) => p.expectedIndex === i)) }
  return { result, metadata: { version: 1, model: response.model, evaluatedAt: response.evaluatedAt, baseScore: { keywordScore: base.keywordScore, cutScore: base.cutScore, effectScore: base.effectScore, totalScore: base.totalScore }, cuts: response.pairs.cuts.map((p) => ({ ...p, expected: expectedCuts[p.expectedIndex], actual: actualCuts[p.actualIndex] })), fruits: response.pairs.fruits.map((p) => ({ ...p, expected: expectedFruits[p.expectedIndex], actual: actualFruits[p.actualIndex] })) } }
}
export function hasAiCandidates(expectedCuts: string[], expectedFruits: string[], actualCuts: string[], actualFruits: string[]) {
  const unresolved = (expected: string[], actual: string[], category: 'cut' | 'fruit') => {
    const fixed = exactPairs(expected, actual, category)
    const usedExpected = new Set(fixed.map((pair) => pair.expectedIndex)), usedActual = new Set(fixed.map((pair) => pair.actualIndex))
    const left = expected.filter((_, index) => !usedExpected.has(index))
    const right = actual.filter((word, index) => !usedActual.has(index) && !(category === 'fruit' && normalizeText(word) === normalizeText('わからない')))
    return left.length > 0 && right.length > 0
  }
  return unresolved(expectedCuts, actualCuts, 'cut') || unresolved(expectedFruits, actualFruits, 'fruit')
}
export function isCurrentAiRequest(request: AiRequestSnapshot, current: AiRequestSnapshot) {
  return request.questionId === current.questionId && request.queueIndex === current.queueIndex && request.generation === current.generation && JSON.stringify(request.inputCuts) === JSON.stringify(current.inputCuts) && JSON.stringify(request.inputFruitKeywords) === JSON.stringify(current.inputFruitKeywords)
}
export function validateAiMatchingMetadata(value: unknown): value is AiMatchingMetadata {
  if (!record(value) || !exactKeys(value, ['version', 'model', 'evaluatedAt', 'baseScore', 'cuts', 'fruits']) || value.version !== 1 || ![AI_GRADING_MODEL, 'local-exact'].includes(value.model as string) || !validDate(value.evaluatedAt) || !record(value.baseScore) || !exactKeys(value.baseScore, ['keywordScore', 'cutScore', 'effectScore', 'totalScore'])) return false
  const baseScore = value.baseScore
  if (!(typeof baseScore.keywordScore === 'number' && baseScore.keywordScore >= 0 && baseScore.keywordScore <= 60 && typeof baseScore.cutScore === 'number' && baseScore.cutScore >= 0 && baseScore.cutScore <= 25 && typeof baseScore.effectScore === 'number' && baseScore.effectScore >= 0 && baseScore.effectScore <= 15 && typeof baseScore.totalScore === 'number' && baseScore.totalScore === baseScore.keywordScore + baseScore.cutScore + baseScore.effectScore)) return false
  const pairsValid = (items: unknown): boolean => {
    if (!Array.isArray(items) || items.length > 20 || !items.every((item) => record(item) && exactKeys(item, ['expectedIndex', 'actualIndex', 'reason', 'expected', 'actual']) && Number.isInteger(item.expectedIndex) && Number(item.expectedIndex) >= 0 && Number.isInteger(item.actualIndex) && Number(item.actualIndex) >= 0 && typeof item.reason === 'string' && item.reason.trim().length > 0 && item.reason.length <= 100 && typeof item.expected === 'string' && item.expected.length > 0 && item.expected.length <= 120 && typeof item.actual === 'string' && item.actual.length > 0 && item.actual.length <= 120)) return false
    return new Set(items.map((item) => (item as Record<string, unknown>).expectedIndex)).size === items.length && new Set(items.map((item) => (item as Record<string, unknown>).actualIndex)).size === items.length
  }
  return pairsValid(value.cuts) && pairsValid(value.fruits) && (value.model !== 'local-exact' || !(value.cuts as unknown[]).length && !(value.fruits as unknown[]).length)
}
