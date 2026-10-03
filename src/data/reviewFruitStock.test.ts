import { describe, expect, it } from 'vitest'
import { filterAssociationStock, reviewFruitStock } from './reviewFruitStock'
import { buildAssociationRecords, gradeCandidates } from '../features/association/associationDictionary'
import { studyItems, reviewDefaults, matchesReview } from '../features/weakness/weaknessReview'

describe('再分析の復習ストック', () => {
  it('A・B分類を保ち、事例固有語や個人の得点・答案を含まない', () => {
    expect(reviewFruitStock).toHaveLength(29)
    expect(filterAssociationStock(reviewFruitStock, 'A')).toHaveLength(7)
    expect(filterAssociationStock(reviewFruitStock, 'B')).toHaveLength(22)
    expect(new Set(reviewFruitStock.map((record) => record.id)).size).toBe(29)
    expect(reviewFruitStock.every((record) => record.sourceType === '復習ストック' && record.source && record.fruitKeywords.length && (record.cause || record.purpose))).toBe(true)
    const text = JSON.stringify(reviewFruitStock)
    expect(text).not.toMatch(/20260034|セキュリティ|特選吟醸|ランドナー|フィッティング/)
  })

  it('類似部品の在庫対策では共通化を採点し、DRを代用させない', () => {
    const parts = reviewFruitStock.find((record) => record.id === 'stock-III-parts-commonality')!
    expect(gradeCandidates(parts.fruitKeywords, ['共通化']).score).toBe(100)
    expect(gradeCandidates(parts.fruitKeywords, ['DR']).score).toBe(0)
  })

  it('本試・既存演習を残し、AフィルターでBや既存教材を混入させない', () => {
    const records = buildAssociationRecords([])
    expect(records.some((record) => record.id === 'Cs431-Q2-2')).toBe(true)
    expect(records.some((record) => record.id === 'memo-III-procurement')).toBe(true)
    expect(filterAssociationStock(records, 'stock')).toHaveLength(29)
    expect(filterAssociationStock(records, 'A').every((record) => record.priority === 'A' && record.sourceType === '復習ストック')).toBe(true)
  })

  it('因と目的の対応するモードに出題し、未回答を自動で弱点扱いしない', () => {
    const causes = studyItems([], reviewFruitStock, 'cause', [])
    const purposes = studyItems([], reviewFruitStock, 'purpose', [])
    expect(causes.some((item) => item.association?.id === 'stock-III-parts-commonality')).toBe(true)
    expect(purposes.some((item) => item.association?.id === 'stock-III-dispatch-system')).toBe(true)
    expect(causes.some((item) => item.association?.id === 'stock-III-dispatch-system')).toBe(false)
    expect(causes.every((item) => !matchesReview(item, [], { ...reviewDefaults, weaknessOnly: true }))).toBe(true)
  })
})
