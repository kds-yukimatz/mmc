import type { CaseType, Question } from '../../domain/question'
import { caseOrder } from './questionList'

export interface LearningTarget {
  year: number
  caseType: CaseType
}

function hasQuestions(questions: Question[], year: number, caseType: CaseType) {
  return questions.some((question) => question.year === year && question.case === caseType)
}

/** 事例を優先し、同じ事例内では新しい年度から並べる。 */
export function getLearningSequence(questions: Question[]): LearningTarget[] {
  const years = [...new Set(questions.map((question) => question.year))].sort((left, right) => right - left)
  return caseOrder.flatMap((caseType) => years
    .filter((year) => hasQuestions(questions, year, caseType))
    .map((year) => ({ year, caseType })))
}

/** 希望の年度・事例にデータがなければ、同年度の事例Ⅰ、次に同年度の最初の事例へ戻す。 */
export function resolveLearningTarget(questions: Question[], requested: LearningTarget): LearningTarget | undefined {
  if (hasQuestions(questions, requested.year, requested.caseType)) return requested
  if (hasQuestions(questions, requested.year, 'I')) return { year: requested.year, caseType: 'I' }
  return getLearningSequence(questions).find((target) => target.year === requested.year)
}

export function getNextLearningTarget(questions: Question[], current: LearningTarget): LearningTarget | undefined {
  const sequence = getLearningSequence(questions)
  const index = sequence.findIndex((target) => target.year === current.year && target.caseType === current.caseType)
  return index >= 0 ? sequence[index + 1] : undefined
}
