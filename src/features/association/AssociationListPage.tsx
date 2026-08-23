import { useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AssociationRecord } from '../../domain/association'

export function AssociationListPage({ records }: { records: AssociationRecord[] }) {
  const [caseType, setCaseType] = useState<'all' | 'I' | 'II' | 'III'>('all')
  const [sourceType, setSourceType] = useState<'all' | '本試3年' | '強化答練'>('all')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => records.filter((record) =>
    (caseType === 'all' || record.case === caseType)
    && (sourceType === 'all' || record.sourceType === sourceType)
    && (!query || [record.trigger, record.shelf, ...record.fruitKeywords, record.source].join(' ').toLocaleLowerCase('ja-JP').includes(query.toLocaleLowerCase('ja-JP')))
  ), [caseType, query, records, sourceType])

  return <div className="page association-list-page">
    <div className="page-heading"><p className="eyebrow">TRIGGER INDEX</p><h1>題意・トリガー一覧</h1><p>トリガー → 題意の棚 → 果キーワードの検索経路を確認できます。</p><Link className="overview-dictionary-link" to="/overview"><ArrowLeft /> 本試設問の一覧へ戻る</Link></div>
    <div className="dictionary-tabs association-filter-tabs"><button className={sourceType === 'all' ? 'active' : ''} onClick={() => setSourceType('all')}>すべて</button><button className={sourceType === '本試3年' ? 'active' : ''} onClick={() => setSourceType('本試3年')}>本試3年</button><button className={sourceType === '強化答練' ? 'active' : ''} onClick={() => setSourceType('強化答練')}>強化答練</button></div>
    <div className="dictionary-case-filter"><button className={caseType === 'all' ? 'active' : ''} onClick={() => setCaseType('all')}>全事例</button>{(['I', 'II', 'III'] as const).map((item) => <button className={caseType === item ? 'active' : ''} key={item} onClick={() => setCaseType(item)}>事例 {item}</button>)}</div>
    <label className="dictionary-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="トリガー・棚・果・出典を検索" /></label>
    <p className="dictionary-count">{visible.length}件</p>
    <div className="association-table" role="table" aria-label="題意トリガー辞書">
      <div className="association-table-head" role="row"><span>トリガー</span><span>棚</span><span>果</span><span>出典</span></div>
      {visible.map((record) => <article role="row" key={record.id}><div data-label="トリガー"><strong>{record.trigger}</strong><small>事例 {record.case}</small></div><div data-label="棚"><span className="shelf-chip">{record.shelf}</span></div><div data-label="果"><ul>{record.fruitKeywords.map((fruit) => <li key={fruit}>{fruit}</li>)}</ul></div><div data-label="出典"><small>{record.source}</small></div></article>)}
    </div>
  </div>
}
