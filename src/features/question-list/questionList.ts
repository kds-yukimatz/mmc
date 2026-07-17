import type { CaseType, Question } from '../../domain/question'

export const caseOrder: CaseType[] = ['I', 'II', 'III', 'IV']

const swotOrder: Record<string, number> = { S: 1, W: 2, O: 3, T: 4 }

function questionOrder(question: Question) {
  const match = question.id.match(/-Q(\d+)(?:-([SWOT]|\d+))?(?:-(\d+))?$/)
  if (!match) return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
  const [, main, part, detail] = match
  const partOrder = part ? (swotOrder[part] ?? Number(part)) : 0
  return [Number(main), partOrder, detail ? Number(detail) : 0]
}

export function compareQuestions(left: Question, right: Question) {
  const leftOrder = questionOrder(left)
  const rightOrder = questionOrder(right)
  for (let index = 0; index < leftOrder.length; index += 1) {
    if (leftOrder[index] !== rightOrder[index]) return leftOrder[index] - rightOrder[index]
  }
  return left.id.localeCompare(right.id)
}

export function getOverviewQuestions(questions: Question[], year: number, caseType: CaseType) {
  return questions
    .filter((question) => question.year === year && question.case === caseType)
    .sort(compareQuestions)
}

