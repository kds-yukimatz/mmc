import { describe, expect, it } from 'vitest'
import { abstractionContent } from '../../repositories/abstractionRepository'
import {
  isAbstractionSlow,
  nextTransferQueue,
  selectPracticeQueue,
} from './abstractionReview'
import type { AbstractionSession } from '../../domain/abstraction'
describe('abstraction queue contracts', () => {
  it('includes shelf-only delay in transfer slow and preserves exact millisecond boundaries', () => {
    expect(isAbstractionSlow('abstract-fruit', 45000, 30001, 'transfer')).toBe(
      true,
    )
    expect(isAbstractionSlow('abstract-fruit', 60000, 30000, 'transfer')).toBe(
      false,
    )
    expect(isAbstractionSlow('abstract-fruit', 60001)).toBe(true)
    expect(isAbstractionSlow('abstract-shelf', 30000)).toBe(false)
    expect(isAbstractionSlow('abstract-shelf', 30001)).toBe(true)
  })
  it('defaults to five reviewed records and excludes unseen records from weakness review', () => {
    const filter = {
      cases: ['I', 'II', 'III'],
      years: [],
      tags: [],
      count: 5,
      unanswered: false,
      review: false,
    }
    expect(
      selectPracticeQueue('abstract-fruit', filter, [], [], []),
    ).toHaveLength(5)
    expect(
      selectPracticeQueue(
        'abstract-fruit',
        { ...filter, review: true },
        [],
        [],
        [],
      ),
    ).toEqual([])
    expect(
      selectPracticeQueue(
        'abstract-fruit',
        { ...filter, cases: ['II'] },
        [],
        [],
        [],
      ).every((x) => x.record.case === 'II'),
    ).toBe(true)
    expect(
      selectPracticeQueue(
        'abstract-fruit',
        { ...filter, years: [1999] },
        [],
        [],
        [],
      ),
    ).toEqual([])
    expect(
      selectPracticeQueue('abstract-fruit', filter, [], [], []).every(
        (x) => x.cueId === 'primary',
      ),
    ).toBe(true)
  })
  it('honors cleared profile tags and does not use guessed source years', () => {
    const record = abstractionContent.records[0],
      id = `abstraction:${record.id}:abstract-fruit`
    const filter = {
      cases: [],
      years: [],
      tags: record.weaknessTags,
      count: 20,
      unanswered: false,
      review: false,
    }
    expect(
      selectPracticeQueue(
        'abstract-fruit',
        filter,
        [],
        [{ id, tags: [] }],
        [],
      ).some((x) => x.record.id === record.id),
    ).toBe(false)
  })
  it('opens the second check exactly 24 hours after completion', () => {
    const session = {
      evaluationKind: 'transfer',
      status: 'completed',
      confirmedResultIds: Array(6).fill('id'),
      completedAt: '2026-10-04T00:00:00.000Z',
      queue: [],
      shownOrdinals: [],
    } as unknown as AbstractionSession
    expect(
      nextTransferQueue([session], new Date('2026-10-04T23:59:59.999Z'))
        .availableAt,
    ).toBe('2026-10-05T00:00:00.000Z')
    expect(
      nextTransferQueue([session], new Date('2026-10-05T00:00:00.000Z')).queue,
    ).toHaveLength(6)
  })
})
