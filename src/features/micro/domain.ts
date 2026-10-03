export type Intent =
  | 'strength'
  | 'weakness'
  | 'action'
  | 'benefit'
  | 'comparison'
  | 'desired_state'
export type Grade = 'fast' | 'hesitant' | 'miss'
export type Slot = 'coverage' | 'due' | 'contrast' | 'maintenance'
export type Concept = {
  id: string
  label: string
  evidenceAliases: string[]
  mandatory: boolean
  mandatoryMappingId: string | null
  selectionReason: string
  priority: 'A' | 'B' | null
  frequency: {
    groups: string[]
    years: number[]
    recordIds: string[]
    corpus: string
  }
}
export type Cue = { id: string; prompt: string; hintChoices: string[] }
export type Mapping = {
  id: string
  conceptIds: string[]
  case: 'I' | 'II' | 'III'
  intent: Intent
  expectedCount: 1 | 2
  answerSlots: { conceptId: string; accepted: string[] }[]
  explanation: string
  source: { kind: 'designed_practice' | 'review_stock'; refs: string[] }
  cues: Cue[]
}
export type Card = {
  id: string
  mappingId: string
  cueId: string
  kind: 'recall' | 'contrast'
  distractor?: string
  contrastExplanation?: string
}
export type Content = {
  metadata: { version: string; note: string }
  concepts: Concept[]
  mappings: Mapping[]
  cards: Card[]
}
export type MicroState = {
  id: string
  stage: 0 | 1 | 2 | 3
  firstConfirmedAt: string | null
  dueAt: string | null
  lastAttemptAt: string | null
  lastGrade: Grade | null
  delayedFastStreak: number
  successfulCueIds: string[]
  lastDelayedFastAt: string | null
  contrastRecoveryRequired: boolean
  contrastRecoveredAt: string | null
  contentVersion: string
}
export type Attempt = {
  id: string
  sessionId: string
  ordinal: 1 | 2
  mappingId: string
  cardId: string
  cueId: string
  contentVersion: string
  answeredAt: string
  localDate: string
  grade: Grade
  hintUsed: boolean
  override: boolean
  activeRevealMs: number
  input?: string[]
  wasNew: boolean
  slot: Slot
  cardKind: Card['kind']
  examDate: string | null
}
export type Snapshot = { card: Card; mapping: Mapping; cue: Cue; slot: Slot }
export type Session = {
  id: string
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  contentVersion: string
  startedAt: string
  activeMs: number
  ordinal: 1 | 2
  cardSnapshot: Snapshot | null
  revealed: boolean
  hintUsed: boolean
  confirmedAttemptIds: string[]
  coverageOnly: boolean
  cardStartedMs: number
  activeRevealMs: number
  input: string[]
  override: boolean
  inputMode: 'mental' | 'typed'
}
export type Plan = {
  id: 'micro'
  examDate: string | null
  fallbackStartDate: string
  timezone: 'Asia/Tokyo'
  inputMode: 'mental' | 'typed'
  slotLocalDate: string
  slotCursor: number
  mandatoryConceptIds: string[]
  previousMandatoryCount?: number
}
export const intentLabels: Record<Intent, string> = {
  strength: '強み',
  weakness: '弱み',
  action: '施策',
  benefit: '効果',
  comparison: '比較',
  desired_state: 'あるべき姿',
}
