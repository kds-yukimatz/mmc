export interface GradingInput {
  expectedKeywords: string[]
  expectedCuts: string[]
  actualKeywords: string[]
  actualCuts: string[]
  useSynonyms?: boolean
}

export interface MatchDetail { expected: string; actual: string }

export interface GradingResult {
  keywordScore: number
  cutScore: number
  effectScore: number
  totalScore: number
  matchedKeywords: MatchDetail[]
  missedKeywords: string[]
  matchedCuts: MatchDetail[]
  missedCuts: string[]
  matchedEffects: string[]
}

export interface GradingService { grade(input: GradingInput): GradingResult }
