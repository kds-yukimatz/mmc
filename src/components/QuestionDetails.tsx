import type { ReactNode } from 'react'
import type { Question } from '../domain/question'
import { getThemeDisplay } from './themeDisplay'

function highlightLimits(text: string): ReactNode[] {
  return text.split(/(\d+\s*字以内)/g).map((part, index) =>
    /\d+\s*字以内/.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  )
}

export function QuestionDetails({ question, compact = false, promptOnly = false }: { question: Question; compact?: boolean; promptOnly?: boolean }) {
  const themes = getThemeDisplay(question)
  const unverified = themes[0] === 'MMC題意未確認'

  return <section className={`question-details${compact ? ' compact' : ''}${promptOnly ? ' prompt-only' : ''}`}>
    {question.businessContext && <div className="business-context"><p className="detail-label">業種・事業概要</p><p>{question.businessContext}</p></div>}
    <div className="summary-section"><p className="detail-label">題意</p><strong>{question.questionSummary}</strong>{question.framework && <small>フレームワーク：{question.framework}</small>}</div>
    {!promptOnly && <>
      {question.privateImport && <p className={question.answerStatus === 'verified' ? '' : 'unverified-text'}>
      個人用OCR教材{question.answerStatus === 'verified' ? '・確認済み' : '・未確認（採点対象外）'}
      </p>}
      <div className="question-section">
      <p className="detail-label">設問文</p>
      {question.questionText ? (
        <p className="question-text">{highlightLimits(question.questionText)}</p>
      ) : (
        <p className="unverified-text">設問文未確認</p>
      )}
      {question.questionSourcePages && <small>本試験問題：{question.questionSourcePages}</small>}
      </div>
      {question.answerUnitLabel && (
      <p className="answer-target"><span>今回の回答対象：</span><strong>{question.answerUnitLabel}</strong></p>
      )}
      <div className="theme-section">
      <p className="detail-label">MMC題意</p>
      <div className="theme-tags">
        {themes.map((theme) => <span className={unverified ? 'unverified' : ''} key={theme}>{theme}</span>)}
      </div>
      {question.themeSourcePages && <small>MMC解説：{question.themeSourcePages}</small>}
      </div>
      {question.privateImport && question.sourceFile && (
      <small>個人用出典：{question.sourceFile}{question.sourcePage ? `・${question.sourcePage}ページ` : ''}</small>
      )}
    </>}
  </section>
}
