import { db } from '../../db/indexedDb'
import type { Table } from 'dexie'
import type { Attempt, MicroState, Plan, Session } from './domain'
import type {
  TrainingResult,
  WeaknessProfile,
  AppSettings,
} from '../../domain/answer'
import type { Question } from '../../domain/question'
import type { AbstractionSession } from '../../domain/abstraction'
import type { AbstractionSnapshot } from '../../domain/abstraction'
import { gradeAbstraction } from '../../services/abstractionGrader'
import { migrateTrainingResult } from '../../repositories/questionRepository'
import { localDate, rebuildStates, validateContent } from './engine'

type Backup = {
  schemaVersion: 2 | 3 | 4
  exportedAt?: string
  results: TrainingResult[]
  profiles: WeaknessProfile[]
  settings: AppSettings[]
  privateQuestions: Question[]
  microAttempts: Attempt[]
  microStates: MicroState[]
  microSessions: Session[]
  microPlans: Plan[]
  abstractionSessions: AbstractionSession[]
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
const nonempty = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0
const uniqueStrings = (v: unknown): v is string[] =>
  strings(v) && new Set(v).size === v.length && v.every(nonempty)
const sourceRefs = (v: unknown) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every(
    (x) =>
      object(x) &&
      ['base_question', 'trigger', 'practice', 'review_stock'].includes(
        x.kind as string,
      ) &&
      nonempty(x.id) &&
      !x.id.startsWith('private'),
  )
const validTerm = (v: unknown) =>
  object(v) &&
  nonempty(v.id) &&
  nonempty(v.label) &&
  strings(v.synonyms) &&
  Array.isArray(v.rules) &&
  v.rules.every(
    (r) =>
      object(r) &&
      strings(r.allOf) &&
      strings(r.anyOf) &&
      strings(r.noneOf) &&
      r.allOf.length > 0,
  )
const validGrading = (v: unknown): v is Row => {
  if (
    !object(v) ||
    !['excellent', 'good', 'partial', 'miss'].includes(v.grade as string)
  )
    return false
  const scores: Record<string, number> = {
    excellent: 100,
    good: 75,
    partial: 40,
    miss: 0,
  }
  return (
    v.score === scores[v.grade as string] &&
    [
      'shelfGroupHits',
      'missingShelfGroupIds',
      'inferredCategoryIds',
      'missingCoreIds',
      'nearbyConceptIds',
      'contextMatches',
      'unmatchedInputs',
      'offShelfInputs',
      'frameworkMatches',
      'cutMatches',
    ].every((k) => strings(v[k])) &&
    Array.isArray(v.matchedCore) &&
    v.matchedCore.every(
      (x) =>
        object(x) &&
        nonempty(x.coreId) &&
        nonempty(x.actual) &&
        ['label', 'synonym', 'rule', 'acceptable', 'context'].includes(
          x.via as string,
        ),
    ) &&
    Number.isInteger(v.coreCredits) &&
    v.coreCredits === v.matchedCore.length &&
    new Set(v.matchedCore.map((x) => (x as Row).coreId)).size ===
      v.matchedCore.length &&
    (v.target === null || [2, 3].includes(v.target as number))
  )
}
const validSnapshot = (v: unknown): v is AbstractionSnapshot => {
  if (
    !object(v) ||
    !object(v.record) ||
    !object(v.catalogs) ||
    !nonempty(v.cueId) ||
    !nonempty(v.text) ||
    typeof v.firstExposure !== 'boolean'
  )
    return false
  const r = v.record,
    c = v.catalogs
  if (
    !Array.isArray(c.frameworks) ||
    !c.frameworks.every(validTerm) ||
    !Array.isArray(c.categories) ||
    !c.categories.every(
      (x) =>
        validTerm(x) &&
        object(x) &&
        uniqueStrings(x.cases) &&
        x.cases.length > 0 &&
        x.cases.every((k) => ['I', 'II', 'III'].includes(k)),
    ) ||
    !Array.isArray(c.concepts) ||
    !c.concepts.every(
      (x) =>
        validTerm(x) &&
        object(x) &&
        uniqueStrings(x.categoryIds) &&
        x.categoryIds.length > 0 &&
        strings(x.microConceptIds),
    )
  )
    return false
  const terms = [...c.frameworks, ...c.categories, ...c.concepts] as Row[]
  if (new Set(terms.map((x) => x.id)).size !== terms.length) return false
  const cats = new Set((c.categories as Row[]).map((x) => x.id)),
    concepts = new Map((c.concepts as Row[]).map((x) => [x.id, x])),
    frameworks = new Set((c.frameworks as Row[]).map((x) => x.id))
  if (
    (c.concepts as Row[]).some((x) =>
      (x.categoryIds as string[]).some((id) => !cats.has(id)),
    )
  )
    return false
  if (
    !nonempty(r.id) ||
    !['I', 'II', 'III'].includes(r.case as string) ||
    !nonempty(r.abstractQuestion) ||
    !sourceRefs(r.sourceRefs) ||
    !uniqueStrings(r.frameworkIds) ||
    r.frameworkIds.some((id) => !frameworks.has(id)) ||
    !Array.isArray(r.cutTerms) ||
    !r.cutTerms.every(validTerm) ||
    !uniqueStrings(r.fruitCategories) ||
    !Array.isArray(r.shelfGroups) ||
    r.shelfGroups.length < 1 ||
    r.shelfGroups.length > 2 ||
    !r.shelfGroups.every(
      (x) =>
        object(x) &&
        nonempty(x.id) &&
        uniqueStrings(x.categoryIds) &&
        x.categoryIds.length > 0,
    ) ||
    !uniqueStrings(r.coreFruitKeywords) ||
    r.coreFruitKeywords.some((id) => !concepts.has(id)) ||
    !uniqueStrings(r.modes) ||
    !r.modes.every((mode) =>
      ['abstract-shelf', 'abstract-fruit'].includes(mode),
    ) ||
    !r.modes.includes('abstract-shelf') ||
    !strings(r.weaknessTags) ||
    !Number.isInteger(r.contentRevision) ||
    Number(r.contentRevision) < 1
  )
    return false
  const groups = r.shelfGroups as Row[],
    ids = groups.flatMap((g) => g.categoryIds as string[])
  if (
    new Set(groups.map((g) => g.id)).size !== groups.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !cats.has(id)) ||
    ids.slice().sort().join('|') !== r.fruitCategories.slice().sort().join('|')
  )
    return false
  if (
    r.coreFruitKeywords.some(
      (id) =>
        !(concepts.get(id)!.categoryIds as string[]).some(
          (cat) =>
            r.fruitCategories && (r.fruitCategories as string[]).includes(cat),
        ),
    )
  )
    return false
  const fruit = r.modes.includes('abstract-fruit')
  if (
    fruit
      ? r.coreFruitKeywords.length < 2 ||
        r.coreFruitKeywords.length > 6 ||
        r.candidateTarget !== Math.min(3, r.coreFruitKeywords.length)
      : r.coreFruitKeywords.length !== 0 || r.candidateTarget !== null
  )
    return false
  if (
    fruit &&
    groups.some(
      (g) =>
        !(g.categoryIds as string[]).some((cat) =>
          (r.coreFruitKeywords as string[]).some((id) =>
            (concepts.get(id)!.categoryIds as string[]).includes(cat),
          ),
        ),
    )
  )
    return false
  if (
    !Array.isArray(r.acceptableFruitKeywords) ||
    !r.acceptableFruitKeywords.every(
      (x) =>
        object(x) &&
        concepts.has(x.conceptId) &&
        !(r.coreFruitKeywords as string[]).includes(x.conceptId as string) &&
        (x.substitutesCoreId === null ||
          (r.coreFruitKeywords as string[]).includes(
            x.substitutesCoreId as string,
          )),
    ) ||
    (!fruit && r.acceptableFruitKeywords.length)
  )
    return false
  if (
    !Array.isArray(r.contextDependentKeywords) ||
    !r.contextDependentKeywords.every(
      (x) =>
        object(x) &&
        nonempty(x.label) &&
        strings(x.synonyms) &&
        nonempty(x.reason) &&
        (x.impliesCoreId === null ||
          (r.coreFruitKeywords as string[]).includes(
            x.impliesCoreId as string,
          )),
    )
  )
    return false
  if (
    !Array.isArray(r.variants) ||
    !r.variants.every(
      (x) =>
        object(x) &&
        nonempty(x.id) &&
        nonempty(x.text) &&
        ['practice', 'transfer'].includes(x.role as string),
    ) ||
    new Set((r.variants as Row[]).map((x) => x.id)).size !== r.variants.length
  )
    return false
  if (
    !object(r.editorial) ||
    r.editorial.kind !== 'designed_practice' ||
    !['reviewed', 'draft'].includes(r.editorial.status as string) ||
    !nonempty(r.editorial.note) ||
    (r.editorial.status === 'reviewed' &&
      (!nonempty(r.editorial.reviewer) || !date(r.editorial.reviewedAt)))
  )
    return false
  const cue = (r.variants as Row[]).find((x) => x.id === v.cueId)
  return v.cueId === 'primary' || v.cueId === 'practice'
    ? v.text === r.abstractQuestion
    : Boolean(cue && cue.text === v.text)
}
const abstractionHistory = (r: Row) => {
  const a = r.abstraction
  if (!object(a)) return false
  const score = { miss: 0, partial: 40, good: 75, excellent: 100 }[
    a.autoGrade as 'miss' | 'partial' | 'good' | 'excellent'
  ]
  const autoCorrect = ['excellent', 'good'].includes(a.autoGrade as string)
  return (
    a.schemaVersion === 1 &&
    typeof a.recordId === 'string' &&
    Number.isInteger(a.recordRevision) &&
    Number(a.recordRevision) >= 1 &&
    typeof a.contentVersion === 'string' &&
    ['I', 'II', 'III'].includes(a.case as string) &&
    sourceRefs(a.sourceRefs) &&
    typeof a.cueId === 'string' &&
    typeof a.abstractQuestion === 'string' &&
    ['practice', 'transfer'].includes(a.evaluationKind as string) &&
    typeof a.firstExposure === 'boolean' &&
    typeof a.autoCorrect === 'boolean' &&
    a.autoCorrect === autoCorrect &&
    typeof a.manualOverride === 'boolean' &&
    typeof r.correct === 'boolean' &&
    r.correct === (a.manualOverride ? !autoCorrect : autoCorrect) &&
    typeof a.synonymsEnabled === 'boolean' &&
    strings(a.inputFrameworks) &&
    strings(a.inputShelves) &&
    strings(a.explicitShelfGroupHits) &&
    nonnegative(a.activeElapsedMs) &&
    (a.shelfElapsedMs === null || nonnegative(a.shelfElapsedMs)) &&
    strings(a.autoStruggleReasons) &&
    a.autoStruggleReasons.every((x) =>
      ['slow', 'fruit-missing', 'theme-uncertain'].includes(x),
    ) &&
    validGrading(a.grading) &&
    a.grading.score === score &&
    a.grading.grade === a.autoGrade &&
    object(a.expectedSnapshot) &&
    Array.isArray(a.expectedSnapshot.shelves) &&
    a.expectedSnapshot.shelves.length > 0 &&
    a.expectedSnapshot.shelves.every(
      (x) =>
        object(x) &&
        nonempty(x.id) &&
        uniqueStrings(x.labels) &&
        x.labels.length > 0,
    ) &&
    Array.isArray(a.expectedSnapshot.core) &&
    a.expectedSnapshot.core.every(
      (x) => object(x) && nonempty(x.id) && nonempty(x.label),
    ) &&
    Array.isArray(a.expectedSnapshot.context) &&
    a.expectedSnapshot.context.every(
      (x) => object(x) && nonempty(x.label) && nonempty(x.reason),
    ) &&
    r.totalScore === score &&
    r.effectScore === 0 &&
    r.elapsedSeconds === Math.floor(Number(a.activeElapsedMs) / 1000) &&
    r.keywordScore === (r.trainingMode === 'abstract-fruit' ? score : 0) &&
    r.cutScore === (r.trainingMode === 'abstract-shelf' ? score : 0) &&
    (a.shelfElapsedMs === null ||
      Number(a.shelfElapsedMs) <= Number(a.activeElapsedMs))
  )
}
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
    ![2, 3, 4].includes(raw.schemaVersion as number) ||
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
      typeof r.needsReview === 'boolean' &&
      (['abstract-shelf', 'abstract-fruit'].includes(r.trainingMode as string)
        ? raw.schemaVersion === 4 &&
          abstractionHistory(r) &&
          r.questionId ===
            `abstraction:${(r.abstraction as Row).recordId}:${r.trainingMode}${(r.abstraction as Row).evaluationKind === 'transfer' ? ':transfer' : ''}`
        : r.abstraction === undefined &&
          (r.trainingMode === undefined ||
            ['question', 'theme', 'fruit', 'cause', 'purpose'].includes(
              r.trainingMode as string,
            ))),
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
    Number(raw.schemaVersion) >= 3
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
    Number(raw.schemaVersion) >= 3
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
    Number(raw.schemaVersion) >= 3
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
    Number(raw.schemaVersion) >= 3
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
    Number(raw.schemaVersion) >= 3
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
  const abstractionSessions =
    raw.schemaVersion === 4
      ? rows('abstractionSessions', (r) => {
          if (
            !['active', 'paused', 'completed', 'abandoned'].includes(
              r.status as string,
            ) ||
            !date(r.startedAt) ||
            (r.completedAt !== null && !date(r.completedAt)) ||
            !['abstract-shelf', 'abstract-fruit'].includes(r.mode as string) ||
            !['practice', 'transfer'].includes(r.evaluationKind as string) ||
            typeof r.contentVersion !== 'string' ||
            !Array.isArray(r.queue) ||
            r.queue.length < 1 ||
            r.queue.length > 20 ||
            !Number.isInteger(r.ordinal) ||
            Number(r.ordinal) < 1 ||
            Number(r.ordinal) > Math.max(1, r.queue.length) ||
            !strings(r.confirmedResultIds) ||
            !Array.isArray(r.shownOrdinals) ||
            !r.shownOrdinals.every(
              (x) =>
                Number.isInteger(x) &&
                Number(x) > 0 &&
                Number(x) <= (r.queue as unknown[]).length,
            ) ||
            new Set(r.shownOrdinals as number[]).size !==
              (r.shownOrdinals as number[]).length ||
            !['answering', 'shelf-locked', 'graded'].includes(
              r.phase as string,
            ) ||
            !object(r.draft) ||
            !['shelves', 'frameworks', 'cuts', 'fruits'].every((k) =>
              strings((r.draft as Row)[k]),
            ) ||
            !nonnegative(r.activeElapsedMs) ||
            (r.shelfElapsedMs !== null && !nonnegative(r.shelfElapsedMs)) ||
            typeof r.synonymsEnabled !== 'boolean'
          )
            return false
          if (
            (r.phase === 'graded') !== (r.grading !== null) ||
            (r.phase === 'graded'
              ? !date(r.gradedAt) || !validGrading(r.grading)
              : r.gradedAt !== null) ||
            (r.evaluationKind === 'practice' &&
              (r.phase === 'shelf-locked' || r.shelfElapsedMs !== null)) ||
            (r.evaluationKind === 'transfer' &&
              (!r.synonymsEnabled ||
                r.mode !== 'abstract-fruit' ||
                r.queue.length !== 6 ||
                (r.phase === 'answering'
                  ? r.shelfElapsedMs !== null
                  : r.shelfElapsedMs === null))) ||
            (r.shelfElapsedMs !== null &&
              Number(r.shelfElapsedMs) > Number(r.activeElapsedMs)) ||
            (['active', 'paused'].includes(r.status as string)
              ? r.completedAt !== null
              : !date(r.completedAt))
          )
            return false
          if (!r.queue.every(validSnapshot)) return false
          const queue = r.queue as AbstractionSnapshot[],
            current = queue[Number(r.ordinal) - 1]
          if (
            queue.some(
              (x) =>
                !x.record.modes.includes(
                  r.mode as AbstractionSession['mode'],
                ) ||
                (r.evaluationKind === 'transfer'
                  ? x.record.variants.find((v) => v.id === x.cueId)?.role !==
                    'transfer'
                  : x.record.variants.find((v) => v.id === x.cueId)?.role ===
                    'transfer'),
            )
          )
            return false
          if (
            r.phase === 'graded' &&
            !sameContent(
              r.grading,
              gradeAbstraction(
                current.record,
                {
                  mode: r.mode as AbstractionSession['mode'],
                  ...(r.draft as AbstractionSession['draft']),
                },
                current.catalogs,
                r.synonymsEnabled as boolean,
              ),
            )
          )
            return false
          const confirmed = r.confirmedResultIds as string[],
            expectedLength =
              r.status === 'completed' ? queue.length : Number(r.ordinal) - 1
          return (
            confirmed.length === expectedLength &&
            confirmed.every(
              (id, i) =>
                id === `${r.id}:${i + 1}` &&
                (r.shownOrdinals as number[]).includes(i + 1),
            ) &&
            (r.status !== 'completed' || Number(r.ordinal) === queue.length) &&
            (r.phase !== 'graded' ||
              (r.shownOrdinals as number[]).includes(Number(r.ordinal)))
          )
        })
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
    abstractionSessions,
  } as unknown as Backup
  payload.results = payload.results.map(migrateTrainingResult)
  if (
    payload.abstractionSessions.filter(
      (s) => s.status === 'active' || s.status === 'paused',
    ).length > 1
  )
    throw new Error('未終了の抽象題意セットが複数ある')
  const resultMap = new Map(payload.results.map((r) => [r.id, r]))
  const representedResults = new Set<string>()
  for (const s of payload.abstractionSessions)
    for (let i = 0; i < s.confirmedResultIds.length; i++) {
      const id = s.confirmedResultIds[i],
        result = resultMap.get(id),
        snap = s.queue[i]
      if (
        !result?.abstraction ||
        result.trainingMode !== s.mode ||
        result.abstraction.recordId !== snap.record.id ||
        result.abstraction.cueId !== snap.cueId ||
        result.abstraction.evaluationKind !== s.evaluationKind ||
        result.abstraction.contentVersion !== s.contentVersion
      )
        throw new Error(`抽象題意セット回答対応が不正: ${id}`)
      const h = result.abstraction
      const expected = gradeAbstraction(
        snap.record,
        {
          mode: s.mode,
          shelves: h.inputShelves,
          frameworks: h.inputFrameworks,
          cuts: result.inputCuts,
          fruits: result.inputFruitKeywords,
        },
        snap.catalogs,
        h.synonymsEnabled,
      )
      const expectedSnapshot = {
        shelves: snap.record.shelfGroups.map((g) => ({
          id: g.id,
          labels: g.categoryIds.map(
            (cid) => snap.catalogs.categories.find((c) => c.id === cid)!.label,
          ),
        })),
        core: snap.record.coreFruitKeywords.map((cid) => ({
          id: cid,
          label: snap.catalogs.concepts.find((c) => c.id === cid)!.label,
        })),
        context: snap.record.contextDependentKeywords.map((c) => ({
          label: c.label,
          reason: c.reason,
        })),
      }
      if (
        !sameContent(h.grading, expected) ||
        !sameContent(h.expectedSnapshot, expectedSnapshot) ||
        !sameContent(h.explicitShelfGroupHits, expected.shelfGroupHits) ||
        h.recordRevision !== snap.record.contentRevision ||
        h.firstExposure !== snap.firstExposure ||
        h.abstractQuestion !== snap.text ||
        h.synonymsEnabled !== s.synonymsEnabled ||
        !sameContent(h.sourceRefs, snap.record.sourceRefs)
      )
        throw new Error(`抽象題意採点snapshotが不一致: ${id}`)
      representedResults.add(id)
    }
  for (const r of payload.results)
    if (r.abstraction && !representedResults.has(r.id))
      throw new Error(`抽象題意回答セット対応が不正: ${r.id}`)
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
  db.abstractionSessions,
]
export async function exportBackup() {
  const payload = await db.transaction('r', allTables, async () => ({
    schemaVersion: 4,
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
    abstractionSessions: await db.abstractionSessions.toArray(),
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
      { table: db.abstractionSessions, rows: p.abstractionSessions },
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
    const abstractionOpen = await db.abstractionSessions.toArray()
    const abstractionOpenIds = new Set(
      [...abstractionOpen, ...p.abstractionSessions]
        .filter((s) => s.status === 'active' || s.status === 'paused')
        .map((s) => s.id),
    )
    if (abstractionOpenIds.size > 1)
      conflicts.push('未終了の抽象題意セットが複数になる')
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
    await db.abstractionSessions.bulkPut(p.abstractionSessions)
    await db.microStates.bulkPut(
      Object.values(rebuildStates(await db.microAttempts.toArray())),
    )
  })
}
