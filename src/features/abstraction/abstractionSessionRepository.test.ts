import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  results: new Map<string, unknown>(),
  profiles: new Map<string, unknown>(),
}))
vi.mock('../../db/indexedDb', () => {
  const table = (rows: Map<string, unknown>) => ({
    toArray: async () => structuredClone([...rows.values()]),
    get: async (id: string) =>
      rows.has(id) ? structuredClone(rows.get(id)) : undefined,
    put: async (row: { id: string }) => {
      rows.set(row.id, structuredClone(row))
      return row.id
    },
    add: async (row: { id: string }) => {
      if (rows.has(row.id)) throw new Error('duplicate')
      rows.set(row.id, structuredClone(row))
      return row.id
    },
    where: () => ({
      equals: (id: string) => ({
        toArray: async () =>
          structuredClone(
            [...rows.values()].filter(
              (row) => (row as { questionId: string }).questionId === id,
            ),
          ),
      }),
    }),
  })
  return {
    db: {
      abstractionSessions: table(state.sessions),
      trainingResults: table(state.results),
      weaknessProfiles: table(state.profiles),
      settings: { get: async () => ({ synonymsEnabled: true }) },
      transaction: async (...args: unknown[]) =>
        (args.at(-1) as () => unknown)(),
    },
  }
})
import { abstractionContent } from '../../repositories/abstractionRepository'
import {
  commitAbstractionResult,
  gradeAbstractionSession,
  loadAbstractionForResume,
  markAbstractionShown,
  resumeAbstractionSession,
  saveAbstractionDraft,
  startAbstractionSession,
  startTransferCheck,
} from './abstractionSessionRepository'
import { nextTransferQueue } from './abstractionReview'
import type { AbstractionSession } from '../../domain/abstraction'

describe('abstraction persisted state guards', () => {
  beforeEach(() => {
    state.sessions.clear()
    state.results.clear()
    state.profiles.clear()
  })
  it('rejects stale tab drafts and grading after another tab advances the ordinal', async () => {
    const session = await startAbstractionSession(
      'abstract-shelf',
      abstractionContent.records.slice(0, 2),
    )
    await markAbstractionShown(session.id, 1)
    const input = {
      mode: 'abstract-shelf' as const,
      shelves: ['人事'],
      frameworks: [],
      cuts: [],
      fruits: [],
    }
    await gradeAbstractionSession(session.id, 1, 'answering', input, 1500)
    const feedback = {
      correct: true,
      selfRating: 3 as const,
      needsReview: false,
      struggleReasons: [],
      weaknessTags: [],
    }
    const next = await commitAbstractionResult(session.id, 1, feedback)
    expect(next.ordinal).toBe(2)
    const stale = await saveAbstractionDraft(session.id, 1, 'answering', {
      draft: { ...input, shelves: ['旧問題'] },
      activeElapsedMs: 999999,
    })
    expect(stale.draft.shelves).toEqual([])
    const staleGrade = await gradeAbstractionSession(
      session.id,
      1,
      'answering',
      input,
      999999,
    )
    expect(staleGrade.ordinal).toBe(2)
    expect(staleGrade.grading).toBeNull()
    expect(
      (await commitAbstractionResult(session.id, 1, feedback)).ordinal,
    ).toBe(2)
    expect(state.results.size).toBe(1)
  })
  it('persists the first exposure for every displayed transfer question, not queued questions', async () => {
    const session = await startTransferCheck()
    expect(nextTransferQueue([session]).queue[0].cueId).toBe('transfer-1')
    const shown = await markAbstractionShown(session.id, 1)
    expect(shown.queue[0].firstExposure).toBe(true)
    expect(shown.queue[1].firstExposure).toBe(false)
    shown.ordinal = 2
    state.sessions.set(shown.id, structuredClone(shown))
    const second = await markAbstractionShown(session.id, 2)
    expect(second.shownOrdinals).toEqual([1, 2])
    expect(second.queue[1].firstExposure).toBe(true)
    expect(
      nextTransferQueue([second]).queue.filter((q) => q.cueId === 'transfer-2'),
    ).toHaveLength(2)
  })
  it('reload restores paused input; only explicit resume enables answering', async () => {
    const session = await startAbstractionSession('abstract-shelf')
    await saveAbstractionDraft(session.id, 1, 'answering', {
      draft: { shelves: ['人事'], frameworks: [], cuts: [], fruits: [] },
      activeElapsedMs: 1234,
    })
    const paused = await loadAbstractionForResume()
    expect(paused?.status).toBe('paused')
    expect(paused?.draft.shelves).toEqual(['人事'])
    expect(
      (await resumeAbstractionSession(session.id, 1)).activeElapsedMs,
    ).toBe(1234)
    expect((state.sessions.get(session.id) as AbstractionSession).status).toBe(
      'active',
    )
  })
})
