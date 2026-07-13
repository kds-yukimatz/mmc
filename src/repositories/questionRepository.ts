import { db } from '../db/indexedDb'
import type { Question, RawQuestion } from '../domain/question'

interface QuestionData { metadata: { record_count: number }; records: RawQuestion[] }

const mapQuestion = (raw: RawQuestion): Question => ({ id: raw.id, year: raw.year, case: raw.case, questionNo: raw.question_no, questionSummary: raw.question_summary, modelAnswer: raw.model_answer, fruitKeywords: raw.fruit_keywords, cuts: raw.cuts, status: raw.status, sourcePages: raw.source_pages, version: raw.version })

export interface QuestionRepository {
  initialize(): Promise<void>
  getAll(): Promise<Question[]>
}

class DexieQuestionRepository implements QuestionRepository {
  async initialize() {
    const response = await fetch('./data/kahotore_mmc_base_v1.json')
    if (!response.ok) throw new Error('問題データを読み込めませんでした')
    const data = (await response.json()) as QuestionData
    const questions = data.records.map(mapQuestion)
    await db.transaction('rw', db.questions, async () => {
      await db.questions.bulkPut(questions)
      const ids = new Set(questions.map((question) => question.id))
      const obsolete = (await db.questions.toArray()).filter((question) => !ids.has(question.id)).map((question) => question.id)
      if (obsolete.length) await db.questions.bulkDelete(obsolete)
    })
  }
  getAll() { return db.questions.toArray() }
}

export const questionRepository: QuestionRepository = new DexieQuestionRepository()
