import type { ReactNode } from 'react'
import type { Question } from '../domain/question'
import { getThemeDisplay } from './themeDisplay'

function highlightLimits(text: string): ReactNode[] {
  return text.split(/(\d+\s*字以内)/g).map((part, index) =>
    /\d+\s*字以内/.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  )
}

export function QuestionDetails({ question, compact = false }: { question: Question; compact?: boolean }) {
  const themes = getThemeDisplay(question)
  const unverified = themes[0] === 'MMC題意未確認'

  return <section className={compact ? 'question-details compact' : 'question-details'}>
    <div className="question-section">
      <p className="detail-label">設問文</p>
      {question.questionText ? (
        <p className="question-text">{highlightLimits(question.questionText)}</p>
      ) : (
        <p className="unverified-text">設問文未確認</p>
      )}
      {question.questionSourcePages && <small>本試験問題：{question.questionSourcePages}</small>}
    </div>
    <div className="theme-section">
      <p className="detail-label">MMC題意</p>
      <div className="theme-tags">
        {themes.map((theme) => <span className={unverified ? 'unverified' : ''} key={theme}>{theme}</span>)}
      </div>
      {question.themeSourcePages && <small>MMC解説：{question.themeSourcePages}</small>}
    </div>
  </section>
}
