import type {
  Attempt,
  Content,
  Mapping,
  MicroState,
  Plan,
  Slot,
  Snapshot,
} from './domain'

export const normalize = (value: string) =>
  value.normalize('NFKC').replace(/\s/g, '')
export const localDate = (value: Date | string = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10)
export const dayDifference = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000,
  )
const dayStart = (date: string) =>
  new Date(`${date}T00:00:00+09:00`).toISOString()
export const initialState = (id: string, version = ''): MicroState => ({
  id,
  stage: 0,
  firstConfirmedAt: null,
  dueAt: null,
  lastAttemptAt: null,
  lastGrade: null,
  delayedFastStreak: 0,
  successfulCueIds: [],
  lastDelayedFastAt: null,
  contrastRecoveryRequired: false,
  contrastRecoveredAt: null,
  contentVersion: version,
})
export const stable = (state?: MicroState) =>
  Boolean(
    state &&
    state.delayedFastStreak >= 2 &&
    state.successfulCueIds.length >= 2 &&
    !state.contrastRecoveryRequired,
  )

// Rebuildable from immutable attempts, including the exam date in effect at confirmation.
export function reduceState(state: MicroState, attempt: Attempt): MicroState {
  const grade =
    (attempt.hintUsed || attempt.override) && attempt.grade === 'fast'
      ? 'hesitant'
      : attempt.grade
  const next = {
    ...state,
    successfulCueIds: [...state.successfulCueIds],
    firstConfirmedAt: state.firstConfirmedAt ?? attempt.answeredAt,
    lastAttemptAt: attempt.answeredAt,
    lastGrade: grade,
    contentVersion: attempt.contentVersion,
  }
  const sameDay =
    state.lastAttemptAt && localDate(state.lastAttemptAt) === attempt.localDate
  if (grade !== 'fast') {
    next.stage = grade === 'miss' ? 0 : 1
    next.delayedFastStreak = 0
    next.lastDelayedFastAt = null
    next.successfulCueIds = []
    if (attempt.cardKind === 'contrast') {
      next.contrastRecoveryRequired = true
      next.contrastRecoveredAt = null
    }
  } else if (attempt.slot !== 'maintenance' && !sameDay) {
    next.successfulCueIds = [
      ...new Set([...next.successfulCueIds, attempt.cueId]),
    ]
    if (!state.lastDelayedFastAt) {
      next.lastDelayedFastAt = attempt.answeredAt
      next.stage = 1
    } else if (
      Date.parse(attempt.answeredAt) - Date.parse(state.lastDelayedFastAt) >=
      86400000
    ) {
      next.lastDelayedFastAt = attempt.answeredAt
      next.delayedFastStreak++
      next.stage = Math.min(3, state.stage + 1) as MicroState['stage']
    }
    if (
      attempt.cardKind === 'contrast' &&
      !attempt.hintUsed &&
      !attempt.override
    ) {
      next.contrastRecoveryRequired = false
      next.contrastRecoveredAt = attempt.answeredAt
    }
  } else if (
    grade === 'fast' &&
    attempt.cardKind === 'contrast' &&
    !attempt.hintUsed &&
    !attempt.override &&
    attempt.slot !== 'maintenance'
  ) {
    next.contrastRecoveryRequired = false
    next.contrastRecoveredAt = attempt.answeredAt
  }
  const progressed =
    next.stage !== state.stage ||
    next.delayedFastStreak !== state.delayedFastStreak ||
    !state.dueAt
  if (attempt.slot === 'maintenance') next.stage = state.stage
  if (
    !sameDay &&
    attempt.slot !== 'maintenance' &&
    (grade !== 'fast' || progressed)
  ) {
    let dueDate = addDays(
      attempt.localDate,
      grade !== 'fast' || next.stage <= 1 ? 1 : next.stage === 2 ? 3 : 7,
    )
    if (
      attempt.examDate &&
      dayDifference(attempt.examDate, attempt.localDate) >= 2 &&
      dueDate >= attempt.examDate
    )
      dueDate = addDays(attempt.examDate, -1)
    next.dueAt = dayStart(dueDate)
  }
  return next
}
export function rebuildStates(attempts: Attempt[]) {
  const states: Record<string, MicroState> = {}
  for (const a of [...attempts].sort(
    (a, b) =>
      a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id),
  ))
    states[a.mappingId] = reduceState(
      states[a.mappingId] ?? initialState(a.mappingId),
      a,
    )
  return states
}
export function phase(plan: Plan, today: string) {
  const days = dayDifference(
    plan.examDate ?? addDays(plan.fallbackStartDate, 20),
    today,
  )
  return {
    days,
    period: days >= 15 ? 1 : days >= 8 ? 2 : 3,
    newLimit: days >= 15 ? 6 : days >= 8 ? 3 : 0,
  }
}
export function exactMatch(mapping: Mapping, inputs: string[]) {
  const used = new Set<number>()
  // Backtracking prevents an ambiguous input from consuming another slot's only match.
  const match = (slot: number): boolean => {
    if (slot === mapping.answerSlots.length) return true
    for (let i = 0; i < inputs.length; i++)
      if (
        !used.has(i) &&
        mapping.answerSlots[slot].accepted.some(
          (a) => normalize(a) === normalize(inputs[i]),
        )
      ) {
        used.add(i)
        if (match(slot + 1)) return true
        used.delete(i)
      }
    return false
  }
  return match(0)
}
export function selectCard(
  content: Content,
  states: Record<string, MicroState>,
  attempts: Attempt[],
  plan: Plan,
  now: string,
  excluded: string[] = [],
  coverageOnly = false,
  practiceScope: 'all' | 'mmc' = 'all',
): Snapshot | null {
  const today = localDate(now),
    settings = phase(plan, today)
  const todays = attempts.filter((a) => a.localDate === today)
  const newCount = new Set(
    todays.filter((a) => a.wasNew).map((a) => a.mappingId),
  ).size
  const cycles: Slot[] =
    settings.period === 1
      ? ['coverage', 'due', 'coverage', 'contrast']
      : settings.period === 2
        ? ['coverage', 'contrast', 'due', 'due']
        : ['due', 'contrast', 'due', 'maintenance']
  const cursor = plan.slotLocalDate === today ? plan.slotCursor : 0
  const desired = coverageOnly ? 'coverage' : cycles[cursor % 4]
  const eligible = (m: Mapping) => {
    if (excluded.includes(m.id)) return false
    const answers = todays.filter((a) => a.mappingId === m.id)
    if (!answers.length) return true
    const last = answers.at(-1)!
    return (
      answers.length === 1 &&
      last.grade !== 'fast' &&
      Date.parse(now) - Date.parse(last.answeredAt) >= 600000 &&
      new Set(
        attempts
          .filter(
            (a) =>
              Date.parse(a.answeredAt) > Date.parse(last.answeredAt) &&
              a.mappingId !== m.id,
          )
          .map((a) => a.mappingId),
      ).size >= 2
    )
  }
  const mandatory = (m: Mapping) =>
    content.concepts.some((c) => c.mandatory && c.mandatoryMappingId === m.id)
  const priority = (m: Mapping) =>
    mandatory(m)
      ? 0
      : content.concepts.some(
            (c) => m.conceptIds.includes(c.id) && c.priority === 'A',
          )
        ? 1
        : 2
  const frequency = (m: Mapping) =>
    new Set(
      content.concepts
        .filter((c) => m.conceptIds.includes(c.id))
        .flatMap((c) => c.frequency.groups),
    ).size
  const orderedAttempts = [...attempts].sort(
    (a, b) =>
      a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id),
  )
  const recentCases = orderedAttempts
    .slice(-2)
    .map((a) => content.mappings.find((m) => m.id === a.mappingId)?.case)
  const lastFailure = (m: Mapping) =>
    Math.max(
      -Infinity,
      ...attempts
        .filter((a) => a.mappingId === m.id && a.grade !== 'fast')
        .map((a) => Date.parse(a.answeredAt)),
    )
  const overdue = (m: Mapping) =>
    states[m.id]?.dueAt
      ? Math.max(0, Date.parse(now) - Date.parse(states[m.id].dueAt!))
      : -Infinity
  const compare = (a: Mapping, b: Mapping) =>
    priority(a) - priority(b) ||
    (overdue(a) === overdue(b) ? 0 : overdue(a) > overdue(b) ? -1 : 1) ||
    (lastFailure(a) === lastFailure(b)
      ? 0
      : lastFailure(a) > lastFailure(b)
        ? -1
        : 1) ||
    frequency(b) - frequency(a) ||
    Number(recentCases.includes(a.case)) -
      Number(recentCases.includes(b.case)) ||
    a.id.localeCompare(b.id)
  const slots =
    practiceScope === 'mmc'
      ? (['coverage', 'due'] as Slot[])
      : coverageOnly
        ? (['coverage', 'due'] as Slot[])
        : [
            ...new Set([
              desired,
              'due',
              'coverage',
              'contrast',
              'maintenance',
            ] as Slot[]),
          ]
  for (const slot of slots) {
    const candidates = content.mappings
      .filter((m) => {
        if (practiceScope === 'mmc' && m.source.kind !== 'mmc_original')
          return false
        if (!eligible(m)) return false
        const state = states[m.id],
          known = Boolean(state?.firstConfirmedAt)
        const answeredToday = todays.some((a) => a.mappingId === m.id)
        if (
          coverageOnly &&
          slot === 'due' &&
          (!mandatory(m) ||
            (state?.lastGrade !== 'hesitant' && state?.lastGrade !== 'miss') ||
            content.concepts.some(
              (c) =>
                c.mandatory && !states[c.mandatoryMappingId!]?.firstConfirmedAt,
            ))
        )
          return false
        if (slot === 'coverage')
          return (
            !known &&
            (practiceScope === 'mmc' ||
              (coverageOnly ? mandatory(m) : newCount < settings.newLimit))
          )
        if (!known) return false
        if (slot === 'due')
          return (state.dueAt && state.dueAt <= now) || answeredToday
        if (slot === 'contrast')
          return (
            !answeredToday &&
            content.cards.some(
              (c) => c.mappingId === m.id && c.kind === 'contrast',
            )
          )
        return !answeredToday && (!coverageOnly || !stable(state))
      })
      .sort(compare)
    for (const mapping of candidates) {
      const lastCue = orderedAttempts
        .filter((a) => a.mappingId === mapping.id)
        .at(-1)?.cueId
      const cards = content.cards
        .filter(
          (c) =>
            c.mappingId === mapping.id &&
            c.kind === (slot === 'contrast' ? 'contrast' : 'recall'),
        )
        .sort(
          (a, b) =>
            Number(a.cueId === lastCue) - Number(b.cueId === lastCue) ||
            a.cueId.localeCompare(b.cueId),
        )
      const card = cards[0],
        cue = mapping.cues.find((c) => c.id === card?.cueId)
      if (card && cue) return { card, mapping, cue, slot }
    }
  }
  return null
}

export function validateContent(content: Content): string[] {
  const errors: string[] = []
  for (const [name, items] of Object.entries({
    concept: content.concepts,
    mapping: content.mappings,
    card: content.cards,
  }))
    if (new Set(items.map((i) => i.id)).size !== items.length)
      errors.push(`${name}: ID重複`)
  for (const c of content.concepts)
    if (
      !c.label ||
      !c.selectionReason ||
      (c.mandatory &&
        !content.mappings.some(
          (m) => m.id === c.mandatoryMappingId && m.conceptIds.includes(c.id),
        ))
    )
      errors.push(`${c.id}: 必須対応・採用理由不足`)
  for (const m of content.mappings) {
    if (
      ![
        'strength',
        'weakness',
        'action',
        'benefit',
        'comparison',
        'desired_state',
      ].includes(m.intent) ||
      !['I', 'II', 'III'].includes(m.case) ||
      !m.explanation ||
      !m.source.refs.length ||
      !['designed_practice', 'review_stock', 'mmc_original'].includes(
        m.source.kind,
      ) ||
      m.answerSlots.length !== m.expectedCount ||
      ![1, 2].includes(m.expectedCount) ||
      m.cues.length < 2 ||
      new Set(m.cues.map((c) => c.id)).size !== m.cues.length ||
      m.cues.some((c) => !c.prompt.trim() || c.hintChoices.length !== 2) ||
      m.answerSlots.some(
        (s) =>
          !m.conceptIds.includes(s.conceptId) ||
          !s.accepted.length ||
          s.accepted.some((a) => !a.trim()),
      ) ||
      m.conceptIds.some((id) => !content.concepts.some((c) => c.id === id))
    )
      errors.push(`${m.id}: 題意・因・出典・許容語の検証失敗`)
  }
  for (const c of content.cards)
    if (
      !content.mappings.some(
        (m) => m.id === c.mappingId && m.cues.some((q) => q.id === c.cueId),
      ) ||
      (c.kind !== 'recall' && c.kind !== 'contrast') ||
      (c.kind === 'contrast' && (!c.distractor || !c.contrastExplanation))
    )
      errors.push(`${c.id}: 対応または使い分け説明不足`)
  return errors
}
