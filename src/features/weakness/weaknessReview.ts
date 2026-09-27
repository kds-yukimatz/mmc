import type { TrainingResult, WeaknessProfile } from '../../domain/answer'
import type { CaseType, Question } from '../../domain/question'
import type { AssociationRecord, TrainingMode } from '../../domain/association'

export const tagCatalog: Record<Exclude<CaseType, 'IV'>, string[]> = {
  I: ['組織構造', '部門間連携', '権限委譲', '意思決定', '営業施策', '営業力', '顧客接点', '販路開拓', '営業情報共有', '技術蓄積', '技術共有', '技能承継', '採用', '配置', '評価報酬', '教育訓練', '柔軟勤務', 'モラール', '定着', '人事施策'],
  II: ['ターゲット', '顧客ニーズ', '商品・品揃え', 'サービス', '販促チャネル', 'プロモーション', '関係性', '協業', '題意判断'],
  III: ['生産計画', '工程管理', '作業管理', '品質管理', '資材管理', '製品在庫', '材料在庫', '発注点', '安全在庫', '外注管理', '納期管理', '情報共有', '情報システム', '営業力', '技能承継'],
}

export const presets = {
  I: ['営業施策', '部門間連携', '技術共有', '組織構造', '権限委譲', '人事施策'],
  III: ['製品在庫', '資材管理', '発注点', '安全在庫', '生産計画', '納期管理', '情報共有'],
} as const

export interface StudyItem {
  id: string
  year: number
  case: CaseType
  mode: TrainingMode
  tags: string[]
  question?: Question
  association?: AssociationRecord
}

const unique = (values: string[]) => [...new Set(values.filter(Boolean))]

const tagPatterns: Array<[string, RegExp]> = [
  ['営業施策', /営業|販路|顧客開拓/], ['営業力', /営業力|提案力/], ['販路開拓', /販路開拓/],
  ['組織構造', /組織|専門部署|プロジェクトチーム/], ['部門間連携', /部門間|横断|連携|定例会議|定期会議/],
  ['権限委譲', /権限委譲/], ['技術共有', /技術共有|知識共有|勉強会|技術.*共有/],
  ['技能承継', /技能承継|技術承継|OJT|マニュアル化/], ['採用', /採用/], ['配置', /配置/],
  ['評価報酬', /評価|報酬|成果主義/], ['教育訓練', /教育|研修/], ['人事施策', /人事|人材|採用|配置|評価|報酬/],
  ['販促チャネル', /広告|販促チャネル/], ['プロモーション', /販促|プロモーション/],
  ['生産計画', /生産計画|需要予測/], ['工程管理', /工程管理|進捗管理/], ['品質管理', /品質|ポカヨケ|QCサークル/],
  ['資材管理', /資材|部品|調達|発注/], ['製品在庫', /製品在庫|適正在庫|欠品|過剰在庫/],
  ['材料在庫', /材料在庫|部品在庫/], ['発注点', /発注点/], ['安全在庫', /安全在庫/],
  ['外注管理', /外注/], ['納期管理', /納期/], ['情報共有', /情報共有|共有データベース|一元管理/],
  ['情報システム', /ネットワーク|データベース|DB化|情報システム/],
]

export function suggestedTags(item: Question | AssociationRecord): string[] {
  const text = 'trigger' in item
    ? [item.trigger ?? '', item.shelf ?? '', item.cause ?? '', item.purpose ?? '', ...item.fruitKeywords].join('／')
    : [item.questionSummary, item.answerUnitLabel, ...item.mmcTheme, ...item.cuts, ...item.fruitKeywords].join('／')
  const available = item.case === 'IV' ? [] : tagCatalog[item.case]
  return unique([
    ...('weaknessTags' in item ? (item.weaknessTags ?? []) : []),
    ...tagPatterns.filter(([tag, pattern]) => available.includes(tag) && pattern.test(text)).map(([tag]) => tag),
  ])
}

export function studyItems(questions: Question[], associations: AssociationRecord[], mode: TrainingMode, profiles: WeaknessProfile[]): StudyItem[] {
  const saved = new Map(profiles.map((profile) => [profile.id, profile.tags]))
  if (mode === 'question') return questions.map((question) => ({ id: question.id, year: question.year, case: question.case, mode, question, tags: saved.get(question.id) ?? suggestedTags(question) }))
  return associations.filter((record) => mode === 'cause' ? Boolean(record.cause) : mode === 'purpose' ? Boolean(record.purpose) : true).map((record) => {
    const id = `association-${record.id}-${mode}`
    return { id, year: record.year, case: record.case, mode, association: record, tags: saved.get(id) ?? suggestedTags(record) }
  })
}

export function isCorrect(result: TrainingResult): boolean {
  return result.correct ?? (result.totalScore >= 70 && result.selfRating >= 2)
}

export interface ReviewFilter {
  cases: string[]
  years: number[]
  tags: string[]
  weaknessOnly: boolean
  lastIncorrect: boolean
  lastSlow: boolean
  lowAccuracy: boolean
  recentMistake: boolean
  stale: boolean
  recentCount: number
}

export const reviewDefaults: ReviewFilter = { cases: [], years: [], tags: [], weaknessOnly: false, lastIncorrect: false, lastSlow: false, lowAccuracy: false, recentMistake: false, stale: false, recentCount: 5 }

export const reviewThresholds = { lowAccuracy: 0.6, recentDays: 14, staleDays: 30, slowSeconds: 180 }
export const priorityWeights = { incorrect: 100, fruitMissing: 90, slow: 65, repeatedTagFailure: 25, stale: 45, unseen: 30, streak: -25, fastCorrect: -20, recentReview: -20 }

function daysAgo(iso: string, now: Date) { return (now.getTime() - new Date(iso).getTime()) / 86_400_000 }
export function latestFor(item: StudyItem, results: TrainingResult[]): TrainingResult | undefined { return results.find((result) => result.questionId === item.id) }

export function matchesReview(item: StudyItem, results: TrainingResult[], filter: ReviewFilter, now = new Date()): boolean {
  if (filter.cases.length && !filter.cases.includes(item.case)) return false
  if (filter.years.length && !filter.years.includes(item.year)) return false
  if (filter.tags.length && !filter.tags.some((tag) => item.tags.includes(tag))) return false
  const history = results.filter((result) => result.questionId === item.id)
  const latest = history[0]
  const weak = latest && (!isCorrect(latest) || latest.needsReview || (latest.struggleReasons?.length ?? 0) > 0)
  if (filter.weaknessOnly && !weak) return false
  if (filter.lastIncorrect && (!latest || isCorrect(latest))) return false
  if (filter.lastSlow && !latest?.struggleReasons?.includes('slow') && (latest?.elapsedSeconds ?? 0) < reviewThresholds.slowSeconds) return false
  if (filter.lowAccuracy) {
    const recent = history.slice(0, filter.recentCount)
    if (!recent.length || recent.filter(isCorrect).length / recent.length >= reviewThresholds.lowAccuracy) return false
  }
  if (filter.recentMistake && !history.some((result) => !isCorrect(result) && daysAgo(result.answeredAt, now) <= reviewThresholds.recentDays)) return false
  if (filter.stale && latest && daysAgo(latest.answeredAt, now) < reviewThresholds.staleDays) return false
  return true
}

export function priorityScore(item: StudyItem, results: TrainingResult[], now = new Date()): number {
  const history = results.filter((result) => result.questionId === item.id)
  const latest = history[0]
  if (!latest) return priorityWeights.unseen
  let score = 0
  if (!isCorrect(latest)) score += priorityWeights.incorrect
  if (latest.struggleReasons?.includes('fruit-missing')) score += priorityWeights.fruitMissing
  if (latest.struggleReasons?.includes('slow') || (latest.elapsedSeconds ?? 0) >= reviewThresholds.slowSeconds) score += priorityWeights.slow
  if (daysAgo(latest.answeredAt, now) >= reviewThresholds.staleDays) score += priorityWeights.stale
  if ((latest.streak ?? 0) >= 2) score += priorityWeights.streak
  if (isCorrect(latest) && (latest.elapsedSeconds ?? Infinity) < 60) score += priorityWeights.fastCorrect
  if (daysAgo(latest.answeredAt, now) < 1 && history.length >= 2) score += priorityWeights.recentReview
  const repeated = history.filter((result) => !isCorrect(result) && (result.weaknessTags ?? []).some((tag) => item.tags.includes(tag))).length
  if (repeated >= 2) score += priorityWeights.repeatedTagFailure * Math.min(repeated - 1, 3)
  return score
}

export function nextStreak(questionId: string, correct: boolean, results: TrainingResult[]): number {
  if (!correct) return 0
  const latest = results.find((result) => result.questionId === questionId)
  if (!latest || !isCorrect(latest)) return 1
  return (latest.streak ?? 1) + 1
}

export function dashboard(items: StudyItem[], results: TrainingResult[]) {
  const answered = items.map((item) => ({ item, latest: latestFor(item, results) })).filter((row): row is { item: StudyItem; latest: TrainingResult } => Boolean(row.latest))
  const rate = (rows: typeof answered) => rows.length ? Math.round(rows.filter((row) => isCorrect(row.latest)).length / rows.length * 100) : null
  const byCase = (['I', 'II', 'III'] as const).map((caseName) => ({ name: `事例${caseName}`, rate: rate(answered.filter((row) => row.item.case === caseName)) }))
  const tags = [...new Set(items.flatMap((item) => item.tags))].map((tag) => ({ name: tag, rate: rate(answered.filter((row) => row.item.tags.includes(tag))) })).filter((row) => row.rate !== null).sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))
  return {
    byCase, tags,
    recent: results.filter((result) => result.struggleReasons?.length || !isCorrect(result)).slice(0, 5),
    today: items.filter((item) => priorityScore(item, results) > 0).sort((a, b) => priorityScore(b, results) - priorityScore(a, results)).slice(0, 5),
    mastered: answered.filter((row) => (row.latest.streak ?? 0) >= 2).length,
    unseen: items.length - answered.length,
    fruitMissing: results.filter((result) => result.struggleReasons?.includes('fruit-missing')).length,
    themeUncertain: results.filter((result) => result.struggleReasons?.includes('theme-uncertain')).length,
  }
}
