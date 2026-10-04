import { db, defaultSettings } from '../db/indexedDb'
import type { AppSettings, TrainingResult, WeaknessProfile } from '../domain/answer'
import { exportBackup, importBackup } from '../features/micro/backup'

export interface ProgressRepository {
  getResults(): Promise<TrainingResult[]>
  saveResult(result: TrainingResult): Promise<void>
  getProfiles(): Promise<WeaknessProfile[]>
  saveProfile(profile: WeaknessProfile): Promise<void>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  clear(): Promise<void>
}

class DexieProgressRepository implements ProgressRepository {
  getResults() { return db.trainingResults.orderBy('answeredAt').reverse().toArray() }
  async saveResult(result: TrainingResult) { await db.trainingResults.put(result) }
  getProfiles() { return db.weaknessProfiles.toArray() }
  async saveProfile(profile: WeaknessProfile) { await db.weaknessProfiles.put(profile) }
  async getSettings() { return (await db.settings.get('app')) ?? defaultSettings }
  async saveSettings(settings: AppSettings) { await db.settings.put(settings) }
  async clear() { await db.transaction('rw', db.trainingResults, db.weaknessProfiles, db.abstractionSessions, async () => { await db.trainingResults.clear(); await db.weaknessProfiles.clear(); await db.abstractionSessions.clear() }) }
}

export const progressRepository: ProgressRepository = new DexieProgressRepository()

export async function exportProgress() {
  return exportBackup()
}

export async function importProgress(file: File) {
  await importBackup(await file.text())
}
