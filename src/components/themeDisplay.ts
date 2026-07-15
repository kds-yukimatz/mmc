import type { Question } from '../domain/question'

export function getThemeDisplay(question: Pick<Question, 'mmcTheme' | 'themeStatus'>) {
  return question.themeStatus === 'verified' && question.mmcTheme.length
    ? question.mmcTheme
    : ['MMC題意未確認']
}
