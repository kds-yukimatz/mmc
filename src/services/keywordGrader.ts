import type { GradingInput, GradingResult, GradingService, MatchDetail } from '../domain/grading'
import { isEquivalent, normalizeText } from './synonymNormalizer'

export const effectWords = ['向上', '強化', '改善', '確保', '育成', '定着', '拡大', '低減', '削減', '迅速化', '効率化', '差別化', '関係構築', '売上向上', '収益向上']

function match(expected: string[], actual: string[], useSynonyms: boolean) {
  const matched: MatchDetail[] = []
  const missed: string[] = []
  expected.forEach((expectedItem) => {
    const actualItem = actual.find((item) => isEquivalent(expectedItem, item, useSynonyms))
    if (actualItem) matched.push({ expected: expectedItem, actual: actualItem })
    else missed.push(expectedItem)
  })
  return { matched, missed }
}

const weighted = (matched: number, total: number, max: number) => total ? Math.round((matched / total) * max) : 0

export class KeywordGrader implements GradingService {
  grade(input: GradingInput): GradingResult {
    const useSynonyms = input.useSynonyms ?? true
    const keywords = match(input.expectedKeywords, input.actualKeywords, useSynonyms)
    const cuts = match(input.expectedCuts, input.actualCuts, useSynonyms)
    const allInput = normalizeText([...input.actualKeywords, ...input.actualCuts].join(''))
    const matchedEffects = effectWords.filter((word) => allInput.includes(normalizeText(word)))
    const keywordScore = weighted(keywords.matched.length, input.expectedKeywords.length, 60)
    const cutScore = weighted(cuts.matched.length, input.expectedCuts.length, 25)
    const effectScore = Math.min(15, matchedEffects.length * 5)
    return { keywordScore, cutScore, effectScore, totalScore: keywordScore + cutScore + effectScore, matchedKeywords: keywords.matched, missedKeywords: keywords.missed, matchedCuts: cuts.matched, missedCuts: cuts.missed, matchedEffects }
  }
}

export const gradingService: GradingService = new KeywordGrader()
