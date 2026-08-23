import { describe, expect, it } from 'vitest'
import payload from '../../../public/data/kahotore_trigger_dictionary_v1.json'
import { gradeAssociation, reinforcementRecords, shelves } from './associationDictionary'

describe('題意トリガー辞書', () => {
  it('指定された事例別の棚を保持する', () => {
    expect(shelves.I).toEqual(['SWOT・強み', '経営戦略', '組織構造', '人的資源管理', '新事業・事業展開'])
    expect(shelves.II).toContain('関係性マーケティング')
    expect(shelves.III).toEqual(['強み', '設計', '生産管理', '品質管理', '情報管理', '営業', '技能承継', '外注'])
  })

  it('強化答練レコードは全件sourceを持つ', () => {
    expect(reinforcementRecords.length).toBeGreaterThan(30)
    expect(reinforcementRecords.every((record) => record.sourceType === '強化答練' && record.source.startsWith('MMC 26-Cs'))).toBe(true)
    expect(payload.records.every((record) => record.source && record.source_type === '強化答練')).toBe(true)
  })

  it.each([
    ['Cs421-Q3', 'サービス', ['ペアプログラミングサービス', '相談サービス', 'レッスンの振替サービス']],
    ['Cs431-Q2-1', '設計', ['VE', '設計効率化']],
    ['Cs431-Q2-2', '設計', ['DR', '設計効率化']],
    ['Cs432-Q2-1', '生産管理', ['精度の高い需要予測', '適正在庫', '適正な生産調整']],
    ['Cs432-Q4-2', '品質管理', ['ポカヨケ']],
    ['Cs432-Q5-2', '外注', ['新たな外注先の開拓']],
  ])('%s の棚と果が原資料の対応どおり', (id, shelf, fruits) => {
    const record = reinforcementRecords.find((item) => item.id === id)
    expect(record?.shelf).toBe(shelf)
    expect(record?.fruitKeywords).toEqual(fruits)
  })

  it('既存の同義語判定を題意トレにも流用する', () => {
    expect(gradeAssociation(['技能承継'], ['技術承継']).score).toBe(100)
    expect(gradeAssociation(['人的資源管理'], ['人事']).score).toBe(100)
  })
})
