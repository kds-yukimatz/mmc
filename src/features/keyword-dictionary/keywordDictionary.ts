import { fruitKeywordAliases } from '../../data/fruitKeywordAliases'
import type { CaseType, Question } from '../../domain/question'

export interface KeywordOccurrence {
  questionId: string
  year: number
  caseType: CaseType
  questionNo: string
  subQuestionNo?: string
  answerUnitLabel: string
}

export interface FruitKeywordEntry {
  keyword: string
  count: number
  occurrences: KeywordOccurrence[]
}

export interface KeywordRankingItem {
  keyword: string
  count: number
}

function normalizeForLookup(keyword: string) {
  return keyword.trim().replace(/\s+/g, ' ')
}

export function canonicalizeFruitKeyword(keyword: string) {
  const normalized = normalizeForLookup(keyword)
  return fruitKeywordAliases[normalized] ?? normalized
}

function compareKeywords(left: string, right: string) {
  return left.localeCompare(right, 'ja')
}

function compareOccurrences(left: KeywordOccurrence, right: KeywordOccurrence) {
  return right.year - left.year
    || left.caseType.localeCompare(right.caseType)
    || left.questionNo.localeCompare(right.questionNo, 'ja')
    || (left.subQuestionNo ?? '').localeCompare(right.subQuestionNo ?? '', 'ja')
}

/**
 * 設問データから都度生成する。辞典用データを別途保持しない。
 * 同一設問内の重複は一回として数える。
 */
export function buildFruitKeywordDictionary(questions: Question[]): FruitKeywordEntry[] {
  const entries = new Map<string, FruitKeywordEntry>()

  for (const question of questions) {
    const keywordsInQuestion = new Set(question.fruitKeywords.map(canonicalizeFruitKeyword).filter(Boolean))
    for (const keyword of keywordsInQuestion) {
      const entry = entries.get(keyword) ?? { keyword, count: 0, occurrences: [] }
      entry.count += 1
      entry.occurrences.push({
        questionId: question.id,
        year: question.year,
        caseType: question.case,
        questionNo: question.questionNo,
        subQuestionNo: question.subQuestionNo,
        answerUnitLabel: question.answerUnitLabel,
      })
      entries.set(keyword, entry)
    }
  }

  return [...entries.values()]
    .map((entry) => ({ ...entry, occurrences: [...entry.occurrences].sort(compareOccurrences) }))
    .sort((left, right) => compareKeywords(left.keyword, right.keyword))
}

export function buildFruitKeywordRanking(questions: Question[], caseType?: CaseType): KeywordRankingItem[] {
  const source = caseType ? questions.filter((question) => question.case === caseType) : questions
  return buildFruitKeywordDictionary(source)
    .map(({ keyword, count }) => ({ keyword, count }))
    .sort((left, right) => right.count - left.count || compareKeywords(left.keyword, right.keyword))
}
