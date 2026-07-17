import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, TrainingResult } from '../domain/answer'
import type { Question } from '../domain/question'

export const defaultSettings: AppSettings = { id: 'app', timerEnabled: false, timerSeconds: 180, synonymsEnabled: true, darkMode: false }

export class KahotoreDatabase extends Dexie {
  questions!: EntityTable<Question, 'id'>
  trainingResults!: EntityTable<TrainingResult, 'id'>
  settings!: EntityTable<AppSettings, 'id'>

  constructor() {
    super('kahotore')
    this.version(1).stores({ questions: 'id, year, case, version', trainingResults: 'id, questionId, answeredAt, selfRating, needsReview', settings: 'id' })
    this.version(2).stores({ questions: 'id, year, case, groupId, version', trainingResults: 'id, questionId, legacyGroupId, answeredAt, selfRating, needsReview', settings: 'id' })
  }
}

export const db = new KahotoreDatabase()
