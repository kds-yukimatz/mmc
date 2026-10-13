import { describe, expect, it } from 'vitest'
import base from '../../public/data/kahotore_mmc_base_v2.json'
import sparring from '../../public/data/kahotore_mmc_sparring_2026_v1.json'
import training from '../../public/data/kahotore_mmc_training_2026_v1.json'
import type { RawQuestion } from '../domain/question'
import { getOverviewQuestions } from '../features/question-list/questionList'
import { buildFruitKeywordRanking } from '../features/keyword-dictionary/keywordDictionary'
import { gradingService } from '../services/keywordGrader'
import { normalizeText } from '../services/synonymNormalizer'
import { mapQuestion, mergeQuestionData, questionDataFiles } from './questionRepository'

const records = training.records as RawQuestion[]

describe('追加答練・模試・スパーリング②の原文照合済み教材', () => {
  it('全27事例の出典78PDFと設問・枝問を読み込み対象に含める', () => {
    expect(records).toHaveLength(160)
    expect(training.metadata.code_counts).toEqual({
      CS311: 8, CS321: 7, CS331: 5, CS411: 5, CS412: 5, CS421: 4, CS422: 8, CS431: 4, CS432: 6,
      CS511: 8, CS512: 6, CS521: 4, CS522: 9, CS531: 4, CS532: 5,
      ME211: 8, ME221: 4, ME231: 5, ME311: 6, ME321: 8, ME331: 6, ME411: 8, ME421: 4, ME431: 5,
      SP211: 5, SP221: 7, SP231: 6,
    })
    expect(questionDataFiles).toContain('./data/kahotore_mmc_training_2026_v1.json')
    expect(training.metadata.sources).toHaveLength(78)
    expect([...new Set(records.map((record) => record.material_code))].sort()).toEqual([
      'CS311', 'CS321', 'CS331', 'CS411', 'CS412', 'CS421', 'CS422', 'CS431', 'CS432',
      'CS511', 'CS512', 'CS521', 'CS522', 'CS531', 'CS532',
      'ME211', 'ME221', 'ME231', 'ME311', 'ME321', 'ME331', 'ME411', 'ME421', 'ME431',
      'SP211', 'SP221', 'SP231',
    ])
    for (const [code, count] of Object.entries(training.metadata.code_counts)) {
      expect(records.filter((record) => record.material_code === code), code).toHaveLength(count)
    }
    expect(records.every((record) => record.year === 2026 && ['I', 'II', 'III'].includes(record.case))).toBe(true)
  })

  it('既存本試51件とスパーリング①15件をそのまま保持し、IDを衝突させない', () => {
    const merged = mergeQuestionData([
      { metadata: base.metadata, records: base.records as RawQuestion[] },
      { metadata: sparring.metadata, records: sparring.records as RawQuestion[] },
      { metadata: training.metadata, records },
    ])
    expect(merged.slice(0, 51)).toEqual(base.records)
    expect(merged.slice(51, 66)).toEqual(sparring.records)
    expect(merged).toHaveLength(66 + records.length)
    expect(new Set(merged.map((record) => record.id)).size).toBe(merged.length)
  })

  it('全回答に設問・モデル・果・題意の出典を残し、配点と字数を捏造せず記録する', () => {
    const sources = new Map(training.metadata.sources.map((source) => [source.filename, source]))
    for (const source of sources.values()) expect(source.sha256, source.filename).toMatch(/^[a-f0-9]{64}$/)
    for (const record of training.records) {
      expect(record.question_status, record.id).toBe('verified')
      expect(record.answer_status, record.id).toBe('verified')
      expect(record.theme_status, record.id).toBe('verified')
      expect(record.question_source_pages, record.id).toContain('x01jirei.pdf')
      expect(record.answer_source_pages, record.id).toMatch(/x03kaisetu(?:RevA)?\.pdf/)
      for (const reference of [record.question_source_pages, record.answer_source_pages, record.keyword_source_pages, record.theme_source_pages]) {
        const filenames = reference.match(/mmc\d{4}[A-Za-z0-9]+\.pdf/g) ?? []
        expect(filenames.length, `${record.id}: ${reference}`).toBeGreaterThan(0)
        for (const filename of filenames) expect(sources.has(filename), `${record.id}: ${filename}`).toBe(true)
      }
      expect(['question_group', 'answer_unit'], record.id).toContain(record.points_scope)
      expect(record.points, record.id).toBeGreaterThan(0)
      expect(record.max_characters, record.id).toBeGreaterThan(0)
      expect(record.business_context, record.id).not.toMatch(/未設定|不明|TODO/)
      expect(record.group_id, record.id).toBeTruthy()
      expect(record.id === record.group_id || record.id.startsWith(record.group_id + '-'), record.id).toBe(true)
    }
  })

  it('全回答の主要果・切り口を既存採点器で認識できる', () => {
    for (const record of records) {
      expect(record.fruit_keywords.length, record.id).toBeGreaterThan(0)
      expect(record.cuts.length, record.id).toBeGreaterThan(0)
      expect(new Set(record.fruit_keywords).size, record.id).toBe(record.fruit_keywords.length)
      for (const keyword of record.fruit_keywords) expect(normalizeText(keyword).length, `${record.id}: ${keyword}`).toBeGreaterThanOrEqual(3)
      const question = mapQuestion(record)
      const result = gradingService.grade({ expectedKeywords: question.fruitKeywords, expectedCuts: question.cuts,
        actualKeywords: question.fruitKeywords, actualCuts: question.cuts, useSynonyms: true })
      expect(result.keywordScore, record.id).toBe(60)
      expect(result.cutScore, record.id).toBe(25)
    }
  })

  it('別事例のメモを採用せず、改訂解説と原本の年度を採用する', () => {
    expect(records.filter((record) => record.material_code === 'ME221').every((record) =>
      !record.theme_source_pages?.includes('x04memo') && record.answer_source_pages?.includes('mmc2026me221x03kaisetu.pdf'))).toBe(true)
    expect(records.filter((record) => record.material_code === 'ME421').every((record) =>
      record.answer_source_pages?.includes('x03kaisetuRevA.pdf'))).toBe(true)
    expect(records.filter((record) => record.material_code === 'CS532').every((record) =>
      record.year === 2026 && record.question_source_pages?.includes('mmc2025Cs532x01jirei.pdf'))).toBe(true)
    expect(records.filter((record) => record.material_code?.startsWith('SP')).every((record) =>
      !record.theme_source_pages?.includes('x04memo'))).toBe(true)
  })

  it('教材別一覧の英字枝問を正順で並べ、辞典の過去問頻度を変更しない', () => {
    const straight = getOverviewQuestions(records.filter((record) => record.material_code === 'CS512').map(mapQuestion), 2026, 'I')
    expect(straight.slice(0, 3).map((question) => question.id)).toEqual(['2026-CS512-Q1-a', '2026-CS512-Q1-b', '2026-CS512-Q2'])
    const original = base.records.map((record) => mapQuestion(record as RawQuestion))
    const all = [...original, ...records.map(mapQuestion)]
    expect(buildFruitKeywordRanking(all.filter((question) => !question.materialLabel))).toEqual(buildFruitKeywordRanking(original))
  })
})
