import { useEffect, useState, type FormEvent } from 'react'
import { ChevronLeft, CircleCheck, Clock3, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AppSettings, TrainingResult, WeaknessProfile } from '../../domain/answer'
import { progressRepository } from '../../repositories/progressRepository'
import { createLocalId } from '../../services/id'
import { gradeAssociation, gradeCandidates } from './associationDictionary'
import { useAssociationTrainingStore } from './associationTrainingStore'
import { FeedbackPanel, type Feedback } from '../weakness/FeedbackPanel'
import { nextStreak, suggestedTags } from '../weakness/weaknessReview'

export function AssociationTrainingPage({ settings, profiles, results, onSaved }: { settings: AppSettings; profiles: WeaknessProfile[]; results: TrainingResult[]; onSaved: () => Promise<void> }) {
  const navigate = useNavigate()
  const store = useAssociationTrainingStore()
  const record = store.queue[store.index]
  const [input, setInput] = useState('')
  const [rating, setRating] = useState<0 | 1 | 2 | 3>(2)
  const [review, setReview] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [gradedAt, setGradedAt] = useState(Date.now())

  useEffect(() => {
    if (!settings.timerEnabled || store.result) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [settings.timerEnabled, store.result])

  if (!record) return <div className="empty-state"><CircleCheck /><h1>{store.queue.length ? 'セッション完了' : '出題がありません'}</h1><p>{store.queue.length ? `${store.queue.length}問、おつかれさまでした。` : '演習条件から問題を選んでください。'}</p><button className="btn btn-primary" onClick={() => navigate('/')}>ホームへ戻る</button></div>

  const expected = store.mode === 'theme' ? [record.shelf] : record.fruitKeywords
  const label = store.mode === 'theme' ? '題意の棚' : '果キーワード'
  const prompt = store.mode === 'theme' ? record.trigger : store.mode === 'fruit' ? record.shelf : store.mode === 'cause' ? record.cause : record.purpose
  const resultId = `association-${record.id}-${store.mode}`
  const secondsLeft = Math.max(0, settings.timerSeconds - Math.floor((now - store.startedAt) / 1000))
  const add = (event: FormEvent) => { event.preventDefault(); store.addAnswer(input); setInput('') }
  const grade = () => { setGradedAt(Date.now()); store.setResult(store.mode === 'cause' || store.mode === 'purpose' ? gradeCandidates(expected, store.answers, settings.synonymsEnabled) : gradeAssociation(expected, store.answers, settings.synonymsEnabled)) }
  const saveAndNext = async (feedback: Feedback) => {
    if (!store.result) return
    const item: TrainingResult = {
      id: createLocalId(),
      questionId: resultId,
      answeredAt: new Date(gradedAt).toISOString(),
      inputCuts: store.mode === 'theme' ? store.answers : [],
      inputFruitKeywords: store.mode !== 'theme' ? store.answers : [],
      keywordScore: store.mode !== 'theme' ? store.result.score : 0,
      cutScore: store.mode === 'theme' ? store.result.score : 0,
      effectScore: 0,
      totalScore: store.result.score,
      selfRating: rating,
      elapsedSeconds: Math.round((gradedAt - store.startedAt) / 1000),
      needsReview: Boolean(feedback.needsReview) || rating < 2,
      trainingMode: store.mode,
      promptLabel: prompt,
      correct: Boolean(feedback.correct),
      struggleReasons: feedback.struggleReasons,
      weaknessTags: feedback.weaknessTags,
      streak: nextStreak(resultId, Boolean(feedback.correct), results),
    }
    await progressRepository.saveProfile({ id: resultId, tags: feedback.weaknessTags ?? [] })
    await progressRepository.saveResult(item)
    await onSaved()
    setReview(false)
    setRating(2)
    store.next()
  }

  if (store.result) return <div className="page association-result-page">
    <div className="association-score"><p className="eyebrow">{store.mode === 'theme' ? '題意トレ' : store.mode === 'fruit' ? '果トレ' : store.mode === 'cause' ? '因→果' : '目的→施策'} RESULT</p><strong>{store.result.score}</strong><span>/ 100</span></div>
    <section className="association-answer-card">
      <p className="association-source-chip">事例 {record.case}・{record.sourceType}{record.priority && `・${record.priority === 'A' ? 'A 必須' : 'B 推奨'}`}</p>
      <h1>{prompt}</h1>
      <div><p>あなたの回答</p><div className="tag-list static">{store.answers.length ? store.answers.map((answer) => <span key={answer}>{answer}</span>) : <small>入力なし</small>}</div></div>
      <div><p>{store.mode === 'cause' || store.mode === 'purpose' ? '妥当な候補（1つ以上で正解）' : '登録済みの正解'}</p><div className="tag-list static expected">{expected.map((answer) => <span className={store.result?.matched.includes(answer) ? 'match' : 'miss'} key={answer}>{store.result?.matched.includes(answer) ? '✓ ' : '— '}{answer}</span>)}</div></div>
      <dl><dt>トリガー</dt><dd>{record.trigger}</dd><dt>題意の棚</dt><dd>{record.shelf}</dd><dt>果キーワード</dt><dd>{record.fruitKeywords.join('／')}</dd><dt>出典</dt><dd>{record.source}</dd></dl>
      {record.studyNote && <p className="stock-study-note">{record.studyNote}</p>}
    </section>
    <section className="rating"><h2>自分の手応え</h2><div className="rating-grid">{(['題意を外した', '領域は近い', '主要語が一部一致', '棚・主要語が一致'] as const).map((text, index) => <button className={rating === index ? 'active' : ''} key={text} onClick={() => setRating(index as 0 | 1 | 2 | 3)}><strong>{index}</strong><span>{text}</span></button>)}</div></section>
    <label className="review-toggle"><input type="checkbox" checked={review} onChange={(event) => setReview(event.target.checked)} /><RefreshCw /><span><strong>復習対象にする</strong><small>あとで要復習から選べます</small></span></label>
    <FeedbackPanel key={resultId} caseName={record.case} profile={profiles.find((profile) => profile.id === resultId)} suggestions={suggestedTags(record)} score={store.result.score} elapsedSeconds={Math.round((gradedAt - store.startedAt) / 1000)} fruitMissing={store.mode !== 'theme' && !store.answers.length} review={review} onComplete={saveAndNext} nextLabel={store.index + 1 < store.queue.length ? '次の問題へ' : 'セッションを終了'} />
  </div>

  return <div className="training-page association-training-page">
    <div className="training-header"><button className="icon-btn" aria-label="演習を終了" onClick={() => navigate('/setup')}><ChevronLeft /></button><span>{store.index + 1} / {store.queue.length}</span>{settings.timerEnabled ? <span className={secondsLeft < 30 ? 'timer danger' : 'timer'}><Clock3 /> {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span> : <span />}</div>
    <div className="progress"><i style={{ width: `${((store.index + 1) / store.queue.length) * 100}%` }} /></div>
    <section className="association-prompt">
      <p className="eyebrow">{store.mode === 'theme' ? 'TRIGGER → SHELF' : store.mode === 'fruit' ? 'SHELF → FRUIT' : store.mode === 'cause' ? 'CAUSE → FRUIT' : 'PURPOSE → ACTION'}</p>
      <p className="question-meta"><span>事例 {record.case}</span><span>{record.sourceType}</span>{record.priority && <span>{record.priority === 'A' ? 'A 必須' : 'B 推奨'}</span>}</p>
      <p>{store.mode === 'theme' ? 'このトリガーで開く題意の棚は？' : store.mode === 'fruit' ? 'この棚から出したい果キーワードは？' : store.mode === 'cause' ? 'この兆候に対応する果候補は？' : 'この目的に使う施策候補は？'}</p>
      <h1>{prompt}</h1>
    </section>
    <div className="answer-area"><div className="tag-field"><label>{label}</label><div className="tag-list">{store.answers.map((answer) => <button key={answer} onClick={() => store.removeAnswer(answer)}>{answer}<span>×</span></button>)}</div><form onSubmit={add}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={store.mode === 'theme' ? '例：情報管理' : '例：一元管理'} /><button type="submit" aria-label={`${label}を追加`}>＋</button></form></div><div className="training-actions"><button className="btn btn-ghost" onClick={grade}>わからない</button><button className="btn btn-primary" onClick={grade}>答え合わせ</button></div></div>
  </div>
}
