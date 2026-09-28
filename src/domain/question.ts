export type CaseType = 'I' | 'II' | 'III' | 'IV'

export interface Question {
  id: string
  year: number
  case: CaseType
  questionNo: string
  groupId: string
  subQuestionNo?: string
  answerUnitLabel: string
  questionText: string
  questionSummary: string
  businessContext?: string
  framework?: string
  answerTarget?: string
  mmcTheme: string[]
  themeStatus: 'verified' | 'unverified'
  themeSourcePages?: string
  questionStatus?: 'verified' | 'unverified'
  questionSourcePages?: string
  modelAnswer: string
  fruitKeywords: string[]
  cuts: string[]
  status: string
  sourcePages?: string
  answerSource?: string
  answerStatus: 'verified' | 'unverified'
  answerSourcePages?: string
  legacyIds?: string[]
  privateImport?: boolean
  materialCode?: string
  materialLabel?: string
  sourceFile?: string
  sourcePage?: number
  version: string
}

export interface RawQuestion {
  id: string
  year: number
  case: CaseType
  question_no: string
  group_id?: string
  sub_question_no?: string
  answer_unit_label?: string
  question_text?: string
  question_summary: string
  business_context?: string
  framework?: string
  answer_target?: string
  mmc_theme?: string[]
  theme_status?: 'verified' | 'unverified'
  theme_source_pages?: string
  question_status?: 'verified' | 'unverified'
  question_source_pages?: string
  model_answer: string
  fruit_keywords: string[]
  cuts: string[]
  status: string
  source_pages?: string
  answer_source?: string
  answer_status?: 'verified' | 'unverified'
  answer_source_pages?: string
  legacy_ids?: string[]
  private_import?: boolean
  material_code?: string
  material_label?: string
  source_file?: string
  source_page?: number
  version: string
}

export function isQuestionEligibleForTraining(question: Question): boolean {
  return !question.privateImport || question.answerStatus === 'verified'
}
