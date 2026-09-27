import { useState, type FormEvent } from 'react'
import type { TrainingResult, WeaknessProfile } from '../../domain/answer'
import type { CaseType } from '../../domain/question'
import { tagCatalog } from './weaknessReview'

export type Feedback = Pick<TrainingResult, 'correct' | 'struggleReasons' | 'weaknessTags' | 'needsReview'>

const reasons = [
  ['slow', '思い出すのに時間がかかった'],
  ['fruit-missing', '果キーワードが出なかった'],
  ['theme-uncertain', '題意の切り分けに迷った'],
] as const

export function FeedbackPanel({ caseName, profile, suggestions, score, elapsedSeconds = 0, fruitMissing = false, review, onComplete, nextLabel }: {
  caseName: CaseType
  profile?: WeaknessProfile
  suggestions: string[]
  score: number
  elapsedSeconds?: number
  fruitMissing?: boolean
  review: boolean
  onComplete: (feedback: Feedback) => Promise<void>
  nextLabel: string
}) {
  const [correct, setCorrect] = useState(score >= 70)
  const [selectedReasons, setSelectedReasons] = useState<NonNullable<TrainingResult['struggleReasons']>>([...(elapsedSeconds >= 180 ? ['slow' as const] : []), ...(fruitMissing ? ['fruit-missing' as const] : [])])
  const [tags, setTags] = useState<string[]>(profile?.tags ?? suggestions)
  const [custom, setCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const toggleReason = (reason: NonNullable<TrainingResult['struggleReasons']>[number]) => setSelectedReasons((values) => values.includes(reason) ? values.filter((value) => value !== reason) : [...values, reason])
  const toggleTag = (tag: string) => setTags((values) => values.includes(tag) ? values.filter((value) => value !== tag) : [...values, tag])
  const addTag = (event: FormEvent) => { event.preventDefault(); const next = custom.trim(); if (next && !tags.includes(next)) setTags((values) => [...values, next]); setCustom('') }
  const complete = async () => {
    if (saving) return
    setSaving(true)
    try { await onComplete({ correct, struggleReasons: selectedReasons, weaknessTags: tags, needsReview: review || !correct || selectedReasons.length > 0 }) }
    finally { setSaving(false) }
  }
  const options = [...new Set([...(caseName === 'IV' ? [] : tagCatalog[caseName]), ...suggestions, ...tags])]
  return <>
    <section className="rating weakness-feedback"><h2>今回の結果と詰まった理由</h2>
      <div className="chips"><button className={correct ? 'chip active' : 'chip'} onClick={() => setCorrect(true)}>正解</button><button className={!correct ? 'chip active' : 'chip'} onClick={() => setCorrect(false)}>不正解</button></div>
      <div className="weakness-reasons">{reasons.map(([key, label]) => <label key={key}><input type="checkbox" checked={selectedReasons.includes(key)} onChange={() => toggleReason(key)} />{label}</label>)}</div>
      <h3>弱点タグ（複数選択）</h3><div className="chips weakness-tags">{options.map((tag) => <button key={tag} className={tags.includes(tag) ? 'chip active' : 'chip'} onClick={() => toggleTag(tag)}>{tag}</button>)}</div>
      <form className="weakness-add-tag" onSubmit={addTag}><input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="タグを自由に追加" aria-label="弱点タグを追加" /><button className="btn btn-ghost" type="submit">追加</button></form>
    </section>
    <button className="btn btn-primary wide" disabled={saving} onClick={() => void complete()}>{saving ? '保存中…' : nextLabel}</button>
  </>
}
