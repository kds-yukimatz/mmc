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
})
