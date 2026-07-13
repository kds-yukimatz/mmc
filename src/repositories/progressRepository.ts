import { db, defaultSettings } from '../db/indexedDb'
import type { AppSettings, TrainingResult } from '../domain/answer'

export interface ProgressRepository {
  getResults(): Promise<TrainingResult[]>
  saveResult(result: TrainingResult): Promise<void>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  clear(): Promise<void>
}

class DexieProgressRepository implements ProgressRepository {
  getResults() { return db.trainingResults.orderBy('answeredAt').reverse().toArray() }
  async saveResult(result: TrainingResult) { await db.trainingResults.put(result) }
  async getSettings() { return (await db.settings.get('app')) ?? defaultSettings }
  async saveSettings(settings: AppSettings) { await db.settings.put(settings) }
  async clear() { await db.trainingResults.clear() }
}

export const progressRepository: ProgressRepository = new DexieProgressRepository()

export async function exportProgress() {
  const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), results: await db.trainingResults.toArray(), settings: await db.settings.toArray() }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

export async function importProgress(file: File) {
  const payload = JSON.parse(await file.text()) as { results?: TrainingResult[]; settings?: AppSettings[] }
  if (!Array.isArray(payload.results)) throw new Error('有効なバックアップではありません')
  await db.transaction('rw', db.trainingResults, db.settings, async () => {
    await db.trainingResults.bulkPut(payload.results ?? [])
    if (payload.settings?.length) await db.settings.bulkPut(payload.settings)
  })
}
