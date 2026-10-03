import { db } from '../../db/indexedDb'
import { createLocalId } from '../../services/id'
import rawContent from '../../../public/data/micro-content-v1.json'
import type { Attempt, Content, Grade, Plan, Session } from './domain'
import {
  exactMatch,
  initialState,
  localDate,
  rebuildStates,
  reduceState,
  selectCard,
  validateContent,
} from './engine'

export const content = rawContent as Content
const errors = validateContent(content)
if (errors.length) throw new Error(errors.join('\n'))
const stores = [
  db.microStates,
  db.microAttempts,
  db.microSessions,
  db.microPlans,
]
export const defaultPlan = (now = new Date().toISOString()): Plan => ({
  id: 'micro',
  examDate: null,
  fallbackStartDate: localDate(now),
  timezone: 'Asia/Tokyo',
  inputMode: 'mental',
  slotLocalDate: localDate(now),
  slotCursor: 0,
  mandatoryConceptIds: content.concepts
    .filter((c) => c.mandatory)
    .map((c) => c.id),
})
export async function getData() {
  return db.transaction('r', stores, async () => {
    const [states, attempts, sessions, storedPlan] = await Promise.all([
      db.microStates.toArray(),
      db.microAttempts.toArray(),
      db.microSessions.toArray(),
      db.microPlans.get('micro'),
    ])
    return {
      states: Object.fromEntries(states.map((s) => [s.id, s])),
      attempts,
      session:
        sessions.find((s) => s.status === 'active' || s.status === 'paused') ??
        null,
      plan: storedPlan ?? defaultPlan(),
    }
  })
}
export async function updatePlan(
  preferences: Partial<Pick<Plan, 'examDate' | 'inputMode'>>,
) {
  await db.transaction('rw', db.microPlans, async () => {
    const latest = (await db.microPlans.get('micro')) ?? defaultPlan()
    await db.microPlans.put({ ...latest, ...preferences })
  })
}
export async function startSession(
  coverageOnly = false,
  now = new Date().toISOString(),
): Promise<Session> {
  return db.transaction('rw', stores, async () => {
    const open = (await db.microSessions.toArray()).find(
      (s) => s.status === 'active' || s.status === 'paused',
    )
    if (open) return { ...open, status: 'paused' }
    let plan = (await db.microPlans.get('micro')) ?? defaultPlan(now)
    const ids = content.concepts.filter((c) => c.mandatory).map((c) => c.id)
    if (ids.join() !== plan.mandatoryConceptIds.join())
      plan = {
        ...plan,
        previousMandatoryCount: plan.mandatoryConceptIds.length,
        mandatoryConceptIds: ids,
      }
    const attempts = await db.microAttempts.toArray(),
      states = rebuildStates(attempts)
    const cardSnapshot = selectCard(
      content,
      states,
      attempts,
      plan,
      now,
      [],
      coverageOnly,
    )
    const session: Session = {
      id: createLocalId(),
      status: cardSnapshot ? 'active' : 'completed',
      contentVersion: content.metadata.version,
      startedAt: now,
      activeMs: 0,
      ordinal: 1,
      cardSnapshot,
      revealed: false,
      hintUsed: false,
      confirmedAttemptIds: [],
      coverageOnly,
      cardStartedMs: 0,
      activeRevealMs: 0,
      input: [],
      override: false,
      inputMode: plan.inputMode,
    }
    await db.microPlans.put(plan)
    await db.microSessions.add(session)
    return session
  })
}
// Writes merge only the current ordinal. A stale tab cannot rewind a confirmation.
export async function saveSession(session: Session): Promise<Session> {
  return db.transaction('rw', db.microSessions, async () => {
    const stored = await db.microSessions.get(session.id)
    if (!stored)
      throw new Error('セットが見つからないため、続きから開き直してね')
    if (
      stored.status === 'completed' ||
      stored.status === 'abandoned' ||
      stored.ordinal !== session.ordinal ||
      stored.confirmedAttemptIds.length !== session.confirmedAttemptIds.length
    )
      return stored
    const next = {
      ...session,
      activeMs: Math.max(stored.activeMs, session.activeMs),
      revealed: stored.revealed || session.revealed,
      hintUsed: stored.hintUsed || session.hintUsed,
      activeRevealMs: stored.revealed
        ? stored.activeRevealMs
        : session.activeRevealMs,
    }
    await db.microSessions.put(next)
    return next
  })
}
export async function finishSession(session: Session) {
  return db.transaction('rw', db.microSessions, async () => {
    const stored = await db.microSessions.get(session.id)
    if (!stored) throw new Error('セットが見つからない')
    const next = {
      ...stored,
      activeMs: Math.max(stored.activeMs, session.activeMs),
      status: 'completed' as const,
    }
    await db.microSessions.put(next)
    return next
  })
}
export async function confirm(
  session: Session,
  grade: Grade,
  now = new Date().toISOString(),
): Promise<Session> {
  return db.transaction('rw', stores, async () => {
    const stored = await db.microSessions.get(session.id)
    if (!stored) throw new Error('セットが見つからない')
    const id = `${session.id}:${session.ordinal}`
    if (await db.microAttempts.get(id)) return stored
    if (
      stored.status === 'completed' ||
      stored.ordinal !== session.ordinal ||
      !stored.revealed ||
      !stored.cardSnapshot
    )
      throw new Error('問題を開き直してね')
    const snap = stored.cardSnapshot,
      attempts = await db.microAttempts.toArray()
    const state =
      (await db.microStates.get(snap.mapping.id)) ??
      initialState(snap.mapping.id)
    let plan = (await db.microPlans.get('micro')) ?? defaultPlan(now)
    const hintUsed = stored.hintUsed || session.hintUsed,
      override = session.override
    const unmatched =
      stored.inputMode === 'typed' &&
      session.input.length > 0 &&
      !exactMatch(snap.mapping, session.input)
    const attempt: Attempt = {
      id,
      sessionId: stored.id,
      ordinal: stored.ordinal,
      mappingId: snap.mapping.id,
      cardId: snap.card.id,
      cueId: snap.cue.id,
      contentVersion: stored.contentVersion,
      answeredAt: now,
      localDate: localDate(now),
      grade:
        (hintUsed || override || unmatched) && grade === 'fast'
          ? 'hesitant'
          : grade,
      hintUsed,
      override,
      activeRevealMs: stored.activeRevealMs,
      input: session.input,
      wasNew: !state.firstConfirmedAt,
      slot: snap.slot,
      cardKind: snap.card.kind,
      examDate: plan.examDate,
    }
    // Recheck daily eligibility inside the same serializable write transaction.
    const today = attempts.filter(
      (a) =>
        a.mappingId === attempt.mappingId && a.localDate === attempt.localDate,
    )
    if (today.length) {
      const last = [...today]
        .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
        .at(-1)!
      if (
        today.length >= 2 ||
        last.grade === 'fast' ||
        Date.parse(now) - Date.parse(last.answeredAt) < 600000 ||
        new Set(
          attempts
            .filter(
              (a) =>
                a.mappingId !== last.mappingId &&
                a.answeredAt > last.answeredAt,
            )
            .map((a) => a.mappingId),
        ).size < 2
      )
        throw new Error('別のタブで確認済み。ここでセットを終了してね')
    }
    await db.microAttempts.add(attempt)
    const nextState = reduceState(state, attempt)
    await db.microStates.put(nextState)
    plan = {
      ...plan,
      slotLocalDate: attempt.localDate,
      slotCursor:
        (plan.slotLocalDate === attempt.localDate ? plan.slotCursor : 0) + 1,
    }
    await db.microPlans.put(plan)
    const activeMs = Math.max(stored.activeMs, session.activeMs),
      confirmedAttemptIds = [...stored.confirmedAttemptIds, id]
    const nextCard =
      stored.ordinal === 1 && activeMs <= 35000
        ? selectCard(
            content,
            { ...rebuildStates(attempts), [attempt.mappingId]: nextState },
            [...attempts, attempt],
            plan,
            now,
            [
              ...attempts
                .filter((a) => a.sessionId === stored.id)
                .map((a) => a.mappingId),
              attempt.mappingId,
            ],
            stored.coverageOnly,
          )
        : null
    const next: Session = {
      ...stored,
      activeMs,
      confirmedAttemptIds,
      status: nextCard ? 'active' : 'completed',
      ordinal: nextCard ? 2 : stored.ordinal,
      cardSnapshot: nextCard ?? snap,
      revealed: nextCard ? false : stored.revealed,
      hintUsed: nextCard ? false : hintUsed,
      cardStartedMs: nextCard ? activeMs : stored.cardStartedMs,
      activeRevealMs: nextCard ? 0 : stored.activeRevealMs,
      input: nextCard ? [] : session.input,
      override: nextCard ? false : override,
    }
    await db.microSessions.put(next)
    return next
  })
}
