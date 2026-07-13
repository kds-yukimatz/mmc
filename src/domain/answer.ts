export interface TrainingResult {
  id: string
  questionId: string
  answeredAt: string
  inputCuts: string[]
  inputFruitKeywords: string[]
  keywordScore: number
  cutScore: number
  effectScore: number
  totalScore: number
  selfRating: 0 | 1 | 2 | 3
  elapsedSeconds?: number
  needsReview: boolean
}

export interface AppSettings {
  id: 'app'
  timerEnabled: boolean
  timerSeconds: number
  synonymsEnabled: boolean
  darkMode: boolean
}
