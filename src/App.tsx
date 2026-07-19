import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, BrainCircuit, ChevronLeft, CircleCheck, Clock3, Download, History, Home, LibraryBig, List, Moon, RefreshCw, RotateCcw, Settings, Sparkles, Sun, Target, Upload } from 'lucide-react'
import type { AppSettings, TrainingResult } from './domain/answer'
import type { Question } from './domain/question'
import { defaultSettings } from './db/indexedDb'
import { questionRepository } from './repositories/questionRepository'
import { exportProgress, importProgress, progressRepository } from './repositories/progressRepository'
import { gradingService } from './services/keywordGrader'
import { createLocalId } from './services/id'
import { useTrainingStore } from './features/training/trainingStore'
import { QuestionDetails } from './components/QuestionDetails'
import { QuestionListPage } from './features/question-list/QuestionListPage'
import { KeywordDictionaryPage } from './features/keyword-dictionary/KeywordDictionaryPage'

type Filter = { years: number[]; cases: string[]; unanswered: boolean; review: boolean; count: number }
const initialFilter: Filter = { years: [], cases: [], unanswered: false, review: false, count: 10 }

function App() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [results, setResults] = useState<TrainingResult[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => setResults(await progressRepository.getResults())
  useEffect(() => {
    void (async () => {
      try {
        await questionRepository.initialize()
        const [loadedQuestions, loadedResults, loadedSettings] = await Promise.all([questionRepository.getAll(), progressRepository.getResults(), progressRepository.getSettings()])
        setQuestions(loadedQuestions); setResults(loadedResults); setSettings(loadedSettings)
      } catch (cause) { setError(cause instanceof Error ? cause.message : '初期化に失敗しました') }
      finally { setReady(true) }
    })()
  }, [])
  useEffect(() => { document.documentElement.classList.toggle('dark', settings.darkMode) }, [settings.darkMode])

  if (!ready) return <div className="splash"><div className="brand-mark">果</div><p>学習データを準備中…</p></div>
  if (error) return <div className="splash"><p>{error}</p><button className="btn btn-primary" onClick={() => location.reload()}>再読み込み</button></div>

  return <AppShell settings={settings} setSettings={setSettings}>
    <Routes>
      <Route path="/" element={<HomePage questions={questions} results={results} />} />
      <Route path="/setup" element={<SetupPage questions={questions} results={results} />} />
      <Route path="/training" element={<TrainingPage settings={settings} onSaved={refresh} />} />
      <Route path="/overview" element={<QuestionListPage questions={questions} />} />
      <Route path="/dictionary" element={<KeywordDictionaryPage questions={questions} />} />
      <Route path="/history" element={<HistoryPage questions={questions} results={results} />} />
      <Route path="/settings" element={<SettingsPage settings={settings} setSettings={setSettings} onImported={refresh} onCleared={refresh} />} />
    </Routes>
  </AppShell>
}

function AppShell({ children, settings, setSettings }: { children: ReactNode; settings: AppSettings; setSettings: (s: AppSettings) => void }) {
  const location = useLocation()
  const hideNav = location.pathname === '/training'
  return <div className="app-shell">
    <header className="topbar"><NavLink to="/" className="brand"><span className="brand-mark small">果</span><span>果トレ</span></NavLink><button className="icon-btn" aria-label="配色を切り替える" onClick={() => { const next = { ...settings, darkMode: !settings.darkMode }; setSettings(next); void progressRepository.saveSettings(next) }}>{settings.darkMode ? <Sun /> : <Moon />}</button></header>
    <main className={hideNav ? 'main training-main' : 'main'}>{children}</main>
    {!hideNav && <nav className="bottom-nav" aria-label="メインナビゲーション"><NavItem to="/" icon={<Home />} label="ホーム" /><NavItem to="/setup" icon={<BrainCircuit />} label="演習" /><NavItem to="/overview" icon={<List />} label="一覧" /><NavItem to="/history" icon={<History />} label="履歴" /><NavItem to="/settings" icon={<Settings />} label="設定" /></nav>}
  </div>
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) { return <NavLink to={to} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>{icon}<span>{label}</span></NavLink> }

function HomePage({ questions, results }: { questions: Question[]; results: TrainingResult[] }) {
  const navigate = useNavigate()
  const latest = new Map<string, TrainingResult>(); results.forEach((r) => { if (!latest.has(r.questionId)) latest.set(r.questionId, r) })
  const stats = { unanswered: questions.length - latest.size, review: [...latest.values()].filter((r) => r.needsReview || r.selfRating < 2).length, learned: latest.size, today: [...latest.values()].filter((r) => (r.needsReview || r.selfRating < 2) && new Date(r.answeredAt).toDateString() !== new Date().toDateString()).length }
  const randomStart = () => { const shuffled = [...questions].sort(() => Math.random() - .5); useTrainingStore.getState().start(shuffled.slice(0, 10)); navigate('/training') }
  return <div className="page home-page">
    <section className="hero"><div><p className="eyebrow">MMC ANSWER TRAINING</p><h1>答えを覚えず、<br /><em>思考の型</em>を鍛える。</h1><p>題意から「切り口」と「果」を素早く導く、1問3分の答案トレーニング。</p></div><div className="today-ring"><span>{stats.today}</span><small>今日の復習</small></div></section>
    <section className="stats-grid"><Stat value={stats.unanswered} label="未回答" /><Stat value={stats.review} label="要復習" accent /><Stat value={stats.learned} label="学習済み" /></section>
    <button className="start-card" onClick={randomStart}><span className="start-icon"><Sparkles /></span><span><strong>ランダム演習を始める</strong><small>全{questions.length}問から10問を出題</small></span><span className="arrow">→</span></button>
    <h2 className="section-title">目的から選ぶ</h2>
    <div className="action-grid"><Action icon={<Clock3 />} title="年度別演習" desc="本試験の流れで" onClick={() => navigate('/setup')} /><Action icon={<BookOpen />} title="設問と果の一覧" desc="年度全体を記憶" onClick={() => navigate('/overview')} /><Action icon={<LibraryBig />} title="果キーワード辞典" desc="頻出語を横断確認" onClick={() => navigate('/dictionary')} /><Action icon={<RotateCcw />} title="要復習" desc={`${stats.review}問をもう一度`} onClick={() => navigate('/setup?review=1')} /><Action icon={<Target />} title="条件を指定" desc="細かく絞り込む" onClick={() => navigate('/setup')} /></div>
  </div>
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) { return <div className={accent ? 'stat accent' : 'stat'}><strong>{value}</strong><span>{label}</span></div> }
function Action({ icon, title, desc, onClick }: { icon: ReactNode; title: string; desc: string; onClick: () => void }) { return <button className="action-card" onClick={onClick}><span>{icon}</span><strong>{title}</strong><small>{desc}</small></button> }

function SetupPage({ questions, results }: { questions: Question[]; results: TrainingResult[] }) {
  const navigate = useNavigate(); const reviewParam = new URLSearchParams(useLocation().search).has('review')
  const [filter, setFilter] = useState<Filter>({ ...initialFilter, review: reviewParam })
  const years = [...new Set(questions.map((q) => q.year))].sort((a, b) => b - a)
  const answered = new Set(results.map((r) => r.questionId)); const reviewIds = new Set(results.filter((r) => r.needsReview || r.selfRating < 2).map((r) => r.questionId))
  const matches = questions.filter((q) => (!filter.years.length || filter.years.includes(q.year)) && (!filter.cases.length || filter.cases.includes(q.case)) && (!filter.unanswered || !answered.has(q.id)) && (!filter.review || reviewIds.has(q.id)))
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  const start = () => { useTrainingStore.getState().start([...matches].sort(() => Math.random() - .5).slice(0, filter.count)); navigate('/training') }
  return <div className="page setup-page"><div className="page-heading"><p className="eyebrow">SESSION SETUP</p><h1>出題条件</h1><p>今日の集中テーマを決めましょう。</p></div>
    <FilterGroup title="年度">{years.map((year) => <Chip key={year} active={filter.years.includes(year)} onClick={() => setFilter({ ...filter, years: toggle(filter.years, year) })}>{year}年度</Chip>)}</FilterGroup>
    <FilterGroup title="事例">{(['I', 'II', 'III', 'IV'] as const).map((c) => <Chip key={c} active={filter.cases.includes(c)} onClick={() => setFilter({ ...filter, cases: toggle(filter.cases, c) })}>事例 {c}</Chip>)}</FilterGroup>
    <FilterGroup title="学習状況"><Chip active={filter.unanswered} onClick={() => setFilter({ ...filter, unanswered: !filter.unanswered, review: false })}>未回答のみ</Chip><Chip active={filter.review} onClick={() => setFilter({ ...filter, review: !filter.review, unanswered: false })}>要復習のみ</Chip></FilterGroup>
    <FilterGroup title="出題数">{[5, 10, 20].map((count) => <Chip key={count} active={filter.count === count} onClick={() => setFilter({ ...filter, count })}>{count}問</Chip>)}</FilterGroup>
    <div className="setup-footer"><span><strong>{Math.min(matches.length, filter.count)}</strong>問を出題</span><button className="btn btn-primary" disabled={!matches.length} onClick={start}>演習を始める</button></div>
  </div>
}
function FilterGroup({ title, children }: { title: string; children: ReactNode }) { return <section className="filter-group"><h2>{title}</h2><div className="chips">{children}</div></section> }
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button className={active ? 'chip active' : 'chip'} onClick={onClick}>{active && <CircleCheck />} {children}</button> }

function TrainingPage({ settings, onSaved }: { settings: AppSettings; onSaved: () => Promise<void> }) {
  const navigate = useNavigate(); const store = useTrainingStore(); const question = store.queue[store.index]
  const [cut, setCut] = useState(''); const [keyword, setKeyword] = useState(''); const [rating, setRating] = useState<0 | 1 | 2 | 3>(2); const [review, setReview] = useState(false); const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!settings.timerEnabled || store.result) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [settings.timerEnabled, store.result])
  if (!question) return <div className="empty-state"><CircleCheck /><h1>{store.queue.length ? 'セッション完了' : '出題がありません'}</h1><p>{store.queue.length ? `${store.queue.length}問、おつかれさまでした。` : 'ホームから演習を開始してください。'}</p><button className="btn btn-primary" onClick={() => navigate('/')}>ホームへ戻る</button></div>
  const submitTag = (event: FormEvent, type: 'cut' | 'keyword') => { event.preventDefault(); if (type === 'cut') { store.addCut(cut); setCut('') } else { store.addKeyword(keyword); setKeyword('') } }
  const grade = () => store.setResult(gradingService.grade({ expectedKeywords: question.fruitKeywords, expectedCuts: question.cuts, actualKeywords: store.inputKeywords, actualCuts: store.inputCuts, useSynonyms: settings.synonymsEnabled }))
  const saveAndNext = async () => { if (!store.result) return; const item: TrainingResult = { id: createLocalId(), questionId: question.id, answeredAt: new Date().toISOString(), inputCuts: store.inputCuts, inputFruitKeywords: store.inputKeywords, keywordScore: store.result.keywordScore, cutScore: store.result.cutScore, effectScore: store.result.effectScore, totalScore: store.result.totalScore, selfRating: rating, elapsedSeconds: Math.round((Date.now() - store.startedAt) / 1000), needsReview: review || rating < 2 }; await progressRepository.saveResult(item); await onSaved(); setReview(false); setRating(2); store.next() }
  const secondsLeft = Math.max(0, settings.timerSeconds - Math.floor((now - store.startedAt) / 1000))
  if (store.result) return <ResultView question={question} rating={rating} setRating={setRating} review={review} setReview={setReview} onNext={saveAndNext} />
  return <div className="training-page"><div className="training-header"><button className="icon-btn" aria-label="演習を終了" onClick={() => navigate('/')}><ChevronLeft /></button><span>{store.index + 1} / {store.queue.length}</span>{settings.timerEnabled ? <span className={secondsLeft < 30 ? 'timer danger' : 'timer'}><Clock3 /> {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span> : <span />}</div><div className="progress"><i style={{ width: `${((store.index + 1) / store.queue.length) * 100}%` }} /></div>
    <div className="question-card">
      <p className="question-meta"><span>{question.year}年度</span><span>事例 {question.case}</span><span>{question.questionNo}</span>{question.subQuestionNo && <span>{question.subQuestionNo}</span>}</p>
      <QuestionDetails question={question} />
    </div>
    <div className="answer-area"><TagInput label="切り口" placeholder="例：組織構造" value={cut} setValue={setCut} tags={store.inputCuts} onSubmit={(e) => submitTag(e, 'cut')} onRemove={store.removeCut} /><TagInput label="果キーワード" placeholder="例：権限委譲" value={keyword} setValue={setKeyword} tags={store.inputKeywords} onSubmit={(e) => submitTag(e, 'keyword')} onRemove={store.removeKeyword} />
      <div className="training-actions"><button className="btn btn-ghost" onClick={() => { store.addKeyword('わからない'); grade() }}>わからない</button><button className="btn btn-primary" onClick={grade}>答え合わせ</button></div></div>
  </div>
}

function TagInput({ label, placeholder, value, setValue, tags, onSubmit, onRemove }: { label: string; placeholder: string; value: string; setValue: (v: string) => void; tags: string[]; onSubmit: (e: FormEvent) => void; onRemove: (v: string) => void }) { return <div className="tag-field"><label>{label}</label><div className="tag-list">{tags.map((tag) => <button key={tag} onClick={() => onRemove(tag)}>{tag}<span>×</span></button>)}</div><form onSubmit={onSubmit}><input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} /><button type="submit" aria-label={`${label}を追加`}>＋</button></form></div> }

function ResultView({ question, rating, setRating, review, setReview, onNext }: { question: Question; rating: 0 | 1 | 2 | 3; setRating: (v: 0 | 1 | 2 | 3) => void; review: boolean; setReview: (v: boolean) => void; onNext: () => void }) {
  const { inputCuts, inputKeywords, result, index, queue } = useTrainingStore(); if (!result) return null
  return <div className="page result-page"><div className="score-hero"><p className="eyebrow">RESULT</p><div className="score"><strong>{result.totalScore}</strong><span>/ 100</span></div><p>{result.totalScore >= 70 ? 'いい型です。再現できる形にしましょう。' : '伸びしろを、次の一問につなげよう。'}</p><div className="score-bars"><ScoreBar label="果" value={result.keywordScore} max={60} /><ScoreBar label="切り口" value={result.cutScore} max={25} /><ScoreBar label="効果" value={result.effectScore} max={15} /></div></div>
    <section className="result-question"><p className="question-meta"><span>{question.year}年度</span><span>事例 {question.case}</span><span>{question.questionNo}</span>{question.subQuestionNo && <span>{question.subQuestionNo}</span>}</p><QuestionDetails question={question} compact /></section>
    <Compare title="切り口" mine={inputCuts} expected={question.cuts} matched={result.matchedCuts.map((m) => m.expected)} /><Compare title="果キーワード" mine={inputKeywords} expected={question.fruitKeywords} matched={result.matchedKeywords.map((m) => m.expected)} />
    <section className="model-answer"><p className="eyebrow">MMC 模範解答</p><p>{question.modelAnswer}</p>{question.sourcePages && <small>出典：{question.sourcePages}{question.answerSource ? `（${question.answerSource}）` : ''}</small>}</section>
    <section className="rating"><h2>自分の手応え</h2><div className="rating-grid">{(['題意を外した', '領域は近い', '主な果が一部一致', '題意・主要果が一致'] as const).map((label, i) => <button key={label} className={rating === i ? 'active' : ''} onClick={() => setRating(i as 0 | 1 | 2 | 3)}><strong>{i}</strong><span>{label}</span></button>)}</div></section>
    <label className="review-toggle"><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /><RefreshCw /><span><strong>復習対象にする</strong><small>あとで「要復習」から取り組めます</small></span></label>
    <button className="btn btn-primary wide" onClick={() => void onNext()}>{index + 1 < queue.length ? '次の問題へ' : 'セッションを終了'}</button>
  </div>
}
function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) { return <div><span>{label}</span><i><b style={{ width: `${(value / max) * 100}%` }} /></i><strong>{value}/{max}</strong></div> }
function Compare({ title, mine, expected, matched }: { title: string; mine: string[]; expected: string[]; matched: string[] }) { return <section className="compare"><h2>{title}</h2><div><p>あなたの回答</p><div className="tag-list static">{mine.length ? mine.map((v) => <span key={v}>{v}</span>) : <small>入力なし</small>}</div></div><div><p>登録済みの正解</p><div className="tag-list static expected">{expected.map((v) => <span key={v} className={matched.includes(v) ? 'match' : 'miss'}>{matched.includes(v) ? '✓ ' : '— '}{v}</span>)}</div></div></section> }

function HistoryPage({ questions, results }: { questions: Question[]; results: TrainingResult[] }) {
  const [caseFilter, setCaseFilter] = useState('all'); const questionMap = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
  const visible = results.filter((result) => caseFilter === 'all' || questionMap.get(result.questionId)?.case === caseFilter || result.legacyGroupId?.split('-')[1] === caseFilter)
  return <div className="page"><div className="page-heading"><p className="eyebrow">LEARNING LOG</p><h1>学習履歴</h1><p>{results.length}回の答案思考を記録しています。</p></div><div className="chips compact"><Chip active={caseFilter === 'all'} onClick={() => setCaseFilter('all')}>すべて</Chip>{['I', 'II', 'III', 'IV'].map((c) => <Chip key={c} active={caseFilter === c} onClick={() => setCaseFilter(c)}>事例 {c}</Chip>)}</div>
    <div className="history-list">{visible.length ? visible.map((result) => { const q = questionMap.get(result.questionId); const legacy = result.isLegacy ? '（旧記録）' : ''; return <article key={result.id}><div className="history-date">{new Date(result.answeredAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}<small>{new Date(result.answeredAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</small></div><div><p>{q ? `${q.year} 事例${q.case} ${q.questionNo}${q.subQuestionNo ? ` ${q.subQuestionNo}` : ''}` : `${result.legacyGroupId ?? result.questionId}${legacy}`}</p><strong>{q?.questionSummary ?? (result.isLegacy ? '分割前の学習記録' : '問題')}</strong><small>自己評価 {result.selfRating} {result.needsReview && '・要復習'}</small></div><div className={result.totalScore >= 70 ? 'history-score good' : 'history-score'}>{result.totalScore}<small>点</small></div></article> }) : <div className="empty-inline"><History /><p>条件に合う履歴はありません</p></div>}</div>
  </div>
}

function SettingsPage({ settings, setSettings, onImported, onCleared }: { settings: AppSettings; setSettings: (s: AppSettings) => void; onImported: () => Promise<void>; onCleared: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null); const update = (patch: Partial<AppSettings>) => { const next = { ...settings, ...patch }; setSettings(next); void progressRepository.saveSettings(next) }
  const download = async () => { const blob = await exportProgress(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `kahotore-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url) }
  const upload = async (file?: File) => { if (!file) return; try { await importProgress(file); await onImported(); alert('学習履歴を読み込みました') } catch (error) { alert(error instanceof Error ? error.message : '読み込みに失敗しました') } }
  const clear = async () => { if (!confirm('すべての学習履歴を削除しますか？この操作は元に戻せません。')) return; await progressRepository.clear(); await onCleared() }
  return <div className="page"><div className="page-heading"><p className="eyebrow">PREFERENCES</p><h1>設定</h1><p>自分の学習スタイルに合わせます。</p></div>
    <section className="settings-card"><h2>演習</h2><SettingRow icon={<Clock3 />} title="制限時間" desc="問題ごとに残り時間を表示"><Switch checked={settings.timerEnabled} onChange={(v) => update({ timerEnabled: v })} /></SettingRow>{settings.timerEnabled && <label className="number-setting"><span>制限時間（秒）</span><input type="number" min="30" max="1800" step="30" value={settings.timerSeconds} onChange={(e) => update({ timerSeconds: Number(e.target.value) })} /></label>}<SettingRow icon={<BrainCircuit />} title="同義語判定" desc="表記揺れや言い換えを一致判定"><Switch checked={settings.synonymsEnabled} onChange={(v) => update({ synonymsEnabled: v })} /></SettingRow><SettingRow icon={settings.darkMode ? <Moon /> : <Sun />} title="ダークモード" desc="暗い場所でも目にやさしく"><Switch checked={settings.darkMode} onChange={(v) => update({ darkMode: v })} /></SettingRow></section>
    <section className="settings-card"><h2>バックアップ</h2><button className="setting-button" onClick={() => void download()}><Download /><span><strong>履歴をエクスポート</strong><small>JSONファイルとして保存</small></span></button><button className="setting-button" onClick={() => fileRef.current?.click()}><Upload /><span><strong>履歴をインポート</strong><small>バックアップから復元・統合</small></span></button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(e) => void upload(e.target.files?.[0])} /></section>
    <button className="danger-button" onClick={() => void clear()}>全履歴を削除</button><p className="version">果トレ MVP v0.1.0 ・ 問題データ 51件</p>
  </div>
}
function SettingRow({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) { return <div className="setting-row"><span className="setting-icon">{icon}</span><span><strong>{title}</strong><small>{desc}</small></span>{children}</div> }
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) { return <button role="switch" aria-checked={checked} className={checked ? 'switch on' : 'switch'} onClick={() => onChange(!checked)}><i /></button> }

export default App
