import { describe, expect, it } from 'vitest'
import { parseBackup, sameContent } from './backup'
const minimal = {
  schemaVersion: 3,
  results: [],
  profiles: [],
  settings: [],
  microStates: [],
  microAttempts: [],
  microSessions: [],
  microPlans: [],
}
describe('バックアップの書込み前検証', () => {
  it('旧結果はAI情報なしで読み、AI一致の出所情報は検証して往復可能', () => {
    const baseResult = {
      id: 'r1', questionId: 'q1', answeredAt: '2026-10-13T09:00:00.000Z',
      inputCuts: ['切り口'], inputFruitKeywords: ['果'], keywordScore: 60,
      cutScore: 25, effectScore: 15, totalScore: 100, selfRating: 3,
      needsReview: false,
    }
    const old = parseBackup(JSON.stringify({ ...minimal, results: [baseResult] }))
    expect(old.results[0]).not.toHaveProperty('aiMatching')
    const aiMatching = {
      version: 1, model: '@cf/qwen/qwen3-30b-a3b-fp8', evaluatedAt: '2026-10-13T09:01:00.000Z',
      baseScore: { keywordScore: 30, cutScore: 10, effectScore: 5, totalScore: 45 },
      cuts: [{ expectedIndex: 0, actualIndex: 0, expected: '切り口', actual: '入力語', reason: '同じ意味' }], fruits: [],
    }
    expect(parseBackup(JSON.stringify({ ...minimal, results: [{ ...baseResult, aiMatching }] })).results[0].aiMatching).toEqual(aiMatching)
    expect(() => parseBackup(JSON.stringify({ ...minimal, results: [{ ...baseResult, aiMatching: { ...aiMatching, fruits: [{ ...aiMatching.cuts[0], reason: 'x'.repeat(101) }] } }] }))).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...minimal, results: [{ ...baseResult, aiMatching: { ...aiMatching, extra: 'unexpected' } }] }))).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...minimal, results: [{ ...baseResult, aiMatching: { ...aiMatching, cuts: [{ ...aiMatching.cuts[0], extra: 'unexpected' }] } }] }))).toThrow()
  })
  it('v2とv3を読み、不明versionと無効日時・gradeを拒否', () => {
    expect(
      parseBackup(JSON.stringify({ schemaVersion: 2, results: [] }))
        .microAttempts,
    ).toEqual([])
    expect(parseBackup(JSON.stringify(minimal)).schemaVersion).toBe(3)
    expect(() =>
      parseBackup(JSON.stringify({ ...minimal, schemaVersion: 9 })),
    ).toThrow()
    expect(() =>
      parseBackup(
        JSON.stringify({ ...minimal, exportedAt: '2026-02-30T00:00:00Z' }),
      ),
    ).toThrow()
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...minimal,
          microAttempts: [{ id: 's:1', grade: 'excellent' }],
        }),
      ),
    ).toThrow()
  })
  it('同一ID同一内容を1件へ、内容衝突は拒否。キー順と省略undefinedは同一', () => {
    const profile = { id: 'q', tags: ['x'] }
    expect(
      parseBackup(JSON.stringify({ ...minimal, profiles: [profile, profile] }))
        .profiles,
    ).toHaveLength(1)
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...minimal,
          profiles: [profile, { ...profile, tags: ['y'] }],
        }),
      ),
    ).toThrow('内容不一致')
    expect(sameContent({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(sameContent({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
  })
  it('MMC scopeを保存し、旧sessionのscope省略を許し、不正scopeを拒否', () => {
    const session = (id: string, practiceScope?: string) => ({
      id,
      status: 'completed',
      inputMode: 'mental',
      contentVersion: 'micro-seed-3',
      startedAt: '2026-10-06T09:00:00.000Z',
      ordinal: 1,
      activeMs: 0,
      confirmedAttemptIds: [],
      input: [],
      hintUsed: false,
      revealed: false,
      coverageOnly: false,
      override: false,
      cardStartedMs: 0,
      activeRevealMs: 0,
      ...(practiceScope === undefined ? {} : { practiceScope }),
      cardSnapshot: null,
    })
    const scoped = parseBackup(
      JSON.stringify({
        ...minimal,
        microSessions: [session('mmc', 'mmc')],
      }),
    )
    expect(scoped.microSessions[0].practiceScope).toBe('mmc')

    const legacy = parseBackup(
      JSON.stringify({ ...minimal, microSessions: [session('legacy')] }),
    )
    expect(legacy.microSessions[0]).not.toHaveProperty('practiceScope')

    expect(() =>
      parseBackup(
        JSON.stringify({
          ...minimal,
          microSessions: [session('invalid', 'unknown')],
        }),
      ),
    ).toThrow()
  })
})
