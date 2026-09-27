import { describe, expect, it } from 'vitest'
import type { TrainingResult } from '../../domain/answer'
import type { StudyItem } from './weaknessReview'
import { dashboard, matchesReview, nextStreak, priorityScore, reviewDefaults, suggestedTags } from './weaknessReview'

const item: StudyItem = { id: 'q1', year: 2025, case: 'III', mode: 'question', tags: ['資材管理', '安全在庫'] }
const now = new Date('2026-09-28T00:00:00Z')
const result = (patch: Partial<TrainingResult> = {}): TrainingResult => ({
  id: 'r1', questionId: 'q1', answeredAt: '2026-09-27T00:00:00Z',
  inputCuts: [], inputFruitKeywords: [], keywordScore: 0, cutScore: 0, effectScore: 0,
  totalScore: 20, selfRating: 1, elapsedSeconds: 230, needsReview: true,
  correct: false, struggleReasons: ['slow', 'fruit-missing'], weaknessTags: ['資材管理'], streak: 0,
  ...patch,
})

describe('weakness review', () => {
  it('combines case, year, tag, and struggle conditions with AND', () => {
    const filter = { ...reviewDefaults, cases: ['III'], years: [2025], tags: ['安全在庫'], lastIncorrect: true, lastSlow: true, lowAccuracy: true, recentMistake: true, recentCount: 3 }
    expect(matchesReview(item, [result()], filter, now)).toBe(true)
    expect(matchesReview(item, [result()], { ...filter, cases: ['I'] }, now)).toBe(false)
    expect(matchesReview(item, [result({ struggleReasons: ['fruit-missing'], elapsedSeconds: 100 })], filter, now)).toBe(false)
    expect(matchesReview(item, [], filter, now)).toBe(false)
  })

  it('treats every unreviewed item and old answers as stale', () => {
    const filter = { ...reviewDefaults, stale: true }
    expect(matchesReview(item, [], filter, now)).toBe(true)
    expect(matchesReview(item, [result()], filter, now)).toBe(false)
    expect(matchesReview(item, [result({ answeredAt: '2026-08-01T00:00:00Z' })], filter, now)).toBe(true)
  })

  it('ranks a recent fruit recall failure above a fast correct streak', () => {
    const weak = [result()]
    const mastered = [result({ correct: true, totalScore: 100, selfRating: 3, elapsedSeconds: 25, struggleReasons: [], streak: 3, needsReview: false })]
    expect(priorityScore(item, weak, now)).toBeGreaterThan(priorityScore(item, mastered, now))
    expect(nextStreak('q1', true, mastered)).toBe(4)
    expect(nextStreak('q1', false, mastered)).toBe(0)
  })

  it('separates fruit recall from theme uncertainty in dashboard counts', () => {
    const view = dashboard([item], [result(), result({ id: 'r2', struggleReasons: ['theme-uncertain'] })])
    expect(view.fruitMissing).toBe(1)
    expect(view.themeUncertain).toBe(1)
    expect(view.byCase.find((row) => row.name === '事例III')?.rate).toBe(0)
  })

  it('maps inventory wording to editable weakness tags', () => {
    const tags = suggestedTags({ id: 'memo', year: 2026, case: 'III', trigger: '調達に1か月', shelf: '生産管理', fruitKeywords: ['発注点設定', '安全在庫設定'], source: '演習メモ', sourceType: '演習メモ' })
    expect(tags).toEqual(expect.arrayContaining(['資材管理', '発注点', '安全在庫']))
  })
})
