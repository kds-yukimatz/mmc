import { useMemo, useState } from 'react'
import { BarChart3, BookOpenCheck, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CaseType, Question } from '../../domain/question'
import { getQuestionMaterial, getQuestionMaterials, pastExamMaterial } from '../../domain/questionMaterials'
import { buildFruitKeywordDictionary, buildFruitKeywordRanking } from './keywordDictionary'

type View = 'dictionary' | 'ranking'
type CaseFilter = 'all' | CaseType

const caseFilters: { value: CaseFilter; label: string }[] = [
  { value: 'all', label: '全事例' },
  { value: 'I', label: '事例Ⅰ' },
  { value: 'II', label: '事例Ⅱ' },
  { value: 'III', label: '事例Ⅲ' },
  { value: 'IV', label: '事例Ⅳ' },
]

function occurrenceLabel(question: { year: number; caseType: CaseType; questionNo: string; subQuestionNo?: string; answerUnitLabel: string; privateImport: boolean; verified: boolean; materialLabel?: string }) {
  const detail = question.subQuestionNo && question.subQuestionNo !== question.questionNo ? ` ${question.subQuestionNo}` : ''
  const source = question.privateImport ? `・個人用OCR${question.verified ? '確認済み' : '未確認'}` : ''
  return `${question.materialLabel ? `${question.materialLabel} ` : ''}${question.year}年度 事例${question.caseType} ${question.questionNo}${detail}（${question.answerUnitLabel}${source}）`
}

export function KeywordDictionaryPage({ questions }: { questions: Question[] }) {
  const [view, setView] = useState<View>('dictionary')
  const [caseFilter, setCaseFilter] = useState<CaseFilter>('all')
  const [query, setQuery] = useState('')
  const materials = useMemo(() => getQuestionMaterials(questions), [questions])
  const [material, setMaterial] = useState(() => materials.includes(pastExamMaterial) ? pastExamMaterial : materials[0])
  const materialQuestions = useMemo(() => questions.filter((question) => getQuestionMaterial(question) === material), [questions, material])
  const scopedQuestions = useMemo(
    () => caseFilter === 'all' ? materialQuestions : materialQuestions.filter((question) => question.case === caseFilter),
    [materialQuestions, caseFilter],
  )
  const dictionary = useMemo(() => buildFruitKeywordDictionary(scopedQuestions), [scopedQuestions])
  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ja')
    return normalizedQuery ? dictionary.filter((entry) => entry.keyword.toLocaleLowerCase('ja').includes(normalizedQuery)) : dictionary
  }, [dictionary, query])
  const ranking = useMemo(
    () => buildFruitKeywordRanking(scopedQuestions),
    [scopedQuestions],
  )

  return <div className="page dictionary-page">
    <div className="page-heading">
      <p className="eyebrow">FRUIT KEYWORD LIBRARY</p>
      <h1>果キーワード辞典</h1>
      <p>教材ごとの設問を横断し、同じ「果」がどこで使われたか確認します。本試験の頻度と答練の件数は分けて表示します。</p>
      <Link className="overview-dictionary-link" to="/overview/associations">追加した復習ストックは「題意・トリガー一覧」へ →</Link>
    </div>

    <div className="dictionary-tabs" role="tablist" aria-label="表示内容">
      <button role="tab" aria-selected={view === 'dictionary'} className={view === 'dictionary' ? 'active' : ''} onClick={() => setView('dictionary')}><BookOpenCheck />辞典</button>
      <button role="tab" aria-selected={view === 'ranking'} className={view === 'ranking' ? 'active' : ''} onClick={() => setView('ranking')}><BarChart3 />頻出ランキング</button>
    </div>

    <div className="dictionary-case-filter" aria-label="事例で絞り込む">
      {caseFilters.map((item) => <button key={item.value} className={caseFilter === item.value ? 'active' : ''} onClick={() => setCaseFilter(item.value)}>{item.label}</button>)}
    </div>
    {materials.length > 1 && <label className="dictionary-search"><span>教材</span><select aria-label="教材" value={material} onChange={(event) => { setMaterial(event.target.value); setCaseFilter('all') }}>{materials.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}

    {view === 'dictionary' ? <>
      <label className="dictionary-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="果キーワードを検索" aria-label="果キーワードを検索" />
      </label>
      <p className="dictionary-count">{visibleEntries.length}語{query.trim() ? ` ／ 全${dictionary.length}語` : ''}</p>
      <div className="dictionary-list">
        {visibleEntries.map((entry) => <article className="dictionary-card" key={entry.keyword}>
          <header><h2>{entry.keyword}</h2><span>{entry.count}問</span></header>
          <ul>{entry.occurrences.map((occurrence) => <li key={occurrence.questionId}>{occurrenceLabel(occurrence)}</li>)}</ul>
        </article>)}
      </div>
      {!visibleEntries.length && <div className="empty-inline"><Search /><p>一致する果キーワードはありません</p></div>}
    </> : <>
      <p className="dictionary-count">{caseFilter === 'all' ? '全事例' : `事例${caseFilter}`}の果キーワード {ranking.length}語</p>
      <ol className="ranking-list">
        {ranking.map((entry, index) => <li key={entry.keyword}>
          <span className={index < 3 ? 'rank top' : 'rank'}>{index + 1}</span>
          <strong>{entry.keyword}</strong>
          <span className="ranking-count">{entry.count}問</span>
        </li>)}
      </ol>
    </>}
  </div>
}
