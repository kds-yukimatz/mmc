import type { Question } from './question'

export const pastExamMaterial = '本試験過去問'

export function getQuestionMaterial(question: Question): string {
  return question.materialLabel ?? (question.privateImport ? '個人用教材' : pastExamMaterial)
}

export function getQuestionMaterials(questions: Question[]): string[] {
  return [...new Set(questions.map(getQuestionMaterial))]
}
