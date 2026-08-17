import { db } from '../db/indexedDb'
import type { CaseType, RawQuestion } from '../domain/question'
import { mapQuestion } from './questionRepository'

const importKind = 'kahotore-private-question-import'
const validCases = new Set<CaseType>(['I', 'II', 'III', 'IV'])

interface PrivateQuestionImportPayload {
  schemaVersion: number
  kind: typeof importKind
  records: RawQuestion[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validateRecord(value: unknown, index: number): RawQuestion {
  if (!value || typeof value !== 'object') throw new Error(`${index + 1}件目の教材データが不正です`)
  const record = value as Partial<RawQuestion>
  if (!record.private_import) throw new Error(`${index + 1}件目は個人用教材データではありません`)
  if (!record.id || typeof record.id !== 'string') throw new Error(`${index + 1}件目のIDがありません`)
  if (!Number.isInteger(record.year)) throw new Error(`${record.id}の年度が不正です`)
  if (!record.case || !validCases.has(record.case)) throw new Error(`${record.id}の事例区分が不正です`)
  if (!record.question_no || typeof record.question_no !== 'string') throw new Error(`${record.id}の設問番号がありません`)
  if (!record.question_summary || typeof record.question_summary !== 'string') throw new Error(`${record.id}の題意がありません`)
  if (typeof record.model_answer !== 'string') throw new Error(`${record.id}の模範解答が不正です`)
  if (!isStringArray(record.fruit_keywords)) throw new Error(`${record.id}の果キーワードが不正です`)
  if (!isStringArray(record.cuts)) throw new Error(`${record.id}の切り口が不正です`)
  if (!record.status || !record.version) throw new Error(`${record.id}の管理情報が不足しています`)
  return record as RawQuestion
}

export function parsePrivateQuestionImport(text: string): RawQuestion[] {
  const payload = JSON.parse(text) as Partial<PrivateQuestionImportPayload>
  if (payload.kind !== importKind || payload.schemaVersion !== 1 || !Array.isArray(payload.records)) {
    throw new Error('果トレ用の個人教材JSONではありません')
  }
  const records = payload.records.map(validateRecord)
  if (!records.length) throw new Error('取り込める教材データがありません')
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error('教材データ内でIDが重複しています')
  return records
}

export async function importPrivateQuestions(file: File): Promise<number> {
  const records = parsePrivateQuestionImport(await file.text())
  const existingIds = (await db.questions.toArray()).filter((question) => question.privateImport).map((question) => question.id)
  await db.transaction('rw', db.questions, async () => {
    if (existingIds.length) await db.questions.bulkDelete(existingIds)
    await db.questions.bulkPut(records.map((record) => mapQuestion({ ...record, private_import: true })))
  })
  return records.length
}

export async function removePrivateQuestions(): Promise<number> {
  const ids = (await db.questions.toArray()).filter((question) => question.privateImport).map((question) => question.id)
  if (ids.length) await db.questions.bulkDelete(ids)
  return ids.length
}
