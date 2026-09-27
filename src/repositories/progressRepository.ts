import { db, defaultSettings } from '../db/indexedDb'
import type { AppSettings, TrainingResult, WeaknessProfile } from '../domain/answer'

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
  async clear() { await db.transaction('rw', db.trainingResults, db.weaknessProfiles, async () => { await db.trainingResults.clear(); await db.weaknessProfiles.clear() }) }
}

export const progressRepository: ProgressRepository = new DexieProgressRepository()

export async function exportProgress() {
  const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), results: await db.trainingResults.toArray(), profiles: await db.weaknessProfiles.toArray(), settings: await db.settings.toArray() }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

export async function importProgress(file: File) {
  const payload = JSON.parse(await file.text()) as { results?: TrainingResult[]; profiles?: WeaknessProfile[]; settings?: AppSettings[] }
  if (!Array.isArray(payload.results)) throw new Error('有効なバックアップではありません')
  await db.transaction('rw', db.trainingResults, db.weaknessProfiles, db.settings, async () => {
    await db.trainingResults.bulkPut(payload.results ?? [])
    if (payload.profiles?.length) await db.weaknessProfiles.bulkPut(payload.profiles)
    if (payload.settings?.length) await db.settings.bulkPut(payload.settings)
  })
}
