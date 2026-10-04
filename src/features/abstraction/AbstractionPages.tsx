import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import type {
  AbstractionInput,
  AbstractionMode,
  AbstractionSession,
} from '../../domain/abstraction'
import {
  abstractionContent,
  abstractionContentErrors,
  abstractionIsReady,
} from '../../repositories/abstractionRepository'
import { progressRepository } from '../../repositories/progressRepository'
import { questionRepository } from '../../repositories/questionRepository'
import type { Question } from '../../domain/question'
import {
  AbstractionDiagnostics,
  AbstractionSourceDetails,
} from './AbstractionFeedback'
import { db } from '../../db/indexedDb'
import {
  nextTransferQueue,
  isAbstractionSlow,
  openedShelfGroups,
  practiceSummary,
  selectPracticeQueue,
  transferSummary,
} from './abstractionReview'
import { tagCatalog } from '../weakness/weaknessReview'
import {
  abandonAbstractionSession,
  commitAbstractionResult,
  loadAbstractionForResume,
  resumeAbstractionSession,
  lockAbstractionShelf,
  gradeAbstractionSession,
  markAbstractionShown,
  saveAbstractionDraft,
  startAbstractionSession,
  startTransferCheck,
} from './abstractionSessionRepository'

const split = (s: string) =>
  s
    .normalize('NFKC')
    .split(/[、,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
const labels = {
  excellent: '◎ 十分',
  good: '○ 概ね正解',
  partial: '△ 一部想起',
  miss: '× 棚・代表候補を確認しよう',
}
export function AbstractionSetupPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<AbstractionMode>(
    params.get('mode') === 'abstract-shelf'
      ? 'abstract-shelf'
      : 'abstract-fruit',
  )
  const [cases, setCases] = useState<string[]>(['I', 'II', 'III'])
  const [years, setYears] = useState('')
  const [selectedTags, setSelectedTags] = useState('')
  const [count, setCount] = useState(5)
  const [unanswered, setUnanswered] = useState(false)
  const [review, setReview] = useState(params.get('review') === '1')
  const [message, setMessage] = useState('')
  const [availableAt, setAvailableAt] = useState<string | null>(null)
  useEffect(() => {
    void db.abstractionSessions
      .toArray()
      .then((s) => setAvailableAt(nextTransferQueue(s).availableAt))
  }, [])
  const start = async (
    selectedMode: AbstractionMode = mode,
    onlyWeak = review,
  ) => {
    setBusy(true)
    try {
      const [results, profiles, questions] = await Promise.all([
        progressRepository.getResults(),
        progressRepository.getProfiles(),
        questionRepository.getAll(),
      ])
      const queue = selectPracticeQueue(
        selectedMode,
        {
          cases,
          years: split(years).map(Number).filter(Number.isFinite),
          tags: split(selectedTags),
          count,
          unanswered,
          review: onlyWeak,
        },
        results,
        profiles,
        questions,
      )
      if (!queue.length) {
        setMessage(
          onlyWeak
            ? 'この条件の復習対象はありません'
            : 'この条件の出題対象はありません',
        )
        return
      }
      await startAbstractionSession(
        selectedMode,
        queue.map((x) => x.record),
        'practice',
        queue,
      )
      nav('/abstraction/training', { state: { fresh: true } })
    } catch (e) {
      alert(e instanceof Error ? e.message : '開始できません')
    } finally {
      setBusy(false)
    }
  }
  const transfer = async () => {
    setBusy(true)
    try {
      await startTransferCheck()
      nav('/abstraction/training', { state: { fresh: true } })
    } catch (e) {
      alert(e instanceof Error ? e.message : '開始できません')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page abstraction-page">
      <div className="page-heading">
        <p className="eyebrow">BEFORE THE CASE</p>
        <h1>与件を読む前の練習</h1>
        <p>
          題意から検索する棚と代表候補を置きます。企業固有の答えは与件を読んで選びます。
        </p>
      </div>
      {!abstractionIsReady && (
        <div role="alert">
          新教材を読み込めません: {abstractionContentErrors.join('、')}
        </div>
      )}
      <section className="abstraction-card">
        <h2>練習を選ぶ</h2>
        <label>
          モード
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as AbstractionMode)}
          >
            <option value="abstract-fruit">題意 → 果候補</option>
            <option value="abstract-shelf">題意 → 棚</option>
          </select>
        </label>
        <fieldset>
          <legend>事例</legend>
          {['I', 'II', 'III'].map((c) => (
            <label key={c}>
              <input
                type="checkbox"
                checked={cases.includes(c)}
                onChange={(e) =>
                  setCases(
                    e.target.checked
                      ? [...cases, c]
                      : cases.filter((x) => x !== c),
                  )
                }
              />
              事例{c}
            </label>
          ))}
        </fieldset>
        <label>
          出典年度（読点で区切る・空欄は全年度）
          <input value={years} onChange={(e) => setYears(e.target.value)} />
        </label>
        <label>
          復習タグ（読点で区切る・いずれか一致）
          <input
            value={selectedTags}
            onChange={(e) => setSelectedTags(e.target.value)}
          />
        </label>
        <label>
          問題数
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}問
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={unanswered}
            onChange={(e) => setUnanswered(e.target.checked)}
          />
          未回答だけ
        </label>
        <label>
          <input
            type="checkbox"
            checked={review}
            onChange={(e) => setReview(e.target.checked)}
          />
          弱点復習
        </label>
        <button
          className="btn btn-primary"
          disabled={busy || !abstractionIsReady}
          onClick={() =>
            void (params.get('transfer') === '1' ? transfer() : start())
          }
        >
          {params.get('transfer') === '1'
            ? '未提示題意チェックを始める'
            : 'この条件で始める'}
        </button>
        {message && <p role="status">{message}</p>}
        <p>
          題意を見て棚を思い出す練習と、棚から果候補を出す練習を分けています。
        </p>
        <button
          className="btn btn-primary"
          disabled={busy || !abstractionIsReady}
          onClick={() => void start('abstract-shelf')}
        >
          題意 → 棚（
          {
            abstractionContent.records.filter((r) =>
              r.modes.includes('abstract-shelf'),
            ).length
          }
          題）
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !abstractionIsReady}
          onClick={() => void start('abstract-fruit')}
        >
          題意 → 果候補（
          {
            abstractionContent.records.filter((r) =>
              r.modes.includes('abstract-fruit'),
            ).length
          }
          題）
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy || !abstractionIsReady}
          onClick={() => void transfer()}
        >
          未提示の題意チェック（6題）
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy || !abstractionIsReady}
          onClick={() => void start('abstract-shelf', true)}
        >
          棚の弱点を復習
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy || !abstractionIsReady}
          onClick={() => void start('abstract-fruit', true)}
        >
          果候補の弱点を復習
        </button>
        <Link className="btn btn-ghost" to="/abstraction/records">
          弱点復習・記録を見る
        </Link>
        {availableAt && (
          <p>
            次の未提示題意チェックは
            {new Date(availableAt).toLocaleString('ja-JP', {
              timeZone: 'Asia/Tokyo',
            })}
            以降
          </p>
        )}
        <Link className="btn btn-ghost" to="/abstraction/library">
          棚と代表候補を見る
        </Link>
      </section>
      <p>
        <Link to="/materials">教材へ戻る</Link>
      </p>
    </div>
  )
}

export function AbstractionTrainingPage() {
  const nav = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState<AbstractionSession | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [manual, setManual] = useState<boolean | null>(null)
  const [rating, setRating] = useState<0 | 1 | 2 | 3>(2)
  const [reasons, setReasons] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [extra, setExtra] = useState('')
  const [needsReview, setNeedsReview] = useState(false)
  const [rawDraft, setRawDraft] = useState({
    shelves: '',
    frameworks: '',
    cuts: '',
    fruits: '',
  })
  const timing = useRef({ ms: 0, anchor: null as number | null })
  const operationLock = useRef(false)
  const [profileTags, setProfileTags] = useState<Map<string, string[]>>(
    new Map(),
  )
  const [sourceQuestions, setSourceQuestions] = useState<Question[]>([])
  useEffect(() => {
    const fresh = Boolean((location.state as { fresh?: boolean } | null)?.fresh)
    if (fresh)
      window.history.replaceState({ ...window.history.state, usr: null }, '')
    void Promise.all([
      loadAbstractionForResume(fresh),
      progressRepository.getProfiles(),
      questionRepository.getAll().catch(() => []),
    ])
      .then(([restored, profiles, questions]) => {
        setProfileTags(new Map(profiles.map((p) => [p.id, p.tags])))
        setSourceQuestions(questions)
        setSession(restored)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!session) return
    timing.current = { ms: session.activeElapsedMs, anchor: null }
    setElapsed(Math.floor(session.activeElapsedMs / 1000))
    setRawDraft(
      Object.fromEntries(
        Object.entries(session.draft).map(([k, v]) => [k, v.join('、')]),
      ) as typeof rawDraft,
    )
  }, [session?.id, session?.ordinal, session?.phase, session?.status])
  useEffect(() => {
    if (session?.phase !== 'graded' || !session.grading) return
    const g = session.grading
    setManual(g.grade === 'excellent' || g.grade === 'good')
    setRating(
      g.grade === 'excellent'
        ? 3
        : g.grade === 'good'
          ? 2
          : g.grade === 'partial'
            ? 1
            : 0,
    )
    const auto: string[] = []
    const record = session.queue[session.ordinal - 1]?.record
    if (
      record &&
      openedShelfGroups(record, g, session.mode).length <
        record.shelfGroups.length
    )
      auto.push('theme-uncertain')
    if (session.mode === 'abstract-fruit' && g.coreCredits < (g.target ?? 0))
      auto.push('fruit-missing')
    if (
      isAbstractionSlow(
        session.mode,
        session.activeElapsedMs,
        session.shelfElapsedMs,
        session.evaluationKind,
      )
    )
      auto.push('slow')
    setReasons(auto)
    setTags(
      record
        ? (profileTags.get(`abstraction:${record.id}:${session.mode}`) ??
            record.weaknessTags)
        : [],
    )
    setExtra('')
    setNeedsReview(false)
  }, [session?.id, session?.ordinal, session?.phase])
  useEffect(() => {
    if (
      !session ||
      saving ||
      !['answering', 'shelf-locked'].includes(session.phase) ||
      session.status !== 'active'
    )
      return
    const accrue = () => {
      const now = performance.now(),
        clock = timing.current
      if (clock.anchor !== null) clock.ms += Math.max(0, now - clock.anchor)
      clock.anchor = document.visibilityState === 'visible' ? now : null
      setElapsed(Math.floor(clock.ms / 1000))
    }
    timing.current.anchor =
      document.visibilityState === 'visible' ? performance.now() : null
    const persistTime = (pause = false) => {
      accrue()
      void saveAbstractionDraft(session.id, session.ordinal, session.phase, {
        activeElapsedMs: timing.current.ms,
        ...(pause ? { status: 'paused' as const } : {}),
      }).catch((e) => setError(String(e)))
    }
    const visibility = () => {
      accrue()
      if (document.visibilityState !== 'visible') persistTime()
    }
    const pageHide = () => {
      persistTime(true)
      timing.current.anchor = null
    }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', pageHide)
    const timer = window.setInterval(() => {
      accrue()
    }, 1000)
    return () => {
      accrue()
      timing.current.anchor = null
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', pageHide)
    }
  }, [session?.id, session?.ordinal, session?.phase, session?.status, saving])
  useEffect(() => {
    if (!session) return
    return () => {
      void saveAbstractionDraft(session.id, session.ordinal, session.phase, {
        activeElapsedMs: timing.current.ms,
        status: 'paused',
      }).catch(() => {})
    }
  }, [session?.id, session?.ordinal, session?.phase])
  const snap = session?.queue[session.ordinal - 1]
  const data = snap?.record
  if (loading) return <div className="page">出題を準備しています…</div>
  if (!session)
    return (
      <div className="page abstraction-page">
        <h1>出題条件から始めてください</h1>
        <Link className="btn btn-primary" to="/abstraction">
          練習を選ぶ
        </Link>
      </div>
    )
  if (session.status === 'paused' && session.phase !== 'graded')
    return (
      <div className="page abstraction-page">
        <h1>中断した練習があります</h1>
        <p>同じ問題と入力内容から再開できます。</p>
        <button
          className="btn btn-primary"
          onClick={() =>
            void resumeAbstractionSession(session.id, session.ordinal)
              .then(setSession)
              .catch((e) => setError(String(e)))
          }
        >
          続きから
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            void abandonAbstractionSession(session.id).then(() => {
              setSession(null)
              nav('/abstraction')
            })
          }}
        >
          記録せず終了
        </button>
      </div>
    )
  if (
    !snap ||
    !data ||
    session.status === 'completed' ||
    session.status === 'abandoned'
  )
    return (
      <div className="page abstraction-page">
        <h1>このセットは終了しました</h1>
        <Link to="/abstraction/records">記録を見る</Link>
      </div>
    )
  const saveDraft = (
    key: 'shelves' | 'frameworks' | 'cuts' | 'fruits',
    value: string,
  ) => {
    setRawDraft((old) => ({ ...old, [key]: value }))
    const draft = { ...session.draft, [key]: split(value) }
    const next = { ...session, draft }
    setSession(next)
    void saveAbstractionDraft(session.id, session.ordinal, session.phase, {
      draft,
    })
      .then((stored) => {
        if (
          stored.ordinal !== session.ordinal ||
          stored.phase !== session.phase ||
          stored.status !== 'active'
        )
          setSession(stored)
      })
      .catch((e) => setError(String(e)))
  }
  const input: AbstractionInput = {
    mode: session.mode,
    ...(Object.fromEntries(
      Object.entries(rawDraft).map(([k, v]) => [k, split(v)]),
    ) as AbstractionSession['draft']),
  }
  const freezeTime = () => {
    const clock = timing.current
    if (clock.anchor !== null)
      clock.ms += Math.max(0, performance.now() - clock.anchor)
    clock.anchor = null
    return clock.ms
  }
  const grade = async (e: FormEvent) => {
    e.preventDefault()
    if (
      Object.values(input)
        .filter(Array.isArray)
        .some((values) => values.some((x) => [...x].length > 80)) ||
      Object.values(input)
        .filter(Array.isArray)
        .reduce((n, v) => n + v.length, 0) > 12
    ) {
      setError('各タグ80文字以内、全欄合計12タグまで入力してください')
      return
    }
    if (operationLock.current) return
    operationLock.current = true
    const ms = freezeTime()
    setSaving(true)
    try {
      const s = await gradeAbstractionSession(
        session.id,
        session.ordinal,
        session.phase,
        input,
        ms,
        session.evaluationKind === 'transfer' ? session.shelfElapsedMs : null,
      )
      setSession(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : '採点できません')
    } finally {
      operationLock.current = false
      setSaving(false)
    }
  }
  const advance = async (e: FormEvent) => {
    e.preventDefault()
    if (
      session.evaluationKind !== 'transfer' ||
      session.phase !== 'answering'
    ) {
      await grade(e)
      return
    }
    if (!input.shelves.length) {
      setError('棚を1つ以上入力するか「わからない」を選んでください')
      return
    }
    await lockShelf(input.shelves)
  }
  const lockShelf = async (shelves: string[]) => {
    if (operationLock.current) return
    if (shelves.length > 12 || shelves.some((x) => [...x].length > 80)) {
      setError('各タグ80文字以内、全欄合計12タグまで入力してください')
      return
    }
    operationLock.current = true
    const ms = freezeTime()
    setSaving(true)
    try {
      setSession(
        await lockAbstractionShelf(session.id, session.ordinal, shelves, ms),
      )
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '保存できませんでした。再試行してください',
      )
    } finally {
      operationLock.current = false
      setSaving(false)
    }
  }
  const persist = async () => {
    if (operationLock.current) return
    operationLock.current = true
    setSaving(true)
    try {
      const next = await commitAbstractionResult(session.id, session.ordinal, {
        correct:
          manual ??
          (session.grading!.grade === 'excellent' ||
            session.grading!.grade === 'good'),
        selfRating: rating,
        needsReview,
        struggleReasons: reasons as (
          'slow' | 'fruit-missing' | 'theme-uncertain'
        )[],
        weaknessTags: [...new Set([...tags, ...split(extra)])],
      })
      const shown =
        next.status === 'active'
          ? await markAbstractionShown(next.id, next.ordinal)
          : next
      setSession(shown)
      setManual(null)
      setReasons([])
      setTags([])
      setElapsed(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした')
    } finally {
      operationLock.current = false
      setSaving(false)
    }
  }
  const g = session.grading
  return (
    <div className="page abstraction-page">
      <header className="abstraction-meta">
        <Link to="/abstraction">← 戻る</Link>
        <span>
          {session.ordinal}/{session.queue.length}問
        </span>
        <span>
          有効 {elapsed || Math.floor(session.activeElapsedMs / 1000)}秒
        </span>
      </header>
      <p className="eyebrow">与件を読む前の候補想起</p>
      <h1>{snap.text}</h1>
      <p>ここでは最終答案を確定しません。</p>
      {!session.synonymsEnabled && <p>登録語のみで判定</p>}
      {session.phase !== 'graded' ? (
        <form
          onSubmit={advance}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.nativeEvent.isComposing)
              e.preventDefault()
          }}
        >
          <label>
            棚（任意）
            <textarea
              rows={2}
              value={rawDraft.shelves}
              onChange={(e) => saveDraft('shelves', e.target.value)}
              readOnly={session.phase === 'shelf-locked'}
              placeholder="例：情報活用、関係性マーケティング"
            />
          </label>
          {session.mode === 'abstract-shelf' && (
            <details>
              <summary>補助入力（任意）</summary>
              <label>
                フレームワーク
                <input
                  value={rawDraft.frameworks}
                  onChange={(e) => saveDraft('frameworks', e.target.value)}
                />
              </label>
              <label>
                切り口
                <textarea
                  rows={2}
                  value={rawDraft.cuts}
                  onChange={(e) => saveDraft('cuts', e.target.value)}
                />
              </label>
            </details>
          )}
          {session.mode === 'abstract-fruit' &&
            (session.evaluationKind !== 'transfer' ||
              session.phase === 'shelf-locked') && (
              <>
                <label>
                  代表的な候補を{data.candidateTarget ?? 3}
                  つ（全部ではなくてOK）
                  <textarea
                    rows={3}
                    value={rawDraft.fruits}
                    onChange={(e) => saveDraft('fruits', e.target.value)}
                    placeholder="候補を読点、comma、semicolon、改行で区切る"
                  />
                </label>
                <small>1タグ80文字まで・合計12タグまで</small>
              </>
            )}
          <button className="btn btn-primary" disabled={saving}>
            {session.evaluationKind === 'transfer' &&
            session.phase === 'answering'
              ? '棚を確定して果へ'
              : '答え合わせ'}
          </button>
          {session.evaluationKind === 'transfer' &&
            session.phase === 'answering' && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => void lockShelf([])}
              >
                わからない
              </button>
            )}
        </form>
      ) : (
        <section className="abstraction-result">
          <h2>{labels[g?.grade ?? 'miss']}</h2>
          <p>自動判定 {g?.score}点（時間で内容評価は変わりません）</p>
          {g && (
            <AbstractionDiagnostics
              record={data}
              catalogs={snap.catalogs}
              grading={g}
              synonymsEnabled={session.synonymsEnabled}
            />
          )}
          <section>
            <h3>開く棚</h3>
            {data.shelfGroups.map((x) => (
              <p key={x.id}>
                {x.categoryIds
                  .map(
                    (id) =>
                      snap.catalogs.categories.find((c) => c.id === id)?.label,
                  )
                  .join('・')}{' '}
                {g?.shelfGroupHits.includes(x.id) ? '✓' : '—'}
              </p>
            ))}
            {g && g.inferredCategoryIds.length > 0 && (
              <p>
                果から推定:{' '}
                {g.inferredCategoryIds
                  .map(
                    (id) =>
                      snap.catalogs.categories.find((c) => c.id === id)?.label,
                  )
                  .join('・')}
              </p>
            )}
          </section>
          <section>
            <h3>想起できた代表候補</h3>
            {g?.matchedCore.length ? (
              g.matchedCore.map((x) => (
                <p key={x.coreId}>
                  {x.actual} →{' '}
                  {snap.catalogs.concepts.find((c) => c.id === x.coreId)?.label}
                  （
                  {x.via === 'label'
                    ? '登録語'
                    : x.via === 'synonym'
                      ? '同義語'
                      : x.via === 'rule'
                        ? '表現ルール'
                        : '許容代替'}
                  ）
                </p>
              ))
            ) : (
              <p>一致なし</p>
            )}
          </section>
          <section>
            <h3>
              {g && g.coreCredits >= (g.target ?? Infinity)
                ? '追加で使える候補'
                : '次に優先して思い出す候補'}
            </h3>
            <p>
              {g?.missingCoreIds
                .map(
                  (id) =>
                    snap.catalogs.concepts.find((c) => c.id === id)?.label,
                )
                .join('・') || '目標に到達'}
            </p>
          </section>
          <details>
            <summary>与件で選ぶ具体例（今回の必須想起対象ではない）</summary>
            <p>出さなくても評価は下がりません。</p>
            {data.contextDependentKeywords.map((x) => (
              <p key={x.label}>
                {x.label}：{x.reason}
              </p>
            ))}
          </details>
          {g?.unmatchedInputs.map((x) => (
            <p key={x}>「{x}」は未登録のため未照合</p>
          ))}
          {g?.offShelfInputs.map((x) => (
            <p key={x}>「{x}」は今回とは別の棚です</p>
          ))}
          <section className="rating">
            <h3>自分の手応え</h3>
            {([0, 1, 2, 3] as const).map((n) => (
              <button
                key={n}
                className={rating === n ? 'active' : ''}
                onClick={() => setRating(n)}
              >
                {n}
              </button>
            ))}
          </section>
          <label>
            <input
              type="checkbox"
              checked={
                manual ?? (g?.grade === 'excellent' || g?.grade === 'good')
              }
              onChange={(e) => setManual(e.target.checked)}
            />{' '}
            自分では正解とする
          </label>
          <p>苦戦理由</p>
          {(['slow', 'fruit-missing', 'theme-uncertain'] as const).map((x) => (
            <label key={x}>
              <input
                type="checkbox"
                checked={reasons.includes(x)}
                onChange={(e) =>
                  setReasons(
                    e.target.checked
                      ? [...reasons, x]
                      : reasons.filter((y) => y !== x),
                  )
                }
              />
              {x === 'slow'
                ? '時間がかかった'
                : x === 'fruit-missing'
                  ? '果候補が不足'
                  : '棚で迷った'}
            </label>
          ))}
          <p>復習タグ</p>
          {(tagCatalog[data.case] ?? [])
            .filter((x) => data.weaknessTags.includes(x))
            .map((x) => (
              <label key={x}>
                <input
                  type="checkbox"
                  checked={tags.includes(x)}
                  onChange={(e) =>
                    setTags(
                      e.target.checked
                        ? [...tags, x]
                        : tags.filter((y) => y !== x),
                    )
                  }
                />
                {x}
              </label>
            ))}
          <label>
            自由タグ
            <input value={extra} onChange={(e) => setExtra(e.target.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={needsReview}
              onChange={(e) => setNeedsReview(e.target.checked)}
            />
            復習に指定する
          </label>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void persist()}
          >
            {saving
              ? '保存中…'
              : session.ordinal < session.queue.length
                ? '保存して次へ'
                : '保存して終了'}
          </button>
          <AbstractionSourceDetails record={data} questions={sourceQuestions} />
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        <Link to="/abstraction/records">記録</Link>
      </p>
    </div>
  )
}

export function AbstractionRecordsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof dbRows>>>([])
  const [sessions, setSessions] = useState<AbstractionSession[]>([])
  useEffect(() => {
    void dbRows().then(setRows)
    void db.abstractionSessions.toArray().then(setSessions)
  }, [])
  const normal = rows.filter(
    (x) => x.abstraction?.evaluationKind === 'practice',
  )
  const transfers = transferSummary(rows, sessions)
  const percent = (n: number | null) =>
    n === null ? '—' : `${Math.round(n * 100)}%`
  const seconds = (n: number | null) =>
    n === null ? '—' : `${(n / 1000).toFixed(1)}秒`
  return (
    <div className="page abstraction-page">
      <Link to="/abstraction">← 練習へ</Link>
      <h1>抽象題意の記録</h1>
      <p>
        {normal.length}
        件の通常練習を保存しています。題意の正解率は未提示題意の転移効果を保証しません。
      </p>
      {(['abstract-shelf', 'abstract-fruit'] as const).map((mode) => {
        const summary = practiceSummary(
          normal.filter((r) => r.trainingMode === mode),
          sessions,
        )
        return (
          <article key={mode}>
            <h2>{mode === 'abstract-shelf' ? '題意 → 棚' : '題意 → 果候補'}</h2>
            <p>
              {summary.count}回答・棚group hit率 {percent(summary.shelfHitRate)}
              ・○以上率 {percent(summary.goodRate)}
            </p>
            {mode === 'abstract-fruit' && (
              <p>候補target到達率 {percent(summary.targetRate)}</p>
            )}
            <p>
              slow率 {percent(summary.slowRate)}・有効時間中央値{' '}
              {seconds(summary.totalMedianMs)}
            </p>
          </article>
        )
      })}
      <section>
        <h2>アプリ内で初めて提示した題意表現</h2>
        <p>
          6問の完了したチェックを比較します。自己上書きがあるチェックや未完了のチェックは成果比較から除外します。
        </p>
        {transfers.map((s, i) => (
          <article key={s.id}>
            <h3>
              チェック{i + 1}（{s.count}/6問）
            </h3>
            <p>
              {s.eligible
                ? s.targetMet
                  ? '今回の候補想起目標に到達'
                  : '今回の候補想起目標は未達'
                : '成果比較の対象外'}
            </p>
            <p>
              全明示棚成功率 {percent(s.shelfHitRate)}・○以上率{' '}
              {percent(s.goodRate)}・target到達率 {percent(s.targetRate)}
            </p>
            <p>
              棚時間中央値 {seconds(s.shelfMedianMs)}・B総時間中央値{' '}
              {seconds(s.totalMedianMs)}
            </p>
          </article>
        ))}
        {(() => {
          const eligible = transfers.filter((s) => s.eligible)
          if (eligible.length < 2)
            return <p>比較には条件を満たすチェックが2回必要です。</p>
          const [a, b] = eligible.slice(-2),
            diff = (x: number | null, y: number | null) =>
              x === null || y === null
                ? '—'
                : `${((y - x) * 100).toFixed(1)}ポイント`
          return (
            <p>
              前回との差：全明示棚成功率 {diff(a.shelfHitRate, b.shelfHitRate)}
              ・○以上率 {diff(a.goodRate, b.goodRate)}・target到達率{' '}
              {diff(a.targetRate, b.targetRate)}・棚中央値差{' '}
              {seconds(
                a.shelfMedianMs === null || b.shelfMedianMs === null
                  ? null
                  : b.shelfMedianMs - a.shelfMedianMs,
              )}
              ・B総中央値差{' '}
              {seconds(
                a.totalMedianMs === null || b.totalMedianMs === null
                  ? null
                  : b.totalMedianMs - a.totalMedianMs,
              )}
              。少数の練習内比較で、本試験の未知設問への効果を保証するものではありません。
            </p>
          )
        })()}
      </section>
      {rows.map((x) => (
        <article key={x.id}>
          <strong>{x.abstraction?.abstractQuestion ?? x.promptLabel}</strong>
          <span>
            {' '}
            {x.abstraction?.autoGrade}・自己評価{x.selfRating}・
            {x.elapsedSeconds ?? 0}秒
          </span>
        </article>
      ))}
    </div>
  )
}
async function dbRows() {
  return progressRepository
    .getResults()
    .then((x) =>
      x.filter(
        (y) =>
          y.trainingMode === 'abstract-shelf' ||
          y.trainingMode === 'abstract-fruit',
      ),
    )
}
export function AbstractionLibraryPage() {
  return (
    <div className="page abstraction-page">
      <Link to="/abstraction">← 練習へ</Link>
      <h1>棚と代表候補</h1>
      <p>transfer用の別表現は教材一覧に表示しません。</p>
      {abstractionContent.records.map((r) => (
        <article key={r.id}>
          <h2>{r.abstractQuestion}</h2>
          <p>
            棚:{' '}
            {r.fruitCategories
              .map(
                (id) =>
                  abstractionContent.categories.find((c) => c.id === id)?.label,
              )
              .join('・')}
          </p>
          {r.coreFruitKeywords.length > 0 && (
            <p>
              代表:{' '}
              {r.coreFruitKeywords
                .map(
                  (id) =>
                    abstractionContent.concepts.find((c) => c.id === id)?.label,
                )
                .join('・')}
            </p>
          )}
          {r.acceptableFruitKeywords.length > 0 && (
            <p>
              許容:{' '}
              {r.acceptableFruitKeywords
                .map(
                  (x) =>
                    abstractionContent.concepts.find(
                      (c) => c.id === x.conceptId,
                    )?.label,
                )
                .join('・')}
            </p>
          )}
          {r.contextDependentKeywords.length > 0 && (
            <p>
              与件で選ぶ:{' '}
              {r.contextDependentKeywords.map((x) => x.label).join('・')}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
