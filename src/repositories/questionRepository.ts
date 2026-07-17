import { db } from '../db/indexedDb'
import type { TrainingResult } from '../domain/answer'
import type { Question, RawQuestion } from '../domain/question'

interface QuestionData { metadata: { record_count: number }; records: RawQuestion[] }

export const questionIdMigration = {
  '2025-IV-Q1': { kind: 'split', groupId: '2025-IV-Q1' },
  '2025-IV-Q4': { kind: 'split', groupId: '2025-IV-Q4' },
  '2023-IV-Q1': { kind: 'split', groupId: '2023-IV-Q1' },
  '2023-IV-Q2': { kind: 'rename', questionId: '2023-IV-Q2-2-1' },
} as const

export function migrateTrainingResult(result: TrainingResult): TrainingResult {
  if (result.isLegacy || result.legacyQuestionId) return result
  const rule = questionIdMigration[result.questionId as keyof typeof questionIdMigration]
  if (!rule) return result
  if (rule.kind === 'rename') return { ...result, questionId: rule.questionId }
  return { ...result, questionId: rule.groupId, legacyQuestionId: result.questionId, legacyGroupId: rule.groupId, isLegacy: true }
}

export const mapQuestion = (raw: RawQuestion): Question => ({
  id: raw.id,
  year: raw.year,
  case: raw.case,
  questionNo: raw.question_no,
  groupId: raw.group_id ?? raw.id.replace(/-(?:S|W|O|T|\d+)(?:-\d+)?$/, ''),
  subQuestionNo: raw.sub_question_no,
  answerUnitLabel: raw.answer_unit_label ?? raw.answer_target ?? raw.question_summary,
  questionText: raw.question_text ?? '',
  questionSummary: raw.question_summary,
  answerTarget: raw.answer_target,
  mmcTheme: Array.isArray(raw.mmc_theme) ? raw.mmc_theme : [],
  themeStatus: raw.theme_status ?? 'unverified',
  themeSourcePages: raw.theme_source_pages,
  questionStatus: raw.question_status ?? (raw.question_text ? 'verified' : 'unverified'),
  questionSourcePages: raw.question_source_pages,
  modelAnswer: raw.model_answer,
  fruitKeywords: raw.fruit_keywords,
  cuts: raw.cuts,
  status: raw.status,
  sourcePages: raw.source_pages,
  answerSource: raw.answer_source,
  answerStatus: raw.answer_status ?? 'unverified',
  answerSourcePages: raw.answer_source_pages ?? raw.source_pages,
  legacyIds: raw.legacy_ids,
  version: raw.version,
})

export interface QuestionRepository {
  initialize(): Promise<void>
  getAll(): Promise<Question[]>
}

class DexieQuestionRepository implements QuestionRepository {
  async initialize() {
    const response = await fetch('./data/kahotore_mmc_base_v2.json')
    if (!response.ok) throw new Error('問題データを読み込めませんでした')
    const data = (await response.json()) as QuestionData
    const questions = data.records.map(mapQuestion)
    await db.transaction('rw', db.questions, db.trainingResults, async () => {
      const existingResults = await db.trainingResults.toArray()
      const migratedResults = existingResults.map(migrateTrainingResult)
      const changedResults = migratedResults.filter((result, index) => result !== existingResults[index])
      if (changedResults.length) await db.trainingResults.bulkPut(changedResults)
      await db.questions.bulkPut(questions)
      const ids = new Set(questions.map((question) => question.id))
      const obsolete = (await db.questions.toArray()).filter((question) => !ids.has(question.id)).map((question) => question.id)
      if (obsolete.length) await db.questions.bulkDelete(obsolete)
    })
  }
  getAll() { return db.questions.toArray() }
}

export const questionRepository: QuestionRepository = new DexieQuestionRepository()
