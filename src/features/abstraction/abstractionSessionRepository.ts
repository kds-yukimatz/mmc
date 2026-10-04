import { db } from '../../db/indexedDb'
import type {
  AbstractionInput,
  AbstractionMode,
  AbstractionRecord,
  AbstractionSession,
  AbstractionSnapshot,
} from '../../domain/abstraction'
import type { TrainingResult, WeaknessProfile } from '../../domain/answer'
import {
  abstractionCatalogs,
  abstractionContent,
  abstractionIsReady,
} from '../../repositories/abstractionRepository'
import { gradeAbstraction } from '../../services/abstractionGrader'
import { createLocalId } from '../../services/id'
import { nextStreak } from '../weakness/weaknessReview'
import { nextTransferQueue, openedShelfGroups } from './abstractionReview'

const newQuestionId = (id: string, mode: AbstractionMode) =>
  `abstraction:${id}:${mode}`
export async function getOpenAbstractionSession() {
  return (
    (await db.abstractionSessions.toArray()).find(
      (x) => x.status === 'active' || x.status === 'paused',
    ) ?? null
  )
}
export async function startAbstractionSession(
  mode: AbstractionMode,
  records?: AbstractionRecord[],
  evaluationKind: 'practice' | 'transfer' = 'practice',
  transferQueue?: AbstractionSnapshot[],
) {
  if (!abstractionIsReady) throw new Error('抽象題意教材を利用できません')
  return db.transaction('rw', db.abstractionSessions, db.settings, async () => {
    const existing = await getOpenAbstractionSession()
    if (existing) {
      const paused = { ...existing, status: 'paused' as const }
      await db.abstractionSessions.put(paused)
      return paused
    }
    const eligible = (records ?? abstractionContent.records).filter(
      (r) => r.modes.includes(mode) && r.editorial.status === 'reviewed',
    )
    const queue: AbstractionSnapshot[] =
      transferQueue ??
      eligible.map((record) => ({
        record,
        catalogs: abstractionCatalogs,
        cueId: 'primary',
        text: record.abstractQuestion,
        firstExposure: false,
      }))
    const session: AbstractionSession = {
      id: createLocalId(),
      status: queue.length ? 'active' : 'completed',
      startedAt: new Date().toISOString(),
      completedAt: null,
      contentVersion: abstractionContent.metadata.version,
      mode,
      evaluationKind,
      queue,
      ordinal: 1,
      confirmedResultIds: [],
      shownOrdinals: [],
      phase: 'answering',
      draft: { shelves: [], frameworks: [], cuts: [], fruits: [] },
      activeElapsedMs: 0,
      shelfElapsedMs: null,
      grading: null,
      gradedAt: null,
      synonymsEnabled:
        evaluationKind === 'transfer'
          ? true
          : ((await db.settings.get('app'))?.synonymsEnabled ?? true),
    }
    await db.abstractionSessions.add(session)
    return session
  })
}
export async function startTransferCheck() {
  const open = await getOpenAbstractionSession()
  if (open) return open
  const sessions = await db.abstractionSessions.toArray(),
    ready = nextTransferQueue(sessions)
  if (ready.availableAt)
    throw new Error(
      `次のチェックは${new Date(ready.availableAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}以降に開始できます`,
    )
  if (ready.missingRecordIds.length)
    throw new Error(
      `未提示の題意表現が足りません: ${ready.missingRecordIds.join('、')}`,
    )
  const records = ready.queue.map((x) => x.record)
  return startAbstractionSession(
    'abstract-fruit',
    records,
    'transfer',
    ready.queue,
  )
}
export async function saveAbstractionDraft(
  id: string,
  ordinal: number,
  phase: AbstractionSession['phase'],
  patch: Partial<AbstractionSession>,
) {
  return db.transaction('rw', db.abstractionSessions, async () => {
    const old = await db.abstractionSessions.get(id)
    if (!old) throw new Error('セットが見つかりません')
    if (
      old.status !== 'active' ||
      old.ordinal !== ordinal ||
      old.phase !== phase ||
      phase === 'graded'
    )
      return old
    const next = {
      ...old,
      ...(patch.draft
        ? {
            draft: {
              ...patch.draft,
              ...(phase === 'shelf-locked'
                ? { shelves: old.draft.shelves }
                : {}),
            },
          }
        : {}),
      ...(patch.status === 'paused' ? { status: 'paused' as const } : {}),
      activeElapsedMs: Math.max(
        old.activeElapsedMs,
        patch.activeElapsedMs ?? 0,
      ),
    }
    await db.abstractionSessions.put(next)
    return next
  })
}
export async function markAbstractionShown(id: string, ordinal: number) {
  return db.transaction('rw', db.abstractionSessions, async () => {
    const session = await db.abstractionSessions.get(id)
    if (!session) throw new Error('セットが見つかりません')
    if (session.ordinal !== ordinal || session.status !== 'active')
      return session
    const snapshot = session.queue[ordinal - 1]
    if (!snapshot) throw new Error('問題が見つかりません')
    if (!session.shownOrdinals.includes(ordinal)) {
      snapshot.firstExposure = !(await db.abstractionSessions.toArray()).some(
        (s) =>
          s.shownOrdinals.some((n) => {
            const prior = s.queue[n - 1]
            return (
              prior?.record.id === snapshot.record.id &&
              prior.cueId === snapshot.cueId
            )
          }),
      )
      session.queue[ordinal - 1] = snapshot
      session.shownOrdinals = [...session.shownOrdinals, ordinal]
      await db.abstractionSessions.put(session)
    }
    return session
  })
}

/** Restoring never resumes the clock until the learner explicitly continues. */
export async function loadAbstractionForResume(fresh = false) {
  return db.transaction('rw', db.abstractionSessions, async () => {
    const current = await getOpenAbstractionSession()
    if (!current) return null
    if (fresh && current.status === 'active' && current.phase === 'answering')
      return markAbstractionShown(current.id, current.ordinal)
    const next = { ...current, status: 'paused' as const }
    await db.abstractionSessions.put(next)
    return next
  })
}
export async function resumeAbstractionSession(id: string, ordinal: number) {
  return db.transaction('rw', db.abstractionSessions, async () => {
    const current = await db.abstractionSessions.get(id)
    if (!current) throw new Error('セットが見つかりません')
    if (
      current.ordinal !== ordinal ||
      ['completed', 'abandoned'].includes(current.status)
    )
      return current
    const next = { ...current, status: 'active' as const }
    await db.abstractionSessions.put(next)
    return markAbstractionShown(id, ordinal)
  })
}
export async function lockAbstractionShelf(
  id: string,
  ordinal: number,
  shelves: string[],
  activeElapsedMs: number,
) {
  return db.transaction('rw', db.abstractionSessions, async () => {
    const current = await db.abstractionSessions.get(id)
    if (!current) throw new Error('セットが見つかりません')
    if (
      current.status !== 'active' ||
      current.ordinal !== ordinal ||
      current.phase !== 'answering'
    )
      return current
    if (current.evaluationKind !== 'transfer')
      throw new Error('未提示題意チェックではありません')
    const elapsed = Math.max(current.activeElapsedMs, activeElapsedMs)
    const next: AbstractionSession = {
      ...current,
      draft: { ...current.draft, shelves },
      phase: 'shelf-locked',
      shelfElapsedMs: elapsed,
      activeElapsedMs: elapsed,
    }
    await db.abstractionSessions.put(next)
    return next
  })
}
export async function gradeAbstractionSession(
  id: string,
  ordinal: number,
  phase: AbstractionSession['phase'],
  input: AbstractionInput,
  activeElapsedMs: number,
  shelfElapsedMs: number | null = null,
) {
  return db.transaction('rw', db.abstractionSessions, async () => {
    const session = await db.abstractionSessions.get(id)
    if (!session) throw new Error('セットが見つかりません')
    if (
      session.ordinal !== ordinal ||
      session.status !== 'active' ||
      session.phase !== phase
    )
      return session
    if (session.phase === 'graded' && session.grading) return session
    if (
      session.evaluationKind === 'transfer' &&
      session.phase !== 'shelf-locked'
    )
      throw new Error('棚を確定してください')
    const snap = session.queue[session.ordinal - 1]
    if (!snap) throw new Error('問題が見つかりません')
    input = {
      ...input,
      mode: session.mode,
      shelves:
        session.evaluationKind === 'transfer'
          ? session.draft.shelves
          : input.shelves,
    }
    const values = [
      ...input.shelves,
      ...input.frameworks,
      ...input.cuts,
      ...input.fruits,
    ]
    if (values.length > 12 || values.some((x) => [...x].length > 80))
      throw new Error('各タグ80文字以内、全欄合計12タグまで入力してください')
    const grading = gradeAbstraction(
      snap.record,
      input,
      snap.catalogs,
      session.synonymsEnabled,
    )
    const next = {
      ...session,
      draft: {
        shelves: input.shelves,
        frameworks: input.frameworks,
        cuts: input.cuts,
        fruits: input.fruits,
      },
      activeElapsedMs: Math.max(session.activeElapsedMs, activeElapsedMs),
      shelfElapsedMs:
        session.evaluationKind === 'transfer'
          ? session.shelfElapsedMs
          : shelfElapsedMs,
      grading,
      gradedAt: new Date().toISOString(),
      phase: 'graded' as const,
    }
    await db.abstractionSessions.put(next)
    return next
  })
}
export async function commitAbstractionResult(
  id: string,
  ordinal: number,
  feedback: {
    correct: boolean
    selfRating: 0 | 1 | 2 | 3
    needsReview: boolean
    struggleReasons: Array<'slow' | 'fruit-missing' | 'theme-uncertain'>
    weaknessTags: string[]
  },
) {
  return db.transaction(
    'rw',
    db.abstractionSessions,
    db.trainingResults,
    db.weaknessProfiles,
    async () => {
      const session = await db.abstractionSessions.get(id)
      if (!session) throw new Error('セットが見つかりません')
      const resultId = `${id}:${ordinal}`
      if (session.confirmedResultIds.includes(resultId)) return session
      if (
        !['active', 'paused'].includes(session.status) ||
        session.ordinal !== ordinal ||
        session.phase !== 'graded' ||
        !session.grading
      )
        throw new Error('採点結果を確認してから保存してください')
      const snap = session.queue[ordinal - 1],
        g = session.grading,
        record = snap.record,
        mode = session.mode
      const correct = feedback.correct,
        questionId = newQuestionId(record.id, mode)
      const autoReasons: Array<'slow' | 'fruit-missing' | 'theme-uncertain'> =
        []
      if (openedShelfGroups(record, g, mode).length < record.shelfGroups.length)
        autoReasons.push('theme-uncertain')
      if (mode === 'abstract-fruit' && g.coreCredits < (g.target ?? 0))
        autoReasons.push('fruit-missing')
      if (
        mode === 'abstract-shelf'
          ? session.activeElapsedMs > 30000
          : session.activeElapsedMs > 60000 ||
            (session.evaluationKind === 'transfer' &&
              (session.shelfElapsedMs ?? 0) > 30000)
      )
        autoReasons.push('slow')
      const history = {
        schemaVersion: 1 as const,
        recordId: record.id,
        recordRevision: record.contentRevision,
        contentVersion: session.contentVersion,
        case: record.case,
        sourceRefs: record.sourceRefs,
        cueId: snap.cueId,
        abstractQuestion: snap.text,
        evaluationKind: session.evaluationKind,
        firstExposure: snap.firstExposure,
        autoGrade: g.grade,
        autoCorrect: g.grade === 'excellent' || g.grade === 'good',
        manualOverride:
          correct !== (g.grade === 'excellent' || g.grade === 'good'),
        synonymsEnabled: session.synonymsEnabled,
        inputFrameworks: session.draft.frameworks,
        inputShelves: session.draft.shelves,
        explicitShelfGroupHits: g.shelfGroupHits,
        shelfElapsedMs: session.shelfElapsedMs,
        activeElapsedMs: session.activeElapsedMs,
        autoStruggleReasons: autoReasons,
        grading: g,
        expectedSnapshot: {
          shelves: record.shelfGroups.map((group) => ({
            id: group.id,
            labels: group.categoryIds.map(
              (cid) =>
                snap.catalogs.categories.find((x) => x.id === cid)?.label ??
                cid,
            ),
          })),
          core: record.coreFruitKeywords.map((cid) => ({
            id: cid,
            label:
              snap.catalogs.concepts.find((x) => x.id === cid)?.label ?? cid,
          })),
          context: record.contextDependentKeywords.map((x) => ({
            label: x.label,
            reason: x.reason,
          })),
        },
      }
      const resultQuestionId =
        history.evaluationKind === 'transfer'
          ? `${questionId}:transfer`
          : questionId
      const oldResults = (
        await db.trainingResults
          .where('questionId')
          .equals(resultQuestionId)
          .toArray()
      ).sort((a, b) => b.answeredAt.localeCompare(a.answeredAt))
      const result: TrainingResult = {
        id: resultId,
        questionId: resultQuestionId,
        answeredAt: session.gradedAt!,
        inputCuts: session.draft.cuts,
        inputFruitKeywords: session.draft.fruits,
        keywordScore: mode === 'abstract-fruit' ? g.score : 0,
        cutScore: mode === 'abstract-shelf' ? g.score : 0,
        effectScore: 0,
        totalScore: g.score,
        selfRating: feedback.selfRating,
        elapsedSeconds: Math.floor(session.activeElapsedMs / 1000),
        needsReview:
          feedback.needsReview ||
          !correct ||
          feedback.struggleReasons.length > 0 ||
          feedback.selfRating < 2,
        trainingMode: mode,
        promptLabel: snap.text,
        correct,
        struggleReasons: feedback.struggleReasons,
        weaknessTags: feedback.weaknessTags,
        streak: nextStreak(resultQuestionId, correct, oldResults),
        abstraction: history,
      }
      const profile: WeaknessProfile = {
        id: resultQuestionId,
        tags: feedback.weaknessTags,
      }
      await db.trainingResults.add(result)
      await db.weaknessProfiles.put(profile)
      const confirmedResultIds = [...session.confirmedResultIds, resultId]
      const completed = ordinal >= session.queue.length
      const next: AbstractionSession = {
        ...session,
        confirmedResultIds,
        ordinal: completed ? ordinal : ordinal + 1,
        status: completed ? 'completed' : 'active',
        completedAt: completed ? new Date().toISOString() : null,
        phase: 'answering',
        draft: { shelves: [], frameworks: [], cuts: [], fruits: [] },
        activeElapsedMs: 0,
        shelfElapsedMs: null,
        grading: null,
        gradedAt: null,
      }
      await db.abstractionSessions.put(next)
      return next
    },
  )
}
export async function abandonAbstractionSession(id: string) {
  return db.transaction('rw', db.abstractionSessions, async () => {
    const s = await db.abstractionSessions.get(id)
    if (!s) return null
    const next = {
      ...s,
      status: 'abandoned' as const,
      completedAt: new Date().toISOString(),
    }
    await db.abstractionSessions.put(next)
    return next
  })
}
