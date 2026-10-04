import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, TrainingResult, WeaknessProfile } from '../domain/answer'
import type { Question } from '../domain/question'
import type { Attempt, MicroState, Plan, Session } from '../features/micro/domain'
import type { AbstractionSession } from '../domain/abstraction'

export const defaultSettings: AppSettings = { id: 'app', timerEnabled: false, timerSeconds: 180, synonymsEnabled: true, darkMode: false }

export class KahotoreDatabase extends Dexie {
  questions!: EntityTable<Question, 'id'>
  trainingResults!: EntityTable<TrainingResult, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  weaknessProfiles!: EntityTable<WeaknessProfile, 'id'>
  microStates!: EntityTable<MicroState, 'id'>
  microAttempts!: EntityTable<Attempt, 'id'>
  microSessions!: EntityTable<Session, 'id'>
  microPlans!: EntityTable<Plan, 'id'>
  abstractionSessions!: EntityTable<AbstractionSession, 'id'>

  constructor() {
    super('kahotore')
    this.version(1).stores({ questions: 'id, year, case, version', trainingResults: 'id, questionId, answeredAt, selfRating, needsReview', settings: 'id' })
    this.version(2).stores({ questions: 'id, year, case, groupId, version', trainingResults: 'id, questionId, legacyGroupId, answeredAt, selfRating, needsReview', settings: 'id' })
    this.version(3).stores({ questions: 'id, year, case, groupId, version', trainingResults: 'id, questionId, legacyGroupId, answeredAt, selfRating, needsReview', settings: 'id', weaknessProfiles: 'id' })
    this.version(4).stores({ questions: 'id, year, case, groupId, version', trainingResults: 'id, questionId, legacyGroupId, answeredAt, selfRating, needsReview', settings: 'id', weaknessProfiles: 'id', microStates: 'id, dueAt', microAttempts: 'id, mappingId, sessionId, answeredAt, localDate', microSessions: 'id, status', microPlans: 'id' })
    this.version(5).stores({ questions: 'id, year, case, groupId, version', trainingResults: 'id, questionId, legacyGroupId, answeredAt, selfRating, needsReview', settings: 'id', weaknessProfiles: 'id', microStates: 'id, dueAt', microAttempts: 'id, mappingId, sessionId, answeredAt, localDate', microSessions: 'id, status', microPlans: 'id', abstractionSessions: 'id, status, startedAt' })
  }
}

export const db = new KahotoreDatabase()
