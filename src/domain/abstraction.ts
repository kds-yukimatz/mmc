export type AbstractionMode = 'abstract-shelf' | 'abstract-fruit'
export type AbstractionGrade = 'excellent' | 'good' | 'partial' | 'miss'
export type TrainingCase = 'I' | 'II' | 'III'
export type ExpressionRule = {
  allOf: string[]
  anyOf: string[]
  noneOf: string[]
}
export type Term = {
  id: string
  label: string
  synonyms: string[]
  rules: ExpressionRule[]
}
export type FruitCategory = Term & { cases: TrainingCase[] }
export type FruitConcept = Term & {
  categoryIds: string[]
  microConceptIds: string[]
}
export type Reference = {
  kind: 'base_question' | 'trigger' | 'practice' | 'review_stock'
  id: string
}
export type AbstractionRecord = {
  id: string
  case: TrainingCase
  abstractQuestion: string
  variants: { id: string; text: string; role: 'practice' | 'transfer' }[]
  sourceRefs: Reference[]
  frameworkIds: string[]
  cutTerms: Term[]
  fruitCategories: string[]
  shelfGroups: { id: string; categoryIds: string[] }[]
  coreFruitKeywords: string[]
  acceptableFruitKeywords: {
    conceptId: string
    substitutesCoreId: string | null
  }[]
  contextDependentKeywords: {
    label: string
    synonyms: string[]
    reason: string
    impliesCoreId: string | null
  }[]
  candidateTarget: 2 | 3 | null
  modes: AbstractionMode[]
  weaknessTags: string[]
  editorial: {
    kind: 'designed_practice'
    status: 'draft' | 'reviewed'
    reviewer: string | null
    reviewedAt: string | null
    note: string
  }
  contentRevision: number
}
export type AbstractionContent = {
  schemaVersion: 1
  metadata: { version: string; baseCommit: string; note: string }
  frameworks: Term[]
  categories: FruitCategory[]
  concepts: FruitConcept[]
  records: AbstractionRecord[]
}
export type AbstractionInput = {
  mode: AbstractionMode
  shelves: string[]
  frameworks: string[]
  cuts: string[]
  fruits: string[]
}
export type AbstractionGradingResult = {
  grade: AbstractionGrade
  score: 0 | 40 | 75 | 100
  shelfGroupHits: string[]
  missingShelfGroupIds: string[]
  inferredCategoryIds: string[]
  matchedCore: {
    coreId: string
    actual: string
    via: 'label' | 'synonym' | 'rule' | 'acceptable' | 'context'
  }[]
  missingCoreIds: string[]
  nearbyConceptIds: string[]
  contextMatches: string[]
  unmatchedInputs: string[]
  offShelfInputs: string[]
  frameworkMatches: string[]
  cutMatches: string[]
  coreCredits: number
  target: number | null
}
export type AbstractionSnapshot = {
  record: AbstractionRecord
  catalogs: {
    frameworks: Term[]
    categories: FruitCategory[]
    concepts: FruitConcept[]
  }
  cueId: string
  text: string
  firstExposure: boolean
}
export type AbstractionSession = {
  id: string
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  startedAt: string
  completedAt: string | null
  contentVersion: string
  mode: AbstractionMode
  evaluationKind: 'practice' | 'transfer'
  queue: AbstractionSnapshot[]
  ordinal: number
  confirmedResultIds: string[]
  shownOrdinals: number[]
  phase: 'answering' | 'shelf-locked' | 'graded'
  draft: {
    shelves: string[]
    frameworks: string[]
    cuts: string[]
    fruits: string[]
  }
  activeElapsedMs: number
  shelfElapsedMs: number | null
  grading: AbstractionGradingResult | null
  gradedAt: string | null
  synonymsEnabled: boolean
}
export type AbstractionHistory = {
  schemaVersion: 1
  recordId: string
  recordRevision: number
  contentVersion: string
  case: TrainingCase
  sourceRefs: Reference[]
  cueId: string
  abstractQuestion: string
  evaluationKind: 'practice' | 'transfer'
  firstExposure: boolean
  autoGrade: AbstractionGrade
  autoCorrect: boolean
  manualOverride: boolean
  synonymsEnabled: boolean
  inputFrameworks: string[]
  inputShelves: string[]
  explicitShelfGroupHits: string[]
  shelfElapsedMs: number | null
  activeElapsedMs: number
  autoStruggleReasons: Array<'slow' | 'fruit-missing' | 'theme-uncertain'>
  grading: AbstractionGradingResult
  expectedSnapshot: {
    shelves: { id: string; labels: string[] }[]
    core: { id: string; label: string }[]
    context: { label: string; reason: string }[]
  }
}
