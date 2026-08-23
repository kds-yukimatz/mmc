import type { CaseType } from './question'

export type TrainingMode = 'question' | 'theme' | 'fruit'

export interface AssociationRecord {
  id: string
  year: number
  case: Exclude<CaseType, 'IV'>
  trigger: string
  shelf: string
  fruitKeywords: string[]
  source: string
  sourceType: '本試3年' | '強化答練'
}

export interface TriggerDictionaryPayload {
  metadata: { title: string; version: string; scope: string }
  shelves: Record<Exclude<CaseType, 'IV'>, string[]>
  records: Array<{
    id: string
    year: number
    case: Exclude<CaseType, 'IV'>
    trigger: string
    shelf: string
    fruit_keywords: string[]
    source: string
    source_type: '強化答練'
  }>
}
