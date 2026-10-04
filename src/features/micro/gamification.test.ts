import { describe, expect, it } from 'vitest'
import type { Attempt } from './domain'
import { rollingFruitStamps } from './gamification'

const attempt = (changes: Partial<Attempt> = {}): Attempt => ({
  id: 'session:1',
  sessionId: 'session',
  ordinal: 1,
  mappingId: 'map-1',
  cardId: 'card-1',
  cueId: 'cue-1',
  contentVersion: 'v1',
  answeredAt: '2026-10-04T01:00:00.000Z',
  localDate: '2026-10-04',
  grade: 'fast',
  hintUsed: false,
  override: false,
  activeRevealMs: 1000,
  wasNew: true,
  slot: 'coverage',
  cardKind: 'recall',
  examDate: null,
  ...changes,
})

describe('rollingFruitStamps', () => {
  it('returns seven unearned dates when there are no attempts', () => {
    expect(rollingFruitStamps([], '2026-10-04')).toEqual([
      { date: '2026-09-28', earned: false },
      { date: '2026-09-29', earned: false },
      { date: '2026-09-30', earned: false },
      { date: '2026-10-01', earned: false },
      { date: '2026-10-02', earned: false },
      { date: '2026-10-03', earned: false },
      { date: '2026-10-04', earned: false },
    ])
  })

  it('counts one earned date for duplicate confirmations and includes misses', () => {
    const days = rollingFruitStamps(
      [
        attempt({ id: 'session:1' }),
        attempt({ id: 'other:1', grade: 'miss' }),
      ],
      '2026-10-04',
    )
    expect(days.filter((day) => day.earned)).toEqual([
      { date: '2026-10-04', earned: true },
    ])
  })

  it('uses Tokyo calendar dates across UTC midnight and excludes future/out-of-window dates', () => {
    const days = rollingFruitStamps(
      [
        attempt({ answeredAt: '2026-09-27T14:59:59.000Z' }),
        attempt({ answeredAt: '2026-09-27T15:30:00.000Z' }),
        attempt({ answeredAt: '2026-10-04T14:59:59.000Z' }),
        attempt({ answeredAt: '2026-10-04T15:00:00.000Z' }),
        attempt({ answeredAt: '2026-10-05T02:00:00.000Z' }),
      ],
      '2026-10-04',
    )
    expect(days.filter((day) => day.earned)).toEqual([
      { date: '2026-09-28', earned: true },
      { date: '2026-10-04', earned: true },
    ])
  })
})
