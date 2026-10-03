import { db } from '../../db/indexedDb'
import type { Table } from 'dexie'
import type { Attempt, MicroState, Plan, Session } from './domain'
import type {
  TrainingResult,
  WeaknessProfile,
  AppSettings,
} from '../../domain/answer'
import type { Question } from '../../domain/question'
import { migrateTrainingResult } from '../../repositories/questionRepository'
import { localDate, rebuildStates, validateContent } from './engine'

type Backup = {
  schemaVersion: 2 | 3
  exportedAt?: string
  results: TrainingResult[]
  profiles: WeaknessProfile[]
  settings: AppSettings[]
  privateQuestions: Question[]
  microAttempts: Attempt[]
  microStates: MicroState[]
  microSessions: Session[]
  microPlans: Plan[]
}
type Row = Record<string, unknown>
const object = (v: unknown): v is Row =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v))
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string')
const date = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 19) === v.slice(0, 19)
const calendar = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + 'T00:00:00Z')) &&
  new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const nonnegative = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0
const nullableDate = (v: unknown) => v === null || date(v)
const grades = ['fast', 'hesitant', 'miss']
const ordered = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(ordered)
    : object(v)
      ? Object.fromEntries(
          Object.keys(v)
            .filter((k) => v[k] !== undefined)
            .sort()
            .map((k) => [k, ordered(v[k])]),
        )
      : v
const canonical = (v: unknown): string => JSON.stringify(ordered(v))
export const sameContent = (a: unknown, b: unknown) =>
  canonical(a) === canonical(b)
export function parseBackup(text: string): Backup {
  const raw: unknown = JSON.parse(text)
  if (
    !object(raw) ||
    ![2, 3].includes(raw.schemaVersion as number) ||
    !Array.isArray(raw.results)
  )
    throw new Error('対応するバックアップv2/v3ではありません')
  if (raw.exportedAt !== undefined && !date(raw.exportedAt))
    throw new Error('バックアップ日時が不正')
  const rows = (key: string, validate: (r: Row) => boolean) => {
    const values = raw[key] ?? []
    if (!Array.isArray(values)) throw new Error(`${key}が不正`)
    const unique = new Map<string, Row>()
    for (const v of values) {
      if (!object(v) || typeof v.id !== 'string' || !v.id || !validate(v))
        throw new Error(`${key}: 不正データ（日時・判定・対応を確認してね）`)
      const prior = unique.get(v.id)
      if (prior && !sameContent(prior, v))
        throw new Error(`${key}: 同一IDの内容不一致 ${v.id}`)
      unique.set(v.id, v)
    }
    return [...unique.values()]
  }
  const results = rows(
    'results',
    (r) =>
      typeof r.questionId === 'string' &&
      date(r.answeredAt) &&
      strings(r.inputCuts) &&
      strings(r.inputFruitKeywords) &&
      [0, 1, 2, 3].includes(r.selfRating as number) &&
      ['keywordScore', 'cutScore', 'effectScore', 'totalScore'].every((k) =>
        nonnegative(r[k]),
      ) &&
      typeof r.needsReview === 'boolean',
  )
  const profiles = rows('profiles', (r) => strings(r.tags))
  const settings = rows(
    'settings',
    (r) =>
      r.id === 'app' &&
      ['timerEnabled', 'synonymsEnabled', 'darkMode'].every(
        (k) => typeof r[k] === 'boolean',
      ) &&
      nonnegative(r.timerSeconds),
  )
  const privateQuestions =
    raw.schemaVersion === 3
      ? rows(
          'privateQuestions',
          (r) =>
            r.privateImport === true &&
            typeof r.year === 'number' &&
            ['I', 'II', 'III', 'IV'].includes(r.case as string) &&
            strings(r.fruitKeywords) &&
            strings(r.cuts) &&
            typeof r.questionSummary === 'string' &&
            typeof r.modelAnswer === 'string',
        )
      : []
  const microAttempts =
    raw.schemaVersion === 3
      ? rows(
          'microAttempts',
          (r) =>
            typeof r.sessionId === 'string' &&
            [1, 2].includes(r.ordinal as number) &&
            r.id === `${r.sessionId}:${r.ordinal}` &&
            ['mappingId', 'cardId', 'cueId', 'contentVersion'].every(
              (k) => typeof r[k] === 'string' && Boolean(r[k]),
            ) &&
            date(r.answeredAt) &&
            calendar(r.localDate) &&
            localDate(r.answeredAt as string) === r.localDate &&
            grades.includes(r.grade as string) &&
            typeof r.hintUsed === 'boolean' &&
            typeof r.override === 'boolean' &&
            (!(r.hintUsed || r.override) || r.grade !== 'fast') &&
            nonnegative(r.activeRevealMs) &&
            typeof r.wasNew === 'boolean' &&
            ['coverage', 'due', 'contrast', 'maintenance'].includes(
              r.slot as string,
            ) &&
            ['recall', 'contrast'].includes(r.cardKind as string) &&
            (r.examDate === null || calendar(r.examDate)) &&
            (r.input === undefined || strings(r.input)),
        )
      : []
  const microStates =
    raw.schemaVersion === 3
      ? rows(
          'microStates',
          (r) =>
            [0, 1, 2, 3].includes(r.stage as number) &&
            [
              'firstConfirmedAt',
              'dueAt',
              'lastAttemptAt',
              'lastDelayedFastAt',
              'contrastRecoveredAt',
            ].every((k) => nullableDate(r[k])) &&
            (r.lastGrade === null || grades.includes(r.lastGrade as string)) &&
            strings(r.successfulCueIds) &&
            nonnegative(r.delayedFastStreak) &&
            typeof r.contrastRecoveryRequired === 'boolean' &&
            typeof r.contentVersion === 'string',
        )
      : []
  const microSessions =
    raw.schemaVersion === 3
      ? rows('microSessions', (r) => {
          if (
            !['active', 'paused', 'completed', 'abandoned'].includes(
              r.status as string,
            ) ||
            !['mental', 'typed'].includes(r.inputMode as string) ||
            typeof r.contentVersion !== 'string' ||
            !date(r.startedAt) ||
            ![1, 2].includes(r.ordinal as number) ||
            !nonnegative(r.activeMs) ||
            !strings(r.confirmedAttemptIds) ||
            new Set(r.confirmedAttemptIds).size !==
              r.confirmedAttemptIds.length ||
            !strings(r.input) ||
            ['hintUsed', 'revealed', 'coverageOnly', 'override'].some(
              (k) => typeof r[k] !== 'boolean',
            ) ||
            !nonnegative(r.cardStartedMs) ||
            !nonnegative(r.activeRevealMs)
          )
            return false
          if (r.cardSnapshot === null)
            return r.status === 'completed' || r.status === 'abandoned'
          const s = r.cardSnapshot
          if (
            !object(s) ||
            !object(s.mapping) ||
            !object(s.card) ||
            !object(s.cue) ||
            !Array.isArray(s.mapping.cues) ||
            !Array.isArray(s.mapping.answerSlots) ||
            !Array.isArray(s.mapping.conceptIds) ||
            !object(s.mapping.source) ||
            !Array.isArray(s.mapping.source.refs)
          )
            return false
          // Snapshot content can outlive a manifest; validate against its own mapping and concepts.
          try {
            const concepts = (s.mapping.conceptIds as string[]).map((id) => ({
              id,
              label: id,
              evidenceAliases: [],
              mandatory: false,
              mandatoryMappingId: null,
              selectionReason: 'snapshot',
              priority: null,
              frequency: { groups: [], years: [], recordIds: [], corpus: '' },
            }))
            const cueId = s.cue.id
            return (
              ['coverage', 'due', 'contrast', 'maintenance'].includes(
                s.slot as string,
              ) &&
              s.card.cueId === cueId &&
              sameContent(
                (s.mapping.cues as Row[]).find((c) => c.id === cueId),
                s.cue,
              ) &&
              validateContent({
                metadata: { version: '', note: '' },
                concepts,
                mappings: [s.mapping],
                cards: [s.card],
              } as unknown as Parameters<typeof validateContent>[0]).length ===
                0
            )
          } catch {
            return false
          }
        })
      : []
  const microPlans =
    raw.schemaVersion === 3
      ? rows(
          'microPlans',
          (r) =>
            r.id === 'micro' &&
            (r.examDate === null || calendar(r.examDate)) &&
            calendar(r.fallbackStartDate) &&
            calendar(r.slotLocalDate) &&
            r.timezone === 'Asia/Tokyo' &&
            ['mental', 'typed'].includes(r.inputMode as string) &&
            Number.isInteger(r.slotCursor) &&
            nonnegative(r.slotCursor) &&
            strings(r.mandatoryConceptIds),
        )
      : []
  const payload = {
    schemaVersion: raw.schemaVersion,
    results,
    profiles,
    settings,
    privateQuestions,
    microAttempts,
    microStates,
    microSessions,
    microPlans,
  } as unknown as Backup
  payload.results = payload.results.map(migrateTrainingResult)
  const attempts = new Map(payload.microAttempts.map((a) => [a.id, a]))
  if (
    payload.microSessions.filter(
      (s) => s.status === 'active' || s.status === 'paused',
    ).length > 1
  )
    throw new Error('未終了セットが複数ある')
  for (const s of payload.microSessions)
    for (const id of s.confirmedAttemptIds)
      if (attempts.get(id)?.sessionId !== s.id)
        throw new Error(`セット回答対応が不正: ${id}`)
  for (const a of payload.microAttempts)
    if (
      !payload.microSessions.some(
        (s) => s.id === a.sessionId && s.confirmedAttemptIds.includes(a.id),
      )
    )
      throw new Error(`回答セット対応が不正: ${a.id}`)
  const rebuilt = rebuildStates(payload.microAttempts)
  for (const s of payload.microStates)
    if (!rebuilt[s.id] || !sameContent(s, rebuilt[s.id]))
      throw new Error(`習熟の再構成結果と不一致: ${s.id}`)
  return payload
}

const allTables = [
  db.questions,
  db.trainingResults,
  db.weaknessProfiles,
  db.settings,
  db.microAttempts,
  db.microStates,
  db.microSessions,
  db.microPlans,
]
export async function exportBackup() {
  const payload = await db.transaction('r', allTables, async () => ({
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    results: await db.trainingResults.toArray(),
    profiles: await db.weaknessProfiles.toArray(),
    settings: await db.settings.toArray(),
    privateQuestions: (await db.questions.toArray()).filter(
      (q) => q.privateImport,
    ),
    microAttempts: await db.microAttempts.toArray(),
    microStates: await db.microStates.toArray(),
    microSessions: await db.microSessions.toArray(),
    microPlans: await db.microPlans.toArray(),
  }))
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
}
export async function importBackup(text: string) {
  const p = parseBackup(text)
  return db.transaction('rw', allTables, async () => {
    const groups = [
      { table: db.trainingResults, rows: p.results },
      { table: db.weaknessProfiles, rows: p.profiles },
      { table: db.settings, rows: p.settings },
      { table: db.questions, rows: p.privateQuestions },
      { table: db.microAttempts, rows: p.microAttempts },
      { table: db.microSessions, rows: p.microSessions },
      { table: db.microPlans, rows: p.microPlans },
    ]
    const conflicts: string[] = []
    for (const { table, rows } of groups)
      for (const row of rows) {
        const existing = await (table as Table<{ id: string }, string>).get(
          row.id,
        )
        if (existing && !sameContent(existing, row))
          conflicts.push(`${table.name}: ${row.id}`)
      }
    const open = await db.microSessions.toArray()
    const openIds = new Set(
      [...open, ...p.microSessions]
        .filter((s) => s.status === 'active' || s.status === 'paused')
        .map((s) => s.id),
    )
    if (openIds.size > 1) conflicts.push('未終了セットが複数になる')
    if (conflicts.length)
      throw new Error(`内容不一致のため無変更。\n${conflicts.join('\n')}`)
    // Every table has been validated and compared before the first write.
    await db.trainingResults.bulkPut(p.results)
    await db.weaknessProfiles.bulkPut(p.profiles)
    await db.settings.bulkPut(p.settings)
    await db.questions.bulkPut(p.privateQuestions)
    await db.microAttempts.bulkPut(p.microAttempts)
    await db.microSessions.bulkPut(p.microSessions)
    await db.microPlans.bulkPut(p.microPlans)
    await db.microStates.bulkPut(
      Object.values(rebuildStates(await db.microAttempts.toArray())),
    )
  })
}
