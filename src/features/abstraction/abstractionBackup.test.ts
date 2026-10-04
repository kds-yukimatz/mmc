import { describe, expect, it } from 'vitest'
import { parseBackup } from '../micro/backup'
import {
  abstractionCatalogs,
  abstractionContent,
} from '../../repositories/abstractionRepository'
import { gradeAbstraction } from '../../services/abstractionGrader'
const record = abstractionContent.records[0]
const draft = { shelves: ['人事'], frameworks: [], cuts: [], fruits: [] }
const session = {
  id: 'resume',
  status: 'paused',
  startedAt: '2026-10-04T00:00:00.000Z',
  completedAt: null,
  contentVersion: 'retired-version',
  mode: 'abstract-shelf',
  evaluationKind: 'practice',
  queue: [
    {
      record,
      catalogs: abstractionCatalogs,
      cueId: 'primary',
      text: record.abstractQuestion,
      firstExposure: true,
    },
  ],
  ordinal: 1,
  confirmedResultIds: [],
  shownOrdinals: [1],
  phase: 'graded',
  draft,
  activeElapsedMs: 500,
  shelfElapsedMs: null,
  grading: gradeAbstraction(
    record,
    { mode: 'abstract-shelf', ...draft },
    abstractionCatalogs,
    true,
  ),
  gradedAt: '2026-10-04T00:00:01.000Z',
  synonymsEnabled: true,
}
const backup = (sessions: unknown[]) =>
  JSON.stringify({
    schemaVersion: 4,
    results: [],
    profiles: [],
    settings: [],
    privateQuestions: [],
    microAttempts: [],
    microStates: [],
    microSessions: [],
    microPlans: [],
    abstractionSessions: sessions,
  })
describe('backup v4 self-contained validation', () => {
  it('accepts an intact graded snapshot from a retired content version', () =>
    expect(parseBackup(backup([session])).abstractionSessions[0].phase).toBe(
      'graded',
    ))
  it('rejects malformed catalogs, unknown core references and falsified grading before any write', () => {
    expect(() =>
      parseBackup(
        backup([
          {
            ...session,
            queue: [{ ...session.queue[0], record: {}, catalogs: {} }],
          },
        ]),
      ),
    ).toThrow()
    const missing = structuredClone(session)
    missing.queue[0].record.coreFruitKeywords = ['missing', 'also-missing']
    expect(() => parseBackup(backup([missing]))).toThrow()
    expect(() =>
      parseBackup(
        backup([{ ...session, grading: { ...session.grading, score: 0 } }]),
      ),
    ).toThrow()
    expect(() =>
      parseBackup(backup([{ ...session, gradedAt: null }])),
    ).toThrow()
  })
  it('rejects multiple unfinished sessions and invalid confirmation IDs', () => {
    expect(() =>
      parseBackup(backup([session, { ...session, id: 'other' }])),
    ).toThrow('複数')
    expect(() =>
      parseBackup(backup([{ ...session, confirmedResultIds: ['other:9'] }])),
    ).toThrow()
  })
})
