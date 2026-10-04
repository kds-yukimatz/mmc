import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, BrainCircuit, ChevronLeft, CircleCheck, Clock3, Download, History, Home, LibraryBig, Moon, RefreshCw, RotateCcw, Settings, Sparkles, Sun, Target, Upload } from 'lucide-react'
import type { AppSettings, TrainingResult, WeaknessProfile } from './domain/answer'
import { isQuestionEligibleForTraining, type Question } from './domain/question'
import { defaultSettings } from './db/indexedDb'
import { questionRepository } from './repositories/questionRepository'
import { importPrivateQuestions, removePrivateQuestions } from './repositories/privateQuestionImportRepository'
import { exportProgress, importProgress, progressRepository } from './repositories/progressRepository'
import { gradingService } from './services/keywordGrader'
import { createLocalId } from './services/id'
import { useTrainingStore } from './features/training/trainingStore'
import { QuestionDetails } from './components/QuestionDetails'
import { QuestionListPage } from './features/question-list/QuestionListPage'
import { KeywordDictionaryPage } from './features/keyword-dictionary/KeywordDictionaryPage'
import type { AssociationRecord, TrainingMode } from './domain/association'
import { buildAssociationRecords } from './features/association/associationDictionary'
import { filterAssociationStock, type StockFilter } from './data/reviewFruitStock'
import { useAssociationTrainingStore } from './features/association/associationTrainingStore'
import { AssociationTrainingPage } from './features/association/AssociationTrainingPage'
import { AssociationListPage } from './features/association/AssociationListPage'
import { FeedbackPanel, type Feedback } from './features/weakness/FeedbackPanel'
import { dashboard, isCorrect, matchesReview, nextStreak, presets, priorityScore, reviewDefaults, studyItems, suggestedTags, tagCatalog, type ReviewFilter } from './features/weakness/weaknessReview'
import { MicroHome, MicroMaterials, MicroRecords, MicroSessionPage } from './features/micro/MicroPages'
import { getData as getMicroData } from './features/micro/repository'
import { getOpenAbstractionSession } from './features/abstraction/abstractionSessionRepository'
import { AbstractionLibraryPage, AbstractionRecordsPage, AbstractionSetupPage, AbstractionTrainingPage } from './features/abstraction/AbstractionPages'

type Filter = { years: number[]; cases: string[]; unanswered: boolean; review: boolean; count: number }
const initialFilter: Filter = { years: [], cases: [], unanswered: false, review: false, count: 10 }

function App() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [results, setResults] = useState<TrainingResult[]>([])
  const [profiles, setProfiles] = useState<WeaknessProfile[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const associationRecords = useMemo(() => buildAssociationRecords(questions), [questions])

  const refresh = async () => {
    const [loadedQuestions, loadedResults, loadedProfiles] = await Promise.all([questionRepository.getAll(), progressRepository.getResults(), progressRepository.getProfiles()])
    setQuestions(loadedQuestions)
    setResults(loadedResults)
    setProfiles(loadedProfiles)
  }
  useEffect(() => {
    void (async () => {
      try {
        await questionRepository.initialize()
        const [loadedQuestions, loadedResults, loadedSettings, loadedProfiles] = await Promise.all([questionRepository.getAll(), progressRepository.getResults(), progressRepository.getSettings(), progressRepository.getProfiles()])
        setQuestions(loadedQuestions); setResults(loadedResults); setSettings(loadedSettings); setProfiles(loadedProfiles)
      } catch (cause) { setError(cause instanceof Error ? cause.message : '初期化に失敗しました') }
      finally { setReady(true) }
    })()
  }, [])
  useEffect(() => { document.documentElement.classList.toggle('dark', settings.darkMode) }, [settings.darkMode])

  if (!ready) return <div className="splash"><div className="brand-mark">果</div><p>学習データを準備中…</p></div>
  if (error) return <div className="splash"><p>{error}</p><button className="btn btn-primary" onClick={() => location.reload()}>再試行</button></div>

  return <AppShell settings={settings} setSettings={setSettings}>
    <Routes>
      <Route path="/" element={<MicroHome />} />
      <Route path="/micro/session" element={<MicroSessionPage />} />
      <Route path="/abstraction" element={<AbstractionSetupPage />} />
      <Route path="/abstraction/setup" element={<AbstractionSetupPage />} />
      <Route path="/abstraction/training" element={<AbstractionTrainingPage />} />
      <Route path="/abstraction/records" element={<AbstractionRecordsPage />} />
      <Route path="/abstraction/library" element={<AbstractionLibraryPage />} />
      <Route path="/materials" element={<MicroMaterials />} />
      <Route path="/records" element={<MicroRecords />} />
      <Route path="/legacy" element={<HomePage questions={questions} associations={associationRecords} profiles={profiles} results={results} />} />
      <Route path="/setup" element={<SetupPage questions={questions} associations={associationRecords} profiles={profiles} results={results} />} />
      <Route path="/training" element={<TrainingPage settings={settings} profiles={profiles} results={results} onSaved={refresh} />} />
      <Route path="/association-training" element={<AssociationTrainingPage settings={settings} profiles={profiles} results={results} onSaved={refresh} />} />
      <Route path="/overview" element={<QuestionListPage questions={questions} />} />
      <Route path="/overview/associations" element={<AssociationListPage records={associationRecords} />} />
      <Route path="/dictionary" element={<KeywordDictionaryPage questions={questions} />} />
      <Route path="/history" element={<HistoryPage questions={questions} associations={associationRecords} results={results} />} />
      <Route path="/settings" element={<SettingsPage settings={settings} setSettings={setSettings} questionCount={questions.length} onImported={refresh} onCleared={refresh} />} />
    </Routes>
  </AppShell>
}

function AppShell({ children, settings, setSettings }: { children: ReactNode; settings: AppSettings; setSettings: (s: AppSettings) => void }) {
  const location = useLocation()
  const [updateReady, setUpdateReady] = useState(Boolean((window as Window & { kahotoreUpdateReady?: boolean }).kahotoreUpdateReady))
  const [openMicro, setOpenMicro] = useState(false)
  useEffect(() => {
    const ready = () => setUpdateReady(true)
    window.addEventListener('kahotore-update-ready', ready)
    return () => window.removeEventListener('kahotore-update-ready', ready)
  }, [])
  useEffect(() => {
    const check = () => { void Promise.all([getMicroData(), getOpenAbstractionSession()]).then(([micro, abstraction]) => setOpenMicro(Boolean(micro.session || abstraction))) }
    check(); window.addEventListener('kahotore-session-changed', check)
    const timer = window.setInterval(check, updateReady ? 1500 : 15000)
    return () => { window.clearInterval(timer); window.removeEventListener('kahotore-session-changed', check) }
  }, [location.pathname, updateReady])
  const hideNav = location.pathname === '/training' || location.pathname === '/association-training' || location.pathname === '/micro/session' || location.pathname === '/abstraction/training'
  return <div className="app-shell">
    <header className="topbar"><NavLink to="/" className="brand"><span className="brand-mark small">果</span><span>果トレ</span></NavLink><div style={{ display: 'flex' }}><NavLink className="icon-btn" to="/settings" aria-label="設定"><Settings /></NavLink><button className="icon-btn" aria-label="配色を切り替える" onClick={() => { const next = { ...settings, darkMode: !settings.darkMode }; setSettings(next); void progressRepository.saveSettings(next) }}>{settings.darkMode ? <Sun /> : <Moon />}</button></div></header>
    <main className={hideNav ? 'main training-main' : 'main'}>{children}</main>
    {updateReady && !openMicro && (!hideNav || location.pathname === '/micro/session' || location.pathname === '/abstraction/training') && <div className="micro-update" role="status">新しい教材・画面を準備できた。<button className="btn btn-ghost" onClick={() => window.dispatchEvent(new Event('kahotore-apply-update'))}>更新する</button></div>}
    {!hideNav && <nav className="bottom-nav" aria-label="メインナビゲーション"><NavItem to="/" icon={<Home />} label="今日" /><NavItem to="/materials" icon={<BookOpen />} label="教材" /><NavItem to="/records" icon={<History />} label="記録" /></nav>}
  </div>
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) { return <NavLink to={to} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>{icon}<span>{label}</span></NavLink> }

function HomePage({ questions, associations, profiles, results }: { questions: Question[]; associations: AssociationRecord[]; profiles: WeaknessProfile[]; results: TrainingResult[] }) {
  const navigate = useNavigate()
  const [currentResults, setCurrentResults] = useState(results)
  useEffect(() => { void progressRepository.getResults().then(setCurrentResults) }, [])
  const trainingQuestions = questions.filter(isQuestionEligibleForTraining)
  const questionIds = new Set(trainingQuestions.map((question) => question.id))
  const latest = new Map<string, TrainingResult>(); currentResults.forEach((r) => { if (questionIds.has(r.questionId) && !latest.has(r.questionId)) latest.set(r.questionId, r) })
  const stats = { unanswered: trainingQuestions.length - latest.size, review: [...latest.values()].filter((r) => r.needsReview || r.selfRating < 2).length, learned: latest.size, today: [...latest.values()].filter((r) => (r.needsReview || r.selfRating < 2) && new Date(r.answeredAt).toDateString() !== new Date().toDateString()).length }
  const abstractionResults = currentResults.filter((result) => result.abstraction)
  const abstractionReviewCount = abstractionResults.filter((result) => result.needsReview || result.selfRating < 2).length
  const legacyResults = currentResults.filter((result) => !result.abstraction)
  const overview = dashboard([...studyItems(trainingQuestions.filter((q) => q.case !== 'IV'), associations, 'question', profiles), ...studyItems(trainingQuestions, associations, 'cause', profiles), ...studyItems(trainingQuestions, associations, 'purpose', profiles)], legacyResults)
  const questionLabels = new Map(trainingQuestions.map((question) => [question.id, question.questionSummary]))
  const randomStart = () => { const shuffled = [...trainingQuestions].sort(() => Math.random() - .5); useTrainingStore.getState().start(shuffled.slice(0, 10)); navigate('/training') }
  return <div className="page home-page">
    <section className="hero"><div><p className="eyebrow">MMC ANSWER TRAINING</p><h1>答えを覚えず、<br /><em>思考の型</em>を鍛える。</h1><p>題意から「切り口」と「果」を素早く導く、1問3分の答案トレーニング。</p></div><div className="today-ring"><span>{stats.today}</span><small>今日の復習</small></div></section>
    <section className="stats-grid"><Stat value={stats.unanswered} label="未回答" /><Stat value={stats.review} label="要復習" accent /><Stat value={stats.learned} label="学習済み" /></section>
    <button className="start-card" onClick={randomStart}><span className="start-icon"><Sparkles /></span><span><strong>ランダム演習を始める</strong><small>確認済み{trainingQuestions.length}問から10問を出題</small></span><span className="arrow">→</span></button>
    <h2 className="section-title">目的から選ぶ</h2>
    <div className="action-grid"><Action icon={<Target />} title="A必須ストック" desc="再分析の因→果" onClick={() => navigate('/setup?mode=cause&stock=A')} /><Action icon={<BrainCircuit />} title="題意トレ" desc="トリガーから棚へ" onClick={() => navigate('/setup?mode=theme')} /><Action icon={<Sparkles />} title="棚から果トレ" desc="棚から果を想起" onClick={() => navigate('/setup?mode=fruit')} /><Action icon={<Clock3 />} title="年度別演習" desc="本試験の流れで" onClick={() => navigate('/setup')} /><Action icon={<BookOpen />} title="設問と果の一覧" desc="年度全体を記憶" onClick={() => navigate('/overview')} /><Action icon={<LibraryBig />} title="題意・果の辞典" desc="検索経路を確認" onClick={() => navigate('/overview/associations')} /><Action icon={<BrainCircuit />} title="与件を読む前の練習" desc="題意から棚と果候補へ" onClick={() => navigate('/abstraction/setup')} /><Action icon={<RotateCcw />} title="弱点復習" desc="苦戦した論点を優先" onClick={() => navigate('/setup?review=1')} /><Action icon={<Target />} title="事例Ⅰ重点" desc="営業・組織・人事" onClick={() => navigate('/setup?preset=I')} /><Action icon={<Target />} title="事例Ⅲ重点" desc="在庫・資材・納期" onClick={() => navigate('/setup?preset=III')} /><Action icon={<Target />} title="条件を指定" desc="細かく絞り込む" onClick={() => navigate('/setup')} /></div>
    <section className="dashboard-card"><h2>弱点ダッシュボード</h2><p>題意トレ {abstractionResults.length}回・要復習 {abstractionReviewCount}回</p><div className="dashboard-metrics"><span>果キーワード不足 <strong>{overview.fruitMissing}</strong></span><span>題意判断で迷った <strong>{overview.themeUncertain}</strong></span><span>連続正解 <strong>{overview.mastered}</strong></span><span>未復習 <strong>{overview.unseen}</strong></span></div><h3>事例別正答率</h3><div className="dashboard-rates">{overview.byCase.map((row) => <span key={row.name}>{row.name} <strong>{row.rate === null ? '未回答' : `${row.rate}%`}</strong></span>)}</div><h3>弱点タグ別正答率</h3><div className="dashboard-rates">{overview.tags.length ? overview.tags.slice(0, 8).map((row) => <span key={row.name}>{row.name} <strong>{row.rate}%</strong></span>) : <small>回答後に表示します</small>}</div><h3>最近詰まった論点</h3><p>{overview.recent.length ? overview.recent.map((row) => row.abstraction?.abstractQuestion ?? row.promptLabel ?? questionLabels.get(row.questionId) ?? row.questionId).join('／') : 'まだ記録がありません'}</p><h3>今日の重点復習候補</h3><p>{overview.today.length ? overview.today.map((row) => row.question?.questionSummary ?? row.association?.cause ?? row.association?.purpose ?? row.id).join('／') : '候補はありません'}</p></section>
  </div>
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) { return <div className={accent ? 'stat accent' : 'stat'}><strong>{value}</strong><span>{label}</span></div> }
function Action({ icon, title, desc, onClick }: { icon: ReactNode; title: string; desc: string; onClick: () => void }) { return <button className="action-card" onClick={onClick}><span>{icon}</span><strong>{title}</strong><small>{desc}</small></button> }

function SetupPage({ questions, associations, profiles, results }: { questions: Question[]; associations: AssociationRecord[]; profiles: WeaknessProfile[]; results: TrainingResult[] }) {
  const navigate = useNavigate(); const params = new URLSearchParams(useLocation().search); const reviewParam = params.has('review'); const preset = params.get('preset')
  const initialMode = (['theme', 'fruit', 'cause', 'purpose'].includes(params.get('mode') ?? '') ? params.get('mode') : 'question') as TrainingMode
  const [mode, setMode] = useState<TrainingMode>(initialMode)
  const [stockFilter, setStockFilter] = useState<StockFilter>(params.get('stock') === 'A' ? 'A' : 'all')
  const [filter, setFilter] = useState<Filter>({ ...initialFilter, review: false })
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>({ ...reviewDefaults, weaknessOnly: reviewParam, cases: preset === 'I' || preset === 'III' ? [preset] : [], tags: preset === 'I' ? [...presets.I] : preset === 'III' ? [...presets.III] : [] })
  const trainingQuestions = questions.filter(isQuestionEligibleForTraining)
  const scopedAssociations = filterAssociationStock(associations, stockFilter)
  const years = [...new Set((mode === 'question' ? trainingQuestions : scopedAssociations).map((item) => item.year))].sort((a, b) => b - a)
  const answered = new Set(results.map((r) => r.questionId))
  const items = studyItems(trainingQuestions, scopedAssociations, mode, profiles)
  const matches = items.filter((item) => (!filter.unanswered || !answered.has(item.id)) && matchesReview(item, results, reviewFilter))
  const matchCount = matches.length
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  const changeMode = (nextMode: TrainingMode) => { setMode(nextMode); setReviewFilter({ ...reviewFilter, years: [], cases: nextMode === 'question' ? reviewFilter.cases : reviewFilter.cases.filter((value) => value !== 'IV') }) }
  const start = () => {
    const selected = [...matches].sort((a, b) => priorityScore(b, results) - priorityScore(a, results)).slice(0, filter.count)
    if (mode === 'question') { useTrainingStore.getState().start(selected.flatMap((item) => item.question ? [item.question] : [])); navigate('/training'); return }
    useAssociationTrainingStore.getState().start(selected.flatMap((item) => item.association ? [item.association] : []), mode)
    navigate('/association-training')
  }
  return <div className="page setup-page"><div className="page-heading"><p className="eyebrow">SESSION SETUP</p><h1>出題条件</h1><p>今日の集中テーマを決めましょう。</p></div>
    <FilterGroup title="トレーニング"><div className="training-mode-grid"><Chip active={mode === 'question'} onClick={() => changeMode('question')}>本試一問一答</Chip><Chip active={mode === 'theme'} onClick={() => changeMode('theme')}>題意トレ</Chip><Chip active={mode === 'fruit'} onClick={() => changeMode('fruit')}>棚から果トレ</Chip><Chip active={mode === 'cause'} onClick={() => changeMode('cause')}>因→果</Chip><Chip active={mode === 'purpose'} onClick={() => changeMode('purpose')}>目的→施策</Chip></div><p className="mode-description">{mode === 'question' ? '本試験の設問文から切り口と果を答えます。' : mode === 'theme' ? '題意・与件のトリガーから棚を答えます。' : mode === 'fruit' ? '棚から果キーワードを答えます。' : mode === 'cause' ? '事例上の兆候から使える果候補を答えます。' : '達成したい目的から施策候補を答えます。'}</p></FilterGroup>
    <FilterGroup title="年度">{years.map((year) => <Chip key={year} active={reviewFilter.years.includes(year)} onClick={() => setReviewFilter({ ...reviewFilter, years: toggle(reviewFilter.years, year) })}>{year}年度</Chip>)}</FilterGroup>
    {mode !== 'question' && <FilterGroup title="復習ストック"><Chip active={stockFilter === 'all'} onClick={() => setStockFilter('all')}>全教材</Chip><Chip active={stockFilter === 'stock'} onClick={() => setStockFilter('stock')}>追加ストック</Chip><Chip active={stockFilter === 'A'} onClick={() => setStockFilter('A')}>A 必須</Chip><Chip active={stockFilter === 'B'} onClick={() => setStockFilter('B')}>B 推奨</Chip><p className="mode-description">CS512・522・532の再分析から汎用化した復習候補。A・Bは覚える優先度です。</p></FilterGroup>}
    <FilterGroup title="事例">{(mode === 'question' ? ['I', 'II', 'III', 'IV'] : ['I', 'II', 'III']).map((c) => <Chip key={c} active={reviewFilter.cases.includes(c)} onClick={() => setReviewFilter({ ...reviewFilter, cases: toggle(reviewFilter.cases, c) })}>事例 {c}</Chip>)}</FilterGroup>
    <FilterGroup title="学習状況"><Chip active={filter.unanswered} onClick={() => setFilter({ ...filter, unanswered: !filter.unanswered })}>未回答のみ</Chip><Chip active={reviewFilter.weaknessOnly} onClick={() => setReviewFilter({ ...reviewFilter, weaknessOnly: !reviewFilter.weaknessOnly })}>弱点のみ</Chip><Chip active={reviewFilter.lastIncorrect} onClick={() => setReviewFilter({ ...reviewFilter, lastIncorrect: !reviewFilter.lastIncorrect })}>前回不正解</Chip><Chip active={reviewFilter.lastSlow} onClick={() => setReviewFilter({ ...reviewFilter, lastSlow: !reviewFilter.lastSlow })}>前回時間がかかった</Chip><Chip active={reviewFilter.lowAccuracy} onClick={() => setReviewFilter({ ...reviewFilter, lowAccuracy: !reviewFilter.lowAccuracy })}>過去N回の正答率60%未満</Chip><Chip active={reviewFilter.recentMistake} onClick={() => setReviewFilter({ ...reviewFilter, recentMistake: !reviewFilter.recentMistake })}>14日以内に不正解</Chip><Chip active={reviewFilter.stale} onClick={() => setReviewFilter({ ...reviewFilter, stale: !reviewFilter.stale })}>30日以上未復習</Chip></FilterGroup>
    <FilterGroup title="弱点タグ"><div className="chips">{[...new Set([...reviewFilter.tags, ...items.filter((item) => !reviewFilter.cases.length || reviewFilter.cases.includes(item.case)).flatMap((item) => item.tags), ...reviewFilter.cases.filter((value): value is 'I' | 'II' | 'III' => value === 'I' || value === 'II' || value === 'III').flatMap((value) => tagCatalog[value])])].map((tag) => <Chip key={tag} active={reviewFilter.tags.includes(tag)} onClick={() => setReviewFilter({ ...reviewFilter, tags: toggle(reviewFilter.tags, tag) })}>{tag}</Chip>)}</div><p className="mode-description">タグ同士はOR、年度・事例・学習状況とはANDで絞り込みます。</p></FilterGroup>
    {reviewFilter.lowAccuracy && <label className="number-setting"><span>正答率をみる直近の回数 N</span><input type="number" min="1" max="30" value={reviewFilter.recentCount} onChange={(event) => setReviewFilter({ ...reviewFilter, recentCount: Math.max(1, Math.min(30, Number(event.target.value) || 1)) })} /></label>}
    <FilterGroup title="出題数">{[5, 10, 20].map((count) => <Chip key={count} active={filter.count === count} onClick={() => setFilter({ ...filter, count })}>{count}問</Chip>)}</FilterGroup>
    <div className="setup-footer"><span><strong>{Math.min(matchCount, filter.count)}</strong>問を出題</span><button className="btn btn-primary" disabled={!matchCount} onClick={start}>演習を始める</button></div>
  </div>
}
function FilterGroup({ title, children }: { title: string; children: ReactNode }) { return <section className="filter-group"><h2>{title}</h2><div className="chips">{children}</div></section> }
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button className={active ? 'chip active' : 'chip'} onClick={onClick}>{active && <CircleCheck />} {children}</button> }

function TrainingPage({ settings, profiles, results, onSaved }: { settings: AppSettings; profiles: WeaknessProfile[]; results: TrainingResult[]; onSaved: () => Promise<void> }) {
  const navigate = useNavigate(); const store = useTrainingStore(); const question = store.queue[store.index]
  const [cut, setCut] = useState(''); const [keyword, setKeyword] = useState(''); const [rating, setRating] = useState<0 | 1 | 2 | 3>(2); const [review, setReview] = useState(false); const [now, setNow] = useState(Date.now())
  const [gradedAt, setGradedAt] = useState(Date.now())
  useEffect(() => { if (!settings.timerEnabled || store.result) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [settings.timerEnabled, store.result])
  if (!question) return <div className="empty-state"><CircleCheck /><h1>{store.queue.length ? 'セッション完了' : '出題がありません'}</h1><p>{store.queue.length ? `${store.queue.length}問、おつかれさまでした。` : 'ホームから演習を開始してください。'}</p><button className="btn btn-primary" onClick={() => navigate('/')}>ホームへ戻る</button></div>
  const submitTag = (event: FormEvent, type: 'cut' | 'keyword') => { event.preventDefault(); if (type === 'cut') { store.addCut(cut); setCut('') } else { store.addKeyword(keyword); setKeyword('') } }
  const grade = () => { if (keyword.trim()) { store.addKeyword(keyword); setKeyword('') } const answer = useTrainingStore.getState(); setGradedAt(Date.now()); store.setResult(gradingService.grade({ expectedKeywords: question.fruitKeywords, expectedCuts: question.cuts, actualKeywords: answer.inputKeywords, actualCuts: answer.inputCuts, useSynonyms: settings.synonymsEnabled })) }
  const saveAndNext = async (feedback: Feedback) => { if (!store.result) return; const correct = Boolean(feedback.correct); const item: TrainingResult = { id: createLocalId(), questionId: question.id, answeredAt: new Date(gradedAt).toISOString(), inputCuts: store.inputCuts, inputFruitKeywords: store.inputKeywords, keywordScore: store.result.keywordScore, cutScore: store.result.cutScore, effectScore: store.result.effectScore, totalScore: store.result.totalScore, selfRating: rating, elapsedSeconds: Math.round((gradedAt - store.startedAt) / 1000), needsReview: Boolean(feedback.needsReview) || rating < 2, correct, struggleReasons: feedback.struggleReasons, weaknessTags: feedback.weaknessTags, streak: nextStreak(question.id, correct, results) }; await progressRepository.saveProfile({ id: question.id, tags: feedback.weaknessTags ?? [] }); await progressRepository.saveResult(item); await onSaved(); setCut(''); setKeyword(''); setReview(false); setRating(2); store.next() }
  const secondsLeft = Math.max(0, settings.timerSeconds - Math.floor((now - store.startedAt) / 1000))
  if (store.result) return <ResultView question={question} profile={profiles.find((profile) => profile.id === question.id)} elapsedSeconds={Math.round((gradedAt - store.startedAt) / 1000)} rating={rating} setRating={setRating} review={review} setReview={setReview} onNext={saveAndNext} />
  return <div className="training-page"><div className="training-header"><button className="icon-btn" aria-label="演習を終了" onClick={() => navigate('/')}><ChevronLeft /></button><span>{store.index + 1} / {store.queue.length}</span>{settings.timerEnabled ? <span className={secondsLeft < 30 ? 'timer danger' : 'timer'}><Clock3 /> {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span> : <span />}</div><div className="progress"><i style={{ width: `${((store.index + 1) / store.queue.length) * 100}%` }} /></div>
    <div className="question-card">
      <p className="question-meta"><span>{question.year}年度</span><span>事例 {question.case}</span><span>{question.questionNo}</span>{question.subQuestionNo && <span>{question.subQuestionNo}</span>}</p>
      <QuestionDetails question={question} promptOnly={store.phase === 'cuts'} />
    </div>
    <div className="answer-area">{store.phase === 'cuts' ? <>
      <p className="step-label">Step 1：題意から切り口を考えてください</p>
      <TagInput label="切り口" placeholder="切り口を入力" value={cut} setValue={setCut} tags={store.inputCuts} onSubmit={(e) => submitTag(e, 'cut')} onRemove={store.removeCut} />
      <div className="training-actions single"><button className="btn btn-primary" onClick={() => { if (cut.trim()) { store.addCut(cut); setCut('') } store.advanceToKeywords() }}>因・果を考える →</button></div>
    </> : <>
      <p className="step-label">Step 2：設問文から因を拾い、一般的な果キーワード候補を答えてください</p>
      <div className="entered-cuts"><strong>入力した切り口</strong><span>{store.inputCuts.length ? store.inputCuts.join('・') : '未入力'}</span><button type="button" onClick={store.returnToCuts}>切り口を修正</button></div>
      <TagInput label="果キーワード" placeholder="果キーワードを入力" value={keyword} setValue={setKeyword} tags={store.inputKeywords} onSubmit={(e) => submitTag(e, 'keyword')} onRemove={store.removeKeyword} />
      <div className="training-actions"><button className="btn btn-ghost" onClick={() => { store.addKeyword('わからない'); grade() }}>わからない</button><button className="btn btn-primary" onClick={grade}>答え合わせ</button></div>
    </>}</div>
  </div>
}

function TagInput({ label, placeholder, value, setValue, tags, onSubmit, onRemove }: { label: string; placeholder: string; value: string; setValue: (v: string) => void; tags: string[]; onSubmit: (e: FormEvent) => void; onRemove: (v: string) => void }) { return <div className="tag-field"><label>{label}</label><div className="tag-list">{tags.map((tag) => <button key={tag} onClick={() => onRemove(tag)}>{tag}<span>×</span></button>)}</div><form onSubmit={onSubmit}><input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} /><button type="submit" aria-label={`${label}を追加`}>＋</button></form></div> }

function ResultView({ question, profile, elapsedSeconds, rating, setRating, review, setReview, onNext }: { question: Question; profile?: WeaknessProfile; elapsedSeconds: number; rating: 0 | 1 | 2 | 3; setRating: (v: 0 | 1 | 2 | 3) => void; review: boolean; setReview: (v: boolean) => void; onNext: (feedback: Feedback) => Promise<void> }) {
  const { inputCuts, inputKeywords, result, index, queue } = useTrainingStore(); if (!result) return null
  return <div className="page result-page"><div className="score-hero"><p className="eyebrow">RESULT</p><div className="score"><strong>{result.totalScore}</strong><span>/ 100</span></div><p>{result.totalScore >= 70 ? 'いい型です。再現できる形にしましょう。' : '伸びしろを、次の一問につなげよう。'}</p><div className="score-bars"><ScoreBar label="果" value={result.keywordScore} max={60} /><ScoreBar label="切り口" value={result.cutScore} max={25} /><ScoreBar label="効果" value={result.effectScore} max={15} /></div></div>
    <section className="result-question"><p className="question-meta"><span>{question.year}年度</span><span>事例 {question.case}</span><span>{question.questionNo}</span>{question.subQuestionNo && <span>{question.subQuestionNo}</span>}</p><QuestionDetails question={question} compact /></section>
    <Compare title="切り口" mine={inputCuts} expected={question.cuts} matched={result.matchedCuts.map((m) => m.expected)} /><Compare title="果キーワード" note="登録済みの一般的な果も正解です。未登録の妥当解は自己評価で補えます。" mine={inputKeywords} expected={question.fruitKeywords} matched={result.matchedKeywords.map((m) => m.expected)} />
    <section className="model-answer"><p className="eyebrow">MMC 模範解答</p><p>{question.modelAnswer}</p>{question.sourcePages && <small>出典：{question.sourcePages}{question.answerSource ? `（${question.answerSource}）` : ''}</small>}</section>
    <section className="rating"><h2>自分の手応え</h2><div className="rating-grid">{(['題意を外した', '領域は近い', '主な果が一部一致', '題意・主要果が一致'] as const).map((label, i) => <button key={label} className={rating === i ? 'active' : ''} onClick={() => setRating(i as 0 | 1 | 2 | 3)}><strong>{i}</strong><span>{label}</span></button>)}</div></section>
    <label className="review-toggle"><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /><RefreshCw /><span><strong>復習対象にする</strong><small>あとで「要復習」から取り組めます</small></span></label>
    <FeedbackPanel key={question.id} caseName={question.case} profile={profile} suggestions={suggestedTags(question)} score={result.totalScore} elapsedSeconds={elapsedSeconds} fruitMissing={!inputKeywords.some((value) => value !== 'わからない')} review={review} onComplete={onNext} nextLabel={index + 1 < queue.length ? '次の問題へ' : 'セッションを終了'} />
  </div>
}
function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) { return <div><span>{label}</span><i><b style={{ width: `${(value / max) * 100}%` }} /></i><strong>{value}/{max}</strong></div> }
function Compare({ title, note, mine, expected, matched }: { title: string; note?: string; mine: string[]; expected: string[]; matched: string[] }) { return <section className="compare"><h2>{title}</h2>{note && <p>{note}</p>}<div><p>あなたの回答</p><div className="tag-list static">{mine.length ? mine.map((v) => <span key={v}>{v}</span>) : <small>入力なし</small>}</div></div><div><p>登録済みの正解</p><div className="tag-list static expected">{expected.map((v) => <span key={v} className={matched.includes(v) ? 'match' : 'miss'}>{matched.includes(v) ? '✓ ' : '— '}{v}</span>)}</div></div></section> }

function HistoryPage({ questions, associations, results }: { questions: Question[]; associations: AssociationRecord[]; results: TrainingResult[] }) {
  const [caseFilter, setCaseFilter] = useState('all'); const [historyResults, setHistoryResults] = useState(results); useEffect(() => { void progressRepository.getResults().then(setHistoryResults) }, []); const questionMap = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
  const associationCaseMap = useMemo(() => new Map<string, string>(associations.flatMap((record) =>
    (['theme', 'fruit', 'cause', 'purpose'] as const).map((mode) => [`association-${record.id}-${mode}`, record.case] as const),
  )), [associations])
  const visible = historyResults.filter((result) => caseFilter === 'all' || result.abstraction?.case === caseFilter || questionMap.get(result.questionId)?.case === caseFilter || associationCaseMap.get(result.questionId) === caseFilter || result.legacyGroupId?.split('-')[1] === caseFilter)
  return <div className="page"><div className="page-heading"><p className="eyebrow">LEARNING LOG</p><h1>学習履歴</h1><p>{historyResults.length}回の答案思考を記録しています。</p></div><div className="chips compact"><Chip active={caseFilter === 'all'} onClick={() => setCaseFilter('all')}>すべて</Chip>{['I', 'II', 'III', 'IV'].map((c) => <Chip key={c} active={caseFilter === c} onClick={() => setCaseFilter(c)}>事例 {c}</Chip>)}</div>
    <div className="history-list">{visible.length ? visible.map((result) => { const q = questionMap.get(result.questionId); const legacy = result.isLegacy ? '（旧記録）' : ''; const associationLabel = result.trainingMode === 'theme' ? '題意トレ' : result.trainingMode === 'fruit' ? '果トレ' : result.trainingMode === 'cause' ? '因→果' : result.trainingMode === 'purpose' ? '目的→施策' : result.trainingMode === 'abstract-shelf' ? '題意 → 棚' : result.trainingMode === 'abstract-fruit' ? '題意 → 果候補' : ''; return <article key={result.id}><div className="history-date">{new Date(result.answeredAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}<small>{new Date(result.answeredAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</small></div><div><p>{associationLabel || (result.abstraction ? `事例${result.abstraction.case}・${result.abstraction.recordId}${legacy}` : q ? `${q.year} 事例${q.case} ${q.questionNo}${q.subQuestionNo ? ` ${q.subQuestionNo}` : ''}` : `${result.legacyGroupId ?? result.questionId}${legacy}`)}</p><strong>{result.abstraction?.abstractQuestion ?? result.promptLabel ?? q?.questionSummary ?? (result.isLegacy ? '分割前の学習記録' : '問題')}</strong><small>{isCorrect(result) ? '正解' : '不正解'}・{result.elapsedSeconds ?? '—'}秒・連続正解{result.streak ?? 0}回 {result.needsReview && '・要復習'}</small>{Boolean(result.struggleReasons?.length) && <small>{result.struggleReasons?.map((reason) => reason === 'slow' ? '時間がかかった' : reason === 'fruit-missing' ? '果が出なかった' : '題意で迷った').join('／')}</small>}{Boolean(result.weaknessTags?.length) && <small>{result.weaknessTags?.join('・')}</small>}</div><div className={isCorrect(result) ? 'history-score good' : 'history-score'}>{result.totalScore}<small>点</small></div></article> }) : <div className="empty-inline"><History /><p>条件に合う履歴はありません</p></div>}</div>
  </div>
}

function SettingsPage({ settings, setSettings, questionCount, onImported, onCleared }: { settings: AppSettings; setSettings: (s: AppSettings) => void; questionCount: number; onImported: () => Promise<void>; onCleared: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null); const materialFileRef = useRef<HTMLInputElement>(null); const update = (patch: Partial<AppSettings>) => { const next = { ...settings, ...patch }; setSettings(next); void progressRepository.saveSettings(next) }
  const download = async () => { const blob = await exportProgress(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `kahotore-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url) }
  const upload = async (file?: File) => { if (!file) return; try { await importProgress(file); await onImported(); alert('学習履歴を読み込みました') } catch (error) { alert(error instanceof Error ? error.message : '読み込みに失敗しました') } }
  const uploadMaterial = async (file?: File) => { if (!file) return; try { const count = await importPrivateQuestions(file); await onImported(); alert(`個人用MMC教材を${count}件読み込みました`) } catch (error) { alert(error instanceof Error ? error.message : '教材の読み込みに失敗しました') } finally { if (materialFileRef.current) materialFileRef.current.value = '' } }
  const clearMaterials = async () => { if (!confirm('端末に読み込んだ個人用MMC教材を削除しますか？学習履歴は残ります。')) return; const count = await removePrivateQuestions(); await onImported(); alert(`${count}件の個人用教材を削除しました`) }
  const clear = async () => { if (!confirm('すべての学習履歴と設定した弱点タグを削除しますか？この操作は元に戻せません。')) return; await progressRepository.clear(); await onCleared() }
  return <div className="page"><div className="page-heading"><p className="eyebrow">PREFERENCES</p><h1>設定</h1><p>自分の学習スタイルに合わせます。</p></div>
    <section className="settings-card"><h2>演習</h2><SettingRow icon={<Clock3 />} title="制限時間" desc="問題ごとに残り時間を表示"><Switch checked={settings.timerEnabled} onChange={(v) => update({ timerEnabled: v })} /></SettingRow>{settings.timerEnabled && <label className="number-setting"><span>制限時間（秒）</span><input type="number" min="30" max="1800" step="30" value={settings.timerSeconds} onChange={(e) => update({ timerSeconds: Number(e.target.value) })} /></label>}<SettingRow icon={<BrainCircuit />} title="同義語・一般化判定" desc="言い換えや一般的な果を一致判定"><Switch checked={settings.synonymsEnabled} onChange={(v) => update({ synonymsEnabled: v })} /></SettingRow><SettingRow icon={settings.darkMode ? <Moon /> : <Sun />} title="ダークモード" desc="暗い場所でも目にやさしく"><Switch checked={settings.darkMode} onChange={(v) => update({ darkMode: v })} /></SettingRow></section>
    <section className="settings-card"><h2>バックアップ</h2><button className="setting-button" onClick={() => void download()}><Download /><span><strong>履歴をエクスポート</strong><small>JSONファイルとして保存</small></span></button><button className="setting-button" onClick={() => fileRef.current?.click()}><Upload /><span><strong>履歴をインポート</strong><small>バックアップから復元・統合</small></span></button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(e) => void upload(e.target.files?.[0])} /></section>
    <section className="settings-card"><h2>個人用MMC教材</h2><p>OCR抽出した未確認データは一覧・辞典だけに追加され、確認するまで採点には使われません。</p><button className="setting-button" onClick={() => materialFileRef.current?.click()}><Upload /><span><strong>教材JSONを読み込む</strong><small>題意・切り口・果キーワード・模範解答をこの端末だけに保存</small></span></button><input ref={materialFileRef} hidden type="file" accept="application/json" onChange={(e) => void uploadMaterial(e.target.files?.[0])} /><button className="setting-button" onClick={() => void clearMaterials()}><RotateCcw /><span><strong>個人用教材を削除</strong><small>標準問題と学習履歴は残します</small></span></button></section>
    <button className="danger-button" onClick={() => void clear()}>全履歴を削除</button><p className="version">果トレ MVP v0.1.0 ・ 問題データ {questionCount}件</p>
  </div>
}
function SettingRow({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) { return <div className="setting-row"><span className="setting-icon">{icon}</span><span><strong>{title}</strong><small>{desc}</small></span>{children}</div> }
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) { return <button role="switch" aria-checked={checked} className={checked ? 'switch on' : 'switch'} onClick={() => onChange(!checked)}><i /></button> }

export default App
