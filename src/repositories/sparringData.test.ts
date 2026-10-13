import { describe, expect, it } from 'vitest'
import base from '../../public/data/kahotore_mmc_base_v2.json'
import sparring from '../../public/data/kahotore_mmc_sparring_2026_v1.json'
import type { RawQuestion } from '../domain/question'
import { getQuestionMaterial, pastExamMaterial } from '../domain/questionMaterials'
import { gradingService } from '../services/keywordGrader'
import { buildAssociationRecords } from '../features/association/associationDictionary'
import { mapQuestion, mergeQuestionData } from './questionRepository'

const records = sparring.records as RawQuestion[]
const baseData = { metadata: base.metadata, records: base.records as RawQuestion[] }
const newData = { metadata: sparring.metadata, records }

describe('MMC直前スパーリング①', () => {
  it('全設問・枝問15回答単位を一意に収録し、事例Ⅳを含めない', () => {
    expect(records.map((record) => record.id)).toEqual([
      '2026-SP1-I-Q1', '2026-SP1-I-Q2', '2026-SP1-I-Q3', '2026-SP1-I-Q4', '2026-SP1-I-Q5',
      '2026-SP1-II-Q1', '2026-SP1-II-Q2', '2026-SP1-II-Q3-1', '2026-SP1-II-Q3-2', '2026-SP1-II-Q4',
      '2026-SP1-III-Q1', '2026-SP1-III-Q2', '2026-SP1-III-Q3', '2026-SP1-III-Q4-1', '2026-SP1-III-Q4-2',
    ])
    expect(new Set(records.map((record) => record.id)).size).toBe(15)
    expect(records.every((record) => record.year === 2026 && record.case !== 'IV')).toBe(true)
  })

  it('設問・模範解答・キーワードの出典を分離し、取得した9資料を参照する', () => {
    const sources = sparring.metadata.sources.map((source) => source.filename)
    expect(sources).toHaveLength(9)
    for (const record of sparring.records) {
      expect(record.question_text).toContain(`${record.max_characters}字以内`)
      expect(record.model_answer.length).toBeGreaterThan(20)
      expect(record.question_source_pages).toMatch(/x01jirei\.pdf p[1-8]/)
      expect(record.answer_source_pages).toMatch(/x03kaisetu\.pdf p[23]/)
      expect(record.keyword_source_pages).toContain('x04memo.pdf')
      expect(sources).toContain(record.question_source_pages.split(' ')[0])
      expect(sources).toContain(record.answer_source_pages.split(' ')[0])
    }
  })

  it('明記されていない事例Ⅱの枝問配点を推測せず、事例Ⅲの明記配点を保存する', () => {
    const secondCase = sparring.records.filter((record) => record.group_id === '2026-SP1-II-Q3')
    expect(secondCase).toHaveLength(2)
    expect(secondCase.every((record) => record.points === 40 && record.points_scope === 'question_group')).toBe(true)
    expect(sparring.records.filter((record) => record.group_id === '2026-SP1-III-Q4').map((record) => record.points)).toEqual([20, 20])
  })

  it('公開教材を一緒に読み込み、既存51件の内容・IDを変更せず保持する', () => {
    const merged = mergeQuestionData([baseData, newData])
    expect(merged).toHaveLength(66)
    expect(merged.slice(0, 51)).toEqual(base.records)
    expect(merged.filter((raw) => getQuestionMaterial(mapQuestion(raw)) === pastExamMaterial)).toHaveLength(51)
    expect(merged.filter((raw) => getQuestionMaterial(mapQuestion(raw)) === '直前スパーリング①')).toHaveLength(15)
  })

  it('衝突や不完全な教材をDB更新前に拒否する', () => {
    expect(() => mergeQuestionData([baseData, baseData])).toThrow('教材IDが重複')
    expect(() => mergeQuestionData([{ ...newData, metadata: { record_count: 16 } }])).toThrow('教材形式が不正')
    expect(() => mergeQuestionData([{ metadata: { record_count: 1 }, records: [{ ...records[0], cuts: undefined } as unknown as RawQuestion] }])).toThrow('教材形式が不正')
  })

  it('題意トレにも既存の棚で追加し、本試3年の分類へ混ぜない', () => {
    const associations = buildAssociationRecords(records.map(mapQuestion))
      .filter((record) => record.id.startsWith('base-2026-SP1-'))
    expect(associations.length).toBeGreaterThan(0)
    expect(associations.every((record) => record.sourceType === '答練・模試' && record.source.includes('直前スパーリング①'))).toBe(true)
  })

  it.each(records)('$idの主要果と切り口を既存採点器で採点できる', (record) => {
    const question = mapQuestion(record)
    const result = gradingService.grade({ expectedKeywords: question.fruitKeywords, expectedCuts: question.cuts,
      actualKeywords: question.fruitKeywords, actualCuts: question.cuts, useSynonyms: true })
    expect(result.keywordScore).toBe(60)
    expect(result.cutScore).toBe(25)
    expect(result.missedKeywords).toEqual([])
  })

  it('強み・弱みの方向が逆の回答を果の正解にしない', () => {
    const result = gradingService.grade({ expectedKeywords: ['コスト対応力の不足', '作業能力の低下'],
      expectedCuts: [], actualKeywords: ['コスト対応力', '作業能力向上'], actualCuts: [] })
    expect(result.keywordScore).toBe(0)
  })
})
