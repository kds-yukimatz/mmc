import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenCheck, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { QuestionDetails } from '../../components/QuestionDetails'
import type { CaseType, Question } from '../../domain/question'
import { caseOrder, getOverviewQuestions } from './questionList'
import { getNextLearningTarget, resolveLearningTarget } from './learningSequence'
import { QuestionListFooterNavigation } from './QuestionListFooterNavigation'

const selectionKey = 'kahotore-overview-selection'

interface SavedSelection {
  year?: number
  caseType?: CaseType
}

function readSelection(): SavedSelection {
  try {
    return JSON.parse(localStorage.getItem(selectionKey) ?? '{}') as SavedSelection
  } catch {
    return {}
  }
}

export function QuestionListPage({ questions }: { questions: Question[] }) {
  const years = useMemo(() => [...new Set(questions.map((question) => question.year))].sort((a, b) => b - a), [questions])
  const saved = useMemo(readSelection, [])
  const [year, setYear] = useState(() => years.includes(saved.year ?? 0) ? saved.year! : (years[0] ?? 0))
  const [caseType, setCaseType] = useState<CaseType>(() => caseOrder.includes(saved.caseType as CaseType) ? saved.caseType! : 'I')
  const [revealedKeywords, setRevealedKeywords] = useState<Set<string>>(() => new Set())
  const [revealedAnswers, setRevealedAnswers] = useState<Set<string>>(() => new Set())
  const [shouldScrollToList, setShouldScrollToList] = useState(false)
  const listTopRef = useRef<HTMLDivElement>(null)
  const visibleQuestions = useMemo(() => getOverviewQuestions(questions, year, caseType), [questions, year, caseType])
  const nextTarget = useMemo(() => getNextLearningTarget(questions, { year, caseType }), [questions, year, caseType])

  useEffect(() => {
    localStorage.setItem(selectionKey, JSON.stringify({ year, caseType }))
  }, [year, caseType])

  useEffect(() => {
    if (!shouldScrollToList) return
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      listTopRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      setShouldScrollToList(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [year, caseType, shouldScrollToList])

  const handleSelectionChange = useCallback((requested: { year?: number; caseType?: CaseType }) => {
    const target = resolveLearningTarget(questions, { year: requested.year ?? year, caseType: requested.caseType ?? caseType })
    if (!target || (target.year === year && target.caseType === caseType)) return
    setRevealedKeywords(new Set())
    setRevealedAnswers(new Set())
    setYear(target.year)
    setCaseType(target.caseType)
    setShouldScrollToList(true)
  }, [questions, year, caseType])

  const toggleKeywords = (id: string) => {
    setRevealedKeywords((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
        setRevealedAnswers((answers) => {
          const nextAnswers = new Set(answers)
          nextAnswers.delete(id)
          return nextAnswers
        })
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAnswer = (id: string) => {
    if (!revealedKeywords.has(id)) return
    setRevealedAnswers((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const showAllKeywords = () => {
    setRevealedKeywords(new Set(visibleQuestions.map((question) => question.id)))
    setRevealedAnswers(new Set())
  }
  const hideAll = () => {
    setRevealedKeywords(new Set())
    setRevealedAnswers(new Set())
  }

  return <div className="page overview-page">
    <div className="page-heading">
      <p className="eyebrow">YEAR OVERVIEW</p>
      <h1>設問と果の一覧</h1>
      <p>設問から果を思い出し、必要なときだけ文章化まで確認できます。</p>
      <Link className="overview-dictionary-link" to="/dictionary">果キーワード辞典・頻出ランキングを見る →</Link>
    </div>

    <section className="overview-controls" aria-label="表示する年度と事例">
      <label><span>年度</span><select value={year} onChange={(event) => handleSelectionChange({ year: Number(event.target.value) })}>{years.map((item) => <option key={item} value={item}>{item}年度</option>)}</select></label>
      <label><span>事例</span><select value={caseType} onChange={(event) => handleSelectionChange({ caseType: event.target.value as CaseType })}>{caseOrder.map((item) => <option key={item} value={item}>事例 {item}</option>)}</select></label>
    </section>

    <div className="overview-toolbar">
      <p>全{visibleQuestions.length}問・表示中 {revealedKeywords.size}問</p>
      <div><button onClick={showAllKeywords}><Eye />すべて表示</button><button onClick={hideAll}><EyeOff />すべて隠す</button></div>
    </div>

    <div className="overview-list" ref={listTopRef}>
      {visibleQuestions.map((question) => {
        const keywordsOpen = revealedKeywords.has(question.id)
        const answerOpen = revealedAnswers.has(question.id)
        const keywordsStatus = question.answerStatus === 'verified' ? '未登録' : '未確認'
        return <article className="overview-card" key={question.id}>
          <header>
            <p className="question-meta"><span>{question.questionNo}</span>{question.subQuestionNo && <span>{question.subQuestionNo}</span>}</p>
            <strong>{question.answerUnitLabel}</strong>
          </header>
          <QuestionDetails question={question} compact />

          <button className="reveal-button" aria-expanded={keywordsOpen} aria-controls={`keywords-${question.id}`} onClick={() => toggleKeywords(question.id)}>
            <span><BookOpenCheck /><strong>果キーワード</strong><small>{keywordsOpen ? 'タップして隠す' : '考えてからタップ'}</small></span>
            <ChevronDown className={keywordsOpen ? 'open' : ''} />
          </button>
          {keywordsOpen && <section className="reveal-content keyword-content" id={`keywords-${question.id}`}>
            {question.fruitKeywords.length ? <ul>{question.fruitKeywords.map((keyword, index) => <li key={`${keyword}-${index}`}>{keyword}</li>)}</ul> : <p className="unverified-text">{keywordsStatus}</p>}
            <button className="answer-reveal-button" aria-expanded={answerOpen} aria-controls={`answer-${question.id}`} onClick={() => toggleAnswer(question.id)}>
              <span>MMC模範解答{answerOpen ? 'を隠す' : 'を見る'}</span><ChevronDown className={answerOpen ? 'open' : ''} />
            </button>
            {answerOpen && <div className="model-answer overview-model-answer" id={`answer-${question.id}`}>
              <p>{question.modelAnswer}</p>
              {question.answerSourcePages && <small>出典：{question.answerSourcePages}{question.answerSource ? `（${question.answerSource}）` : ''}</small>}
            </div>}
          </section>}
        </article>
      })}
      {!visibleQuestions.length && <div className="empty-inline"><BookOpenCheck /><p>この年度・事例の設問はありません</p></div>}
    </div>
    <QuestionListFooterNavigation current={{ year, caseType }} years={years} next={nextTarget} onSelect={(target) => handleSelectionChange(target)} />
  </div>
}
