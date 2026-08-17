import { describe, expect, it } from 'vitest'
import { parsePrivateQuestionImport } from './privateQuestionImportRepository'

const record = {
  id: '2026-I-CK1-Q1', year: 2026, case: 'I', question_no: 'Q1',
  question_summary: '経営環境分析', model_answer: '模範解答',
  fruit_keywords: ['技術開発力'], cuts: ['強み'], status: 'ocr-unverified',
  answer_status: 'unverified', version: 'private-2026.1', private_import: true,
}

describe('個人教材インポート', () => {
  it('専用形式のレコードを受け付ける', () => {
    const records = parsePrivateQuestionImport(JSON.stringify({
      schemaVersion: 1,
      kind: 'kahotore-private-question-import',
      records: [record],
    }))
    expect(records).toHaveLength(1)
    expect(records[0].fruit_keywords).toEqual(['技術開発力'])
  })

  it('通常のJSONや公開用レコードを拒否する', () => {
    expect(() => parsePrivateQuestionImport(JSON.stringify({ records: [record] }))).toThrow()
    expect(() => parsePrivateQuestionImport(JSON.stringify({
      schemaVersion: 1,
      kind: 'kahotore-private-question-import',
      records: [{ ...record, private_import: false }],
    }))).toThrow('個人用教材データではありません')
  })

  it('重複IDを拒否する', () => {
    expect(() => parsePrivateQuestionImport(JSON.stringify({
      schemaVersion: 1,
      kind: 'kahotore-private-question-import',
      records: [record, record],
    }))).toThrow('IDが重複しています')
  })
})
