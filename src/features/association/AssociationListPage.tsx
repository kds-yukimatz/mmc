import { useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AssociationRecord } from '../../domain/association'
import { filterAssociationStock, type StockFilter } from '../../data/reviewFruitStock'

export function AssociationListPage({ records }: { records: AssociationRecord[] }) {
  const [caseType, setCaseType] = useState<'all' | 'I' | 'II' | 'III'>('all')
  const [sourceType, setSourceType] = useState<'all' | AssociationRecord['sourceType']>('all')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterAssociationStock(records, stockFilter).filter((record) =>
    (caseType === 'all' || record.case === caseType)
    && (sourceType === 'all' || record.sourceType === sourceType)
    && (!query || [record.trigger, record.purpose ?? '', record.shelf, ...record.fruitKeywords, record.source].join(' ').toLocaleLowerCase('ja-JP').includes(query.toLocaleLowerCase('ja-JP')))
  ), [caseType, query, records, sourceType, stockFilter])

  return <div className="page association-list-page">
    <div className="page-heading"><p className="eyebrow">TRIGGER INDEX</p><h1>題意・トリガー一覧</h1><p>トリガー → 題意の棚 → 果キーワードの検索経路を確認できます。</p><Link className="overview-dictionary-link" to="/overview"><ArrowLeft /> 本試設問の一覧へ戻る</Link></div>
    <div className="dictionary-tabs association-filter-tabs">{(['all', '本試3年', '強化答練', '演習メモ', '復習ストック'] as const).map((source) => <button key={source} className={sourceType === source ? 'active' : ''} onClick={() => { setSourceType(source); setStockFilter('all') }}>{source === 'all' ? 'すべて' : source}</button>)}</div>
    {sourceType === '復習ストック' && <><p className="mode-description">再分析から汎用化した29件。A・Bはストック優先度で、本人の弱点や減点の判定ではありません。</p><div className="dictionary-case-filter">{(['all', 'A', 'B'] as const).map((priority) => <button key={priority} className={stockFilter === priority ? 'active' : ''} onClick={() => setStockFilter(priority)}>{priority === 'all' ? 'A・Bすべて' : priority === 'A' ? 'A 必須' : 'B 推奨'}</button>)}</div><Link className="overview-dictionary-link" to="/setup?mode=cause&stock=A">A必須の因→果を練習する →</Link></>}
    <div className="dictionary-case-filter"><button className={caseType === 'all' ? 'active' : ''} onClick={() => setCaseType('all')}>全事例</button>{(['I', 'II', 'III'] as const).map((item) => <button className={caseType === item ? 'active' : ''} key={item} onClick={() => setCaseType(item)}>事例 {item}</button>)}</div>
    <label className="dictionary-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="トリガー・棚・果・出典を検索" /></label>
    <p className="dictionary-count">{visible.length}件</p>
    <div className="association-table" role="table" aria-label="題意トリガー辞書">
      <div className="association-table-head" role="row"><span>トリガー</span><span>棚</span><span>果</span><span>出典</span></div>
      {visible.map((record) => <article role="row" key={record.id}>
        <div data-label="トリガー"><div><strong>{record.trigger}</strong>{record.cause && <small>因：{record.cause}</small>}{record.purpose && <small>目的：{record.purpose}</small>}<small>事例 {record.case}{record.priority && `・${record.priority === 'A' ? 'A 必須' : 'B 推奨'}`}</small></div></div>
        <div data-label="棚"><span className="shelf-chip">{record.shelf}</span></div>
        <div data-label="果"><div><ul>{record.fruitKeywords.map((fruit) => <li key={fruit}>{fruit}</li>)}</ul>{record.studyNote && <p className="stock-study-note">{record.studyNote}</p>}</div></div>
        <div data-label="出典"><small>{record.source}</small></div>
      </article>)}
    </div>
  </div>
}
