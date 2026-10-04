import type {
  AbstractionRecord,
  AbstractionSession,
  AbstractionSnapshot,
  AbstractionMode,
  AbstractionGradingResult,
} from '../../domain/abstraction'
import type { TrainingResult, WeaknessProfile } from '../../domain/answer'
import type { Question } from '../../domain/question'
import { isCorrect, priorityWeights } from '../weakness/weaknessReview'
import {
  abstractionCatalogs,
  abstractionContent,
} from '../../repositories/abstractionRepository'

export function nextTransferQueue(
  sessions: AbstractionSession[],
  now = new Date(),
): {
  queue: AbstractionSnapshot[]
  missingRecordIds: string[]
  availableAt: string | null
} {
  const completed = sessions
    .filter(
      (s) =>
        s.evaluationKind === 'transfer' &&
        s.status === 'completed' &&
        s.confirmedResultIds.length === 6,
    )
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  const latest = completed[0]
  const nextAllowed = latest?.completedAt
    ? new Date(Date.parse(latest.completedAt) + 86_400_000)
    : null
  if (nextAllowed && now < nextAllowed)
    return {
      queue: [],
      missingRecordIds: [],
      availableAt: nextAllowed.toISOString(),
    }
  const consumed = new Set(
    sessions
      .flatMap((s) =>
        s.shownOrdinals.map((n) => {
          const x = s.queue[n - 1]
          return x ? `${x.record.id}:${x.cueId}` : ''
        }),
      )
      .filter(Boolean),
  )
  const records = abstractionContent.records
    .filter(
      (r) =>
        r.modes.includes('abstract-fruit') && r.editorial.status === 'reviewed',
    )
    .sort((a, b) => a.id.localeCompare(b.id))
  const queue: AbstractionSnapshot[] = [],
    missingRecordIds: string[] = []
  for (const record of records) {
    const variant = record.variants
      .filter(
        (v) => v.role === 'transfer' && !consumed.has(`${record.id}:${v.id}`),
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0]
    if (!variant) {
      missingRecordIds.push(record.id)
      continue
    }
    queue.push({
      record,
      catalogs: abstractionCatalogs,
      cueId: variant.id,
      text: variant.text,
      firstExposure: false,
    })
  }
  return { queue, missingRecordIds, availableAt: null }
}

export function openedShelfGroups(
  record: AbstractionRecord,
  grading: AbstractionGradingResult,
  mode: AbstractionMode,
) {
  return record.shelfGroups
    .filter(
      (g) =>
        grading.shelfGroupHits.includes(g.id) ||
        (mode === 'abstract-fruit' &&
          g.categoryIds.some((id) => grading.inferredCategoryIds.includes(id))),
    )
    .map((g) => g.id)
}
export function isAbstractionSlow(
  mode: AbstractionMode,
  activeElapsedMs: number,
  shelfElapsedMs: number | null = null,
  evaluationKind: 'practice' | 'transfer' = 'practice',
) {
  return (
    activeElapsedMs > (mode === 'abstract-shelf' ? 30000 : 60000) ||
    (evaluationKind === 'transfer' &&
      shelfElapsedMs !== null &&
      shelfElapsedMs > 30000)
  )
}
export function practiceSummary(
  rows: TrainingResult[],
  sessions: AbstractionSession[] = [],
) {
  const h = rows.flatMap((r) => (r.abstraction ? [r.abstraction] : []))
  const denominator = h.reduce(
    (n, x) => n + x.expectedSnapshot.shelves.length,
    0,
  )
  const records = new Map(
    sessions.flatMap((s) =>
      s.confirmedResultIds.map((id, i) => [id, s.queue[i].record] as const),
    ),
  )
  const groupsHit = rows.reduce((n, r) => {
    const record = records.get(r.id)
    return (
      n +
      (record && r.abstraction
        ? openedShelfGroups(
            record,
            r.abstraction.grading,
            r.trainingMode as AbstractionMode,
          ).length
        : (r.abstraction?.explicitShelfGroupHits.length ?? 0))
    )
  }, 0)
  return {
    count: rows.length,
    shelfHitRate: denominator ? groupsHit / denominator : null,
    goodRate: rows.length
      ? h.filter((x) => ['excellent', 'good'].includes(x.autoGrade)).length /
        rows.length
      : null,
    targetRate: rows.length
      ? h.filter(
          (x) =>
            x.grading.target !== null &&
            x.grading.coreCredits >= x.grading.target,
        ).length / rows.length
      : null,
    slowRate: rows.length
      ? h.filter((x) => x.autoStruggleReasons.includes('slow')).length /
        rows.length
      : null,
    shelfMedianMs: millis(
      h.flatMap((x) => (x.shelfElapsedMs === null ? [] : [x.shelfElapsedMs])),
    ),
    totalMedianMs: millis(h.map((x) => x.activeElapsedMs)),
  }
}
export function transferSummary(
  results: TrainingResult[],
  sessions: AbstractionSession[],
) {
  const resultMap = new Map(results.map((r) => [r.id, r]))
  return sessions
    .filter((s) => s.evaluationKind === 'transfer')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((session) => {
      const rows = session.confirmedResultIds.flatMap((id) =>
        resultMap.has(id) ? [resultMap.get(id)!] : [],
      )
      const eligible =
        session.status === 'completed' &&
        session.queue.length === 6 &&
        rows.length === 6 &&
        rows.every(
          (r) =>
            r.abstraction?.firstExposure &&
            r.abstraction.evaluationKind === 'transfer' &&
            r.abstraction.synonymsEnabled &&
            !r.abstraction.manualOverride,
        )
      return {
        ...practiceSummary(rows, [session]),
        id: session.id,
        version: session.contentVersion,
        startedAt: session.startedAt,
        eligible,
        targetMet: eligible && transferTargetMet(rows),
        shelfHitRate: rows.length
          ? rows.filter(
              (r) =>
                r.abstraction?.explicitShelfGroupHits.length ===
                r.abstraction?.expectedSnapshot.shelves.length,
            ).length / rows.length
          : null,
      }
    })
}

export function transferTargetMet(results: TrainingResult[]) {
  if (
    results.length !== 6 ||
    results.some(
      (r) =>
        !r.abstraction ||
        r.abstraction.evaluationKind !== 'transfer' ||
        !r.abstraction.firstExposure ||
        r.abstraction.shelfElapsedMs === null ||
        r.abstraction.manualOverride ||
        !r.abstraction.synonymsEnabled,
    )
  )
    return false
  const h = results.map((r) => r.abstraction!),
    shelf = millis(
      h.map((x) => x.shelfElapsedMs).filter((x): x is number => x !== null),
    ),
    total = millis(h.map((x) => x.activeElapsedMs))
  return (
    h.filter(
      (x) =>
        x.explicitShelfGroupHits.length === x.expectedSnapshot.shelves.length,
    ).length >= 5 &&
    h.filter((x) => ['excellent', 'good'].includes(x.autoGrade)).length >= 5 &&
    shelf !== null &&
    shelf <= 30000 &&
    total !== null &&
    total <= 60000
  )
}

export type AbstractionSelection = {
  cases: string[]
  years: number[]
  tags: string[]
  count: number
  unanswered: boolean
  review: boolean
}
export function selectPracticeQueue(
  mode: AbstractionMode,
  filter: AbstractionSelection,
  results: TrainingResult[],
  profiles: WeaknessProfile[],
  questions: Question[],
  now = new Date(),
) {
  const sorted = results
    .filter(
      (r) =>
        r.trainingMode === mode && r.abstraction?.evaluationKind === 'practice',
    )
    .sort((a, b) => b.answeredAt.localeCompare(a.answeredAt))
  const profilesById = new Map(profiles.map((p) => [p.id, p.tags]))
  const yearsById = new Map(
    questions.filter((q) => !q.privateImport).map((q) => [q.id, q.year]),
  )
  const rows = abstractionContent.records
    .filter((r) => r.modes.includes(mode) && r.editorial.status === 'reviewed')
    .map((record) => {
      const id = `abstraction:${record.id}:${mode}`,
        history = sorted.filter((r) => r.questionId === id),
        latest = history[0],
        tags = profilesById.get(id) ?? record.weaknessTags
      const weak = Boolean(
        latest &&
        (!isCorrect(latest) ||
          latest.needsReview ||
          latest.struggleReasons?.length),
      )
      const age = latest
        ? Math.max(
            0,
            (now.getTime() - Date.parse(latest.answeredAt)) / 86400000,
          )
        : 0
      let priority = latest ? 0 : priorityWeights.unseen
      if (latest) {
        if (!isCorrect(latest)) priority += priorityWeights.incorrect
        if (latest.struggleReasons?.includes('fruit-missing'))
          priority += priorityWeights.fruitMissing
        if (
          latest.struggleReasons?.includes('slow') ||
          (latest.abstraction?.activeElapsedMs ?? 0) >
            (mode === 'abstract-shelf' ? 30000 : 60000)
        )
          priority += priorityWeights.slow
        if (age >= 30) priority += priorityWeights.stale
        if ((latest.streak ?? 0) >= 2) priority += priorityWeights.streak
        if (
          latest.abstraction?.autoCorrect &&
          !latest.abstraction.manualOverride &&
          latest.abstraction.activeElapsedMs <=
            (mode === 'abstract-shelf' ? 30000 : 60000)
        )
          priority += priorityWeights.fastCorrect
        if (age < 1 && history.length >= 2)
          priority += priorityWeights.recentReview
        const repeated = history.filter(
          (r) => !isCorrect(r) && r.weaknessTags?.some((t) => tags.includes(t)),
        ).length
        if (repeated >= 2)
          priority +=
            priorityWeights.repeatedTagFailure * Math.min(repeated - 1, 3)
      }
      return {
        record,
        latest,
        tags,
        weak,
        priority,
        years: record.sourceRefs.flatMap((ref) =>
          ref.kind === 'base_question' && yearsById.has(ref.id)
            ? [yearsById.get(ref.id)!]
            : [],
        ),
      }
    })
    .filter(
      (x) =>
        (!filter.cases.length || filter.cases.includes(x.record.case)) &&
        (!filter.years.length ||
          filter.years.some((y) => x.years.includes(y))) &&
        (!filter.tags.length || filter.tags.some((t) => x.tags.includes(t))) &&
        (!filter.unanswered || !x.latest) &&
        (!filter.review || x.weak),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority || a.record.id.localeCompare(b.record.id),
    )
    .slice(0, filter.count)
  return rows.map(({ record, latest }): AbstractionSnapshot => {
    const cues = [
      { id: 'primary', text: record.abstractQuestion },
      ...record.variants.filter((v) => v.role === 'practice'),
    ].sort(
      (a, b) =>
        Number(a.id === latest?.abstraction?.cueId) -
          Number(b.id === latest?.abstraction?.cueId) ||
        a.id.localeCompare(b.id),
    )
    return {
      record,
      catalogs: abstractionCatalogs,
      cueId: cues[0].id,
      text: cues[0].text,
      firstExposure: false,
    }
  })
}
function millis(a: number[]) {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y),
    i = Math.floor(s.length / 2)
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2
}

export function abstractionWeaknessRecords(
  records: AbstractionRecord,
  history: TrainingResult[],
) {
  return history.filter(
    (r) =>
      r.abstraction?.recordId === records.id &&
      r.abstraction.evaluationKind === 'practice',
  )
}
