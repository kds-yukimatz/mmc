import { describe, expect, it } from 'vitest'
import payload from '../public/data/kahotore_mmc_base_v1.json'

const records = payload.records
const byId = new Map(records.map((record) => [record.id, record]))

describe('問題データ', () => {
  it('全48件に設問文が入っている', () => {
    expect(records).toHaveLength(48)
    expect(records.every((record) => record.question_status === 'verified' && record.question_text.trim().length > 0)).toBe(true)
  })

  it('MMC題意は配列で、確認済みレコードに1件以上ある', () => {
    expect(records.every((record) => Array.isArray(record.mmc_theme))).toBe(true)
    expect(records.filter((record) => record.theme_status === 'verified').every((record) => record.mmc_theme.length > 0)).toBe(true)
  })

  it('2025年度事例ⅠのMMC題意が解説の表記と一致する', () => {
    for (const suffix of ['S', 'W', 'O', 'T']) {
      expect(byId.get(`2025-I-Q1-${suffix}`)?.mmc_theme).toEqual(['経営環境分析（SWOT）'])
    }
    expect(byId.get('2025-I-Q2')?.mmc_theme).toEqual(['事業戦略'])
    expect(byId.get('2025-I-Q3')?.mmc_theme).toEqual(['オペレーション（組織）'])
    expect(byId.get('2025-I-Q4')?.mmc_theme).toEqual(['オペレーション（人事）', '経営理念'])
  })

  it('分割レコードが同じ設問本文と対応する', () => {
    const q1Parts = ['S', 'W', 'O', 'T'].map((suffix) => byId.get(`2025-I-Q1-${suffix}`))
    expect(new Set(q1Parts.map((record) => record?.question_text)).size).toBe(1)
    expect(new Set(q1Parts.map((record) => record?.question_summary)).size).toBe(4)

    expect(byId.get('2025-III-Q2-1')?.question_text).toBe(byId.get('2025-III-Q2-2')?.question_text)
    expect(byId.get('2024-I-Q4-1')?.question_text).toContain('（設問1）')
    expect(byId.get('2024-I-Q4-2')?.question_text).toContain('（設問2）')
  })

  it('設問番号・題意・設問の出典ページがすべて記録されている', () => {
    expect(records.every((record) => record.question_no && record.theme_source_pages && record.question_source_pages)).toBe(true)
  })
})
