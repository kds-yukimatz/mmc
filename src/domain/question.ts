export type CaseType = 'I' | 'II' | 'III' | 'IV'

export interface Question {
  id: string
  year: number
  case: CaseType
  questionNo: string
  questionSummary: string
  modelAnswer: string
  fruitKeywords: string[]
  cuts: string[]
  status: string
  sourcePages?: string
  version: string
}

export interface RawQuestion {
  id: string
  year: number
  case: CaseType
  question_no: string
  question_summary: string
  model_answer: string
  fruit_keywords: string[]
  cuts: string[]
  status: string
  source_pages?: string
  version: string
}
