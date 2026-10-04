import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { db } from '../../db/indexedDb'
import type { Grade, Session } from './domain'
import { intentLabels } from './domain'
import { addDays, exactMatch, localDate, phase, stable } from './engine'
import { rollingFruitStamps } from './gamification'
import {
  confirm,
  content,
  finishSession,
  getData,
  saveSession,
  startSession,
  updatePlan,
} from './repository'

function useData() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getData>> | null>(
    null,
  )
  const [error, setError] = useState('')
  useEffect(() => {
    void getData()
      .then(setData)
      .catch(() => setError('端末の記録を読み込めなかった。再読み込みしてね'))
  }, [])
  return { data, error }
}
const status = (
  state: Awaited<ReturnType<typeof getData>>['states'][string] | undefined,
) =>
  !state?.firstConfirmedAt
    ? '未確認'
    : stable(state)
      ? '安定'
      : state.lastGrade === 'miss' || state.lastGrade === 'hesitant'
        ? '要再確認'
        : '確認中'
function Progress({
  data,
}: {
  data: NonNullable<ReturnType<typeof useData>['data']>
}) {
  const required = content.concepts.filter((c) => c.mandatory),
    states = required.map((c) => data.states[c.mandatoryMappingId!])
  return (
    <section className="micro-panel">
      <h2>必須{required.length}項目</h2>
      <p>
        初回確認 {states.filter((s) => s?.firstConfirmedAt).length}/
        {required.length} 安定 {states.filter(stable).length}/{required.length}
      </p>
      <div className="micro-statuses">
        {['未確認', '要再確認', '確認中', '安定'].map((label) => (
          <span key={label}>
            {label} {states.filter((s) => status(s) === label).length}
          </span>
        ))}
      </div>
      {data.plan.previousMandatoryCount !== undefined && (
        <p role="status">
          必須が{data.plan.previousMandatoryCount}→{required.length}
          項目に変わった。これまでの記録は保持している。
        </p>
      )}
    </section>
  )
}
export function MicroHome() {
  const { data, error } = useData(),
    navigate = useNavigate()
  const [today, setToday] = useState(() => localDate())
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('')
  useEffect(() => {
    const nextMidnight =
      new Date(`${addDays(localDate(), 1)}T00:00:00+09:00`).getTime() + 25
    const refreshToday = () => setToday(localDate())
    const timer = window.setTimeout(
      refreshToday,
      Math.max(0, nextMidnight - Date.now()),
    )
    const refreshWhenVisible = () => {
      if (!document.hidden) refreshToday()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [today])
  const begin = async (coverage = false) => {
    setBusy(true)
    try {
      const s = await startSession(coverage)
      navigate('/micro/session', {
        state:
          s.status === 'active'
            ? { newSessionId: s.id, navigationOrigin: performance.timeOrigin }
            : null,
      })
    } catch {
      setFailure('保存できなかった。再試行してね')
      setBusy(false)
    }
  }
  const unconfirmed = data
    ? content.concepts.filter(
        (c) =>
          c.mandatory && !data.states[c.mandatoryMappingId!]?.firstConfirmedAt,
      ).length
    : 0
  const stamps = data ? rollingFruitStamps(data.attempts, today) : [],
    due = data
      ? Object.values(data.states).filter(
          (s) => s.dueAt && s.dueAt <= new Date().toISOString(),
        ).length
      : 0
  return (
    <div className="page micro-page">
      <section className="micro-hero">
        <p className="eyebrow">1分 × 好きなセット数</p>
        <h1>
          題意と因から、
          <br />
          果を思い出す
        </h1>
        <p>頭の中で答えて、確認。1問で終わっても大丈夫。</p>
        <button
          className="btn btn-primary micro-start"
          disabled={busy || !data}
          onClick={() => void begin()}
        >
          {data?.session ? '続きから開く' : '1分はじめる'}
        </button>
      </section>
      {data && (
        <section className="micro-panel fruit-stamps" aria-labelledby="fruit-stamps-title">
          <p className="eyebrow">果スタンプ</p>
          <h2 id="fruit-stamps-title">
            直近7日 {stamps.filter((day) => day.earned).length}/7日
          </h2>
          <ol aria-label="直近7日の果スタンプ">
            {stamps.map((day) => {
              const isToday = day.date === today
              const label = new Intl.DateTimeFormat('ja-JP', {
                timeZone: 'Asia/Tokyo',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }).format(new Date(`${day.date}T00:00:00+09:00`))
              const dayStatus = day.earned ? '果を獲得' : '未獲得'
              return (
                <li
                  key={day.date}
                  aria-label={`${label}、${dayStatus}${isToday ? '、今日' : ''}`}
                  className={day.earned ? 'earned' : ''}
                >
                  <span aria-hidden="true">{day.earned ? '果' : '・'}</span>
                  <time dateTime={day.date} aria-hidden="true">
                    {new Intl.DateTimeFormat('ja-JP', {
                      timeZone: 'Asia/Tokyo',
                      month: 'numeric',
                      day: 'numeric',
                    }).format(new Date(`${day.date}T00:00:00+09:00`))}
                  </time>
                </li>
              )
            })}
          </ol>
          <p role="status">
            {stamps[6].earned ? '今日の果を獲得' : '1問確認すると今日の果がつく'}
          </p>
        </section>
      )}
      <section className="micro-panel abstraction-entry">
        <p className="eyebrow">新しい練習</p><h2>与件を読む前の練習</h2>
        <p>題意から検索する棚と代表候補を置く。</p>
        <NavLink className="btn btn-ghost" to="/abstraction">題意 → 棚／果候補</NavLink>
      </section>
      {(error || failure) && <p role="alert">{error || failure}</p>}
      {data && (
        <>
          <Progress data={data} />
          <section className="micro-panel">
            <p>今日の要再確認：{due}項目</p>
            <p>
              {data.plan.examDate
                ? `試験日 ${data.plan.examDate}`
                : '試験日未設定の21日プラン'}{' '}
              ／{' '}
              {phase(data.plan, today).days <= 0
                ? '維持モード'
                : `第${phase(data.plan, today).period}期`}
            </p>
            <p>通常開始の新規：1日{phase(data.plan, today).newLimit}項目まで</p>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void begin(true)}
            >
              未確認から1セット
            </button>
            <p>
              未確認{unconfirmed}項目。初回確認だけなら最低
              {Math.ceil(unconfirmed / 2)}
              セット、復習は別。1問で終わる場合もある。
            </p>
            <NavLink to="/materials">教材を見る</NavLink>
          </section>
        </>
      )}
    </div>
  )
}

export function MicroSessionPage() {
  const navigate = useNavigate()
  const route = useLocation()
  const freshId = useRef(
    (route.state as { navigationOrigin?: number } | null)?.navigationOrigin ===
      performance.timeOrigin
      ? (route.state as { newSessionId?: string } | null)?.newSessionId
      : undefined,
  )
  const [session, setSession] = useState<Session | null>(null),
    [inputMode, setInputMode] = useState('mental')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [text, setText] = useState('')
  const [data, setData] = useState<Awaited<ReturnType<typeof getData>> | null>(
    null,
  )
  const live = useRef<Session | null>(null),
    running = useRef<number | null>(null),
    locked = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const adopt = (s: Session) => {
    live.current = s
    setSession(s)
    setText(s.input.join('、'))
    setInputMode(s.inputMode)
    running.current =
      s.status === 'active' && !document.hidden ? performance.now() : null
    window.dispatchEvent(new Event('kahotore-session-changed'))
  }
  const tick = () => {
    const s = live.current
    if (!s || s.status !== 'active' || running.current === null) return s
    const now = performance.now(),
      next = { ...s, activeMs: s.activeMs + Math.max(0, now - running.current) }
    running.current = now
    live.current = next
    return next
  }
  useEffect(() => {
    let disposed = false
    void getData()
      .then((d) => {
        if (disposed) return
        setData(d)
        setInputMode(d.session?.inputMode ?? d.plan.inputMode)
        // Every restoration asks before resuming; time away is never accumulated.
        const s = d.session
        if (s) {
          const restored = {
            ...s,
            status:
              freshId.current === s.id && s.activeMs === 0 && !s.revealed
                ? ('active' as const)
                : ('paused' as const),
          }
          live.current = restored
          setSession(restored)
          setText(s.input.join('、'))
          setInputMode(s.inputMode)
          running.current =
            restored.status === 'active' && !document.hidden
              ? performance.now()
              : null
        } else
          void db.microSessions.toArray().then((all) => {
            if (!disposed) {
              const last = all.sort((a, b) =>
                b.startedAt.localeCompare(a.startedAt),
              )[0]
              if (last) {
                live.current = last
                setSession(last)
              }
            }
          })
      })
      .catch(() =>
        setError('保存したセットを読み込めなかった。再読み込みしてね'),
      )
    const interval = window.setInterval(() => {
      const next = tick()
      if (next) setSession(next)
    }, 250)
    const pause = () => {
      const s = tick()
      if (s?.status === 'active') {
        const paused = { ...s, status: 'paused' as const }
        running.current = null
        live.current = paused
        setSession(paused)
        void saveSession(paused)
          .then((saved) => {
            if (!disposed && live.current?.status === 'paused') {
              live.current = saved
              setSession(saved)
            }
          })
          .catch(() => {
            if (!disposed) setError('保存できなかった。再試行してね')
          })
      }
    }
    const visibility = () => {
      if (document.hidden) pause()
    }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', pause)
    return () => {
      disposed = true
      clearInterval(interval)
      pause()
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', pause)
    }
  }, [])
  useEffect(() => {
    heading.current?.focus()
  }, [session?.ordinal, session?.revealed, session?.status])
  const action = async (work: (s: Session) => Promise<Session>) => {
    if (locked.current || !live.current) return
    locked.current = true
    setBusy(true)
    setError('')
    const s = tick() ?? live.current
    running.current = null
    try {
      adopt(
        await work({
          ...s,
          input: text.split(/[、,;\n]/).filter((v) => v.trim()),
        }),
      )
      setData(await getData())
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.includes('タブ')
          ? cause.message
          : '保存できなかった。再試行してね',
      )
      running.current =
        live.current?.status === 'active' ? performance.now() : null
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  if (!session)
    return (
      <div className="page micro-page">
        <h1>セットを準備中</h1>
        {error && <p role="alert">{error}</p>}
        <NavLink to="/">今日へ</NavLink>
      </div>
    )
  const snap = session.cardSnapshot
  if (session.status === 'completed' || session.status === 'abandoned') {
    const answers =
      data?.attempts.filter((a) => a.sessionId === session.id) ?? []
    return (
      <div className="page micro-page">
        <h1 tabIndex={-1} ref={heading}>
          ここまででOK
        </h1>
        <p role="status">
          確認{answers.length}問 ／ 迷った
          {answers.filter((a) => a.grade === 'hesitant').length}問 ／ 出なかった
          {answers.filter((a) => a.grade === 'miss').length}問
        </p>
        {!answers.length && (
          <p>
            今日の予定は確認できた、または未回答で終了した。待機中の果は日を空けて確認しよう。
          </p>
        )}
        {data && <Progress data={data} />}
        <div className="micro-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                try {
                  const next = await startSession()
                  adopt(next)
                  setData(await getData())
                } catch {
                  setError('保存できなかった。再試行してね')
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            もう1セット
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            今日はここまで
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <NavLink to="/materials">教材と既存の練習</NavLink>
      </div>
    )
  }
  if (session.status === 'paused')
    return (
      <div className="page micro-page">
        <h1 tabIndex={-1} ref={heading}>
          続きからできる
        </h1>
        <p>同じ問題と解答の表示状態を保存した。離れていた時間は含めない。</p>
        <div className="micro-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void action((s) => saveSession({ ...s, status: 'active' }))
            }
          >
            続きから
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void action(finishSession)}
          >
            このセットを終了
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    )
  if (!snap) return null
  const matched = exactMatch(snap.mapping, session.input)
  const grade = (g: Grade) => void action((s) => confirm(s, g))
  return (
    <div className="page micro-page">
      <div className="micro-session-meta">
        <span>{session.ordinal}/2問</span>
        <span aria-label="有効経過時間">
          {Math.floor(session.activeMs / 1000)}秒 / 目安60秒
        </span>
      </div>
      {session.activeMs >= 60000 && (
        <p role="status">ここまででもOK。時間超過は誤答にならない。</p>
      )}
      <section className="micro-panel">
        <p className="eyebrow">
          事例{snap.mapping.case} ／ {intentLabels[snap.mapping.intent]} ／{' '}
          {snap.mapping.expectedCount}つ
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {session.revealed ? '今回確認する果' : '果を思い出そう'}
        </h1>
        <p className="micro-prompt">{snap.cue.prompt}</p>
        <small>練習用の因・目的条件（設計者作成）</small>
        {session.hintUsed && <p>ヒント：{snap.cue.hintChoices.join(' ／ ')}</p>}
        {!session.revealed ? (
          <>
            <p>頭の中、または小声で答えてね。</p>
            {inputMode === 'typed' && (
              <label className="micro-input">
                任意入力（複数要素は「、」で区切る）
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    if (live.current)
                      live.current = {
                        ...live.current,
                        input: e.target.value
                          .split(/[、,;\n]/)
                          .filter((v) => v.trim()),
                      }
                  }}
                />
              </label>
            )}
            <div className="micro-actions">
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  void action((s) =>
                    saveSession({
                      ...s,
                      revealed: true,
                      activeRevealMs: Math.max(0, s.activeMs - s.cardStartedMs),
                    }),
                  )
                }
              >
                答えを確認
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy || session.hintUsed}
                onClick={() =>
                  void action((s) => saveSession({ ...s, hintUsed: true }))
                }
              >
                ヒント（2択）
              </button>
            </div>
          </>
        ) : (
          <div aria-live="polite">
            <p className="micro-answer">
              {snap.mapping.answerSlots.map((s) => s.accepted[0]).join('・')}
            </p>
            <p>
              許容する言い換え：
              {snap.mapping.answerSlots
                .map((s) => s.accepted.join('／'))
                .join('・')}
            </p>
            <p>{snap.mapping.explanation}</p>
            {snap.card.kind === 'contrast' && (
              <p>
                「{snap.card.distractor}」との違い：
                {snap.card.contrastExplanation}
              </p>
            )}
            {inputMode === 'typed' && (
              <>
                <p>
                  {matched
                    ? 'カードの許容語と完全一致'
                    : 'カードの許容語と未一致（答案の誤りとは断定しない）'}
                </p>
                {!matched && (
                  <label>
                    <input
                      type="checkbox"
                      checked={session.override}
                      onChange={(e) => {
                        const next = { ...session, override: e.target.checked }
                        live.current = next
                        setSession(next)
                      }}
                    />{' '}
                    別解として自己確認（必須果の自力想起成功には加算しない）
                  </label>
                )}
              </>
            )}
            <p>今回の想起を1回だけ記録</p>
            <div className="micro-grades">
              <button
                className="btn btn-primary"
                disabled={
                  busy ||
                  session.hintUsed ||
                  session.override ||
                  (inputMode === 'typed' &&
                    session.input.length > 0 &&
                    !matched)
                }
                onClick={() => grade('fast')}
              >
                すぐ出た
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => grade('hesitant')}
              >
                迷った・一部
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => grade('miss')}
              >
                出なかった
              </button>
            </div>
            <details>
              <summary>詳しく・出典</summary>
              <p>{content.metadata.note}</p>
              <p>元語の根拠：{snap.mapping.source.refs.join('、')}</p>
              <NavLink to="/overview">既存の問題を見る</NavLink>
            </details>
          </div>
        )}
      </section>
      {error && <p role="alert">{error}</p>}
      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => void action(finishSession)}
      >
        ここで終わる
      </button>
    </div>
  )
}

export function MicroMaterials() {
  const { data, error } = useData(),
    navigate = useNavigate()
  const [search, setSearch] = useState(''),
    [caseFilter, setCaseFilter] = useState(''),
    [intent, setIntent] = useState(''),
    [collection, setCollection] = useState('mandatory')
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const mappings = content.mappings.filter(
    (m) =>
      (!caseFilter || m.case === caseFilter) &&
      (!intent || m.intent === intent),
  )
  const concepts = content.concepts.filter(
    (c) =>
      mappings.some((m) => m.conceptIds.includes(c.id)) &&
      (collection !== 'mandatory' || c.mandatory) &&
      (collection !== 'stock' ||
        c.priority ||
        mappings.some(
          (m) =>
            m.conceptIds.includes(c.id) && m.source.kind === 'review_stock',
        )) &&
      JSON.stringify(c)
        .concat(
          JSON.stringify(mappings.filter((m) => m.conceptIds.includes(c.id))),
        )
        .includes(search),
  )
  const missed =
    data &&
    content.concepts.some(
      (c) =>
        c.mandatory &&
        (!data.states[c.mandatoryMappingId!]?.firstConfirmedAt ||
          status(data.states[c.mandatoryMappingId!]) === '要再確認'),
    )
  const check = async () => {
    setBusy(true)
    try {
      if (!missed)
        setNotice('全部確認できている。通常練習は「今日」から始められる。')
      else {
        const s = await startSession(true)
        navigate('/micro/session', {
          state:
            s.status === 'active'
              ? { newSessionId: s.id, navigationOrigin: performance.timeOrigin }
              : null,
        })
      }
    } catch {
      setNotice('保存できなかった。再試行してね')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page micro-page">
      <h1>教材</h1>
      <p>見るだけでは想起記録を更新しない。</p>
      <section className="micro-panel abstraction-entry"><h2>与件を読む前の練習</h2><p>抽象題意から棚と果候補を想起する。</p><NavLink className="btn btn-ghost" to="/abstraction">練習と教材を開く</NavLink><NavLink to="/legacy">過去問再現（本試一問一答）</NavLink></section>
      <button
        className="btn btn-primary"
        disabled={!data || busy}
        onClick={() => void check()}
      >
        覚え漏れ確認
      </button>
      {(notice || error) && <p role="status">{notice || error}</p>}
      <section className="micro-panel">
        <label>
          集合
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          >
            <option value="mandatory">必須の果</option>
            <option value="stock">A/B復習ストック</option>
            <option value="all">すべての果</option>
          </select>
        </label>
        <label>
          事例
          <select
            value={caseFilter}
            onChange={(e) => setCaseFilter(e.target.value)}
          >
            <option value="">すべて</option>
            {['I', 'II', 'III'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          題意
          <select value={intent} onChange={(e) => setIntent(e.target.value)}>
            <option value="">すべて</option>
            {Object.entries(intentLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          文字検索
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {data && (
          <>
            <label>
              想起方法
              <select
                value={data.plan.inputMode}
                onChange={(e) => {
                  const plan = {
                    ...data.plan,
                    inputMode: e.target.value as 'mental' | 'typed',
                  }
                  void updatePlan({ inputMode: plan.inputMode })
                    .then(() => location.reload())
                    .catch(() => setNotice('設定を保存できなかった'))
                }}
              >
                <option value="mental">頭の中で答える</option>
                <option value="typed">任意の文字入力</option>
              </select>
            </label>
          </>
        )}
      </section>
      {concepts.map((c) => (
        <details className="micro-panel" key={c.id}>
          <summary>
            {c.label} ／{' '}
            {data
              ? status(
                  data.states[
                    c.mandatoryMappingId ??
                      mappings.find((m) => m.conceptIds.includes(c.id))!.id
                  ],
                )
              : '未確認'}
          </summary>
          <p>
            資料内{c.frequency.groups.length}問・{c.frequency.years.length}年 ／{' '}
            {c.mandatory ? '設計上の必須' : '非必須'} ／ ストック重要度{' '}
            {c.priority ??
              (mappings.some(
                (m) =>
                  m.conceptIds.includes(c.id) &&
                  m.source.kind === 'review_stock',
              )
                ? '復習ストック'
                : '未設定')}
          </p>
          <p>採用理由：{c.selectionReason}</p>
          {mappings
            .filter((m) => m.conceptIds.includes(c.id))
            .map((m) => (
              <div key={m.id}>
                <p>
                  事例{m.case} ／ {intentLabels[m.intent]}
                </p>
                <p>使える条件：{m.cues[0].prompt}</p>
                <p>
                  今回確認する果・目的語：
                  {m.answerSlots.map((s) => s.accepted[0]).join('・')}
                </p>
                <p>{m.explanation}</p>
                {content.cards
                  .filter(
                    (card) =>
                      card.mappingId === m.id && card.kind === 'contrast',
                  )
                  .map((card) => (
                    <p key={card.id}>
                      {card.distractor}との違い：{card.contrastExplanation}
                    </p>
                  ))}
                <small>
                  出典区分：
                  {m.source.kind === 'review_stock'
                    ? '復習ストックから設計した汎用練習'
                    : '設計者作成の汎用練習'}
                  。元語の根拠：{m.source.refs.join('、')}
                </small>
              </div>
            ))}
        </details>
      ))}
      <section className="micro-panel">
        <h2>既存の練習</h2>
        <div className="micro-links">
          <NavLink to="/legacy">旧ホーム・各練習</NavLink>
          <NavLink to="/setup">原問題・事例IV・私的教材の練習</NavLink>
          <NavLink to="/overview">本試設問一覧</NavLink>
          <NavLink to="/overview/associations">
            A/B全29ストック・題意とトリガー
          </NavLink>
          <NavLink to="/dictionary">既存の果辞典</NavLink>
          <NavLink to="/history">既存の履歴</NavLink>
        </div>
        <p>
          Bランク22件も小問化済み。非必須の果として、必須範囲と分けて練習できる。
        </p>
      </section>
    </div>
  )
}

export function MicroRecords() {
  const { data, error } = useData()
  const [date, setDate] = useState(''),
    [notice, setNotice] = useState('')
  if (!data) return <p role="status">{error || '記録を読み込み中'}</p>
  const recent = data.attempts.filter(
      (a) => a.localDate >= addDays(localDate(), -6),
    ),
    missing = content.concepts.filter(
      (c) =>
        c.mandatory && !data.states[c.mandatoryMappingId!]?.firstConfirmedAt,
    )
  return (
    <div className="page micro-page">
      <h1>記録</h1>
      <NavLink to="/abstraction/records">抽象題意の弱点復習・記録</NavLink>
      <Progress data={data} />
      <p>
        直近7日：迷い {recent.filter((a) => a.grade === 'hesitant').length}回 ／
        出なかった {recent.filter((a) => a.grade === 'miss').length}回
      </p>
      <p>安定は自己申告を含む確認結果。本試験の得点予測ではない。</p>
      <section className="micro-panel">
        <h2>必須の未確認</h2>
        <ul>
          {missing.map((c) => (
            <li key={c.id}>{c.label}</li>
          ))}
        </ul>
        {!missing.length && <p>全部初回確認できている。</p>}
        <NavLink to="/materials">教材と覚え漏れ確認</NavLink>
      </section>
      <section className="micro-panel">
        <h2>21日プラン</h2>
        <p>
          {data.plan.examDate
            ? `試験日：${data.plan.examDate}`
            : `試験日未設定の21日プラン：${data.plan.fallbackStartDate}から`}
        </p>
        <label>
          試験日（任意）
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          className="btn btn-ghost"
          onClick={() => {
            void updatePlan({ examDate: date || null })
              .then(() => location.reload())
              .catch(() => setNotice('保存できなかった。再試行してね'))
          }}
        >
          試験日を保存・空欄で解除
        </button>
        {notice && <p role="alert">{notice}</p>}
      </section>
      <NavLink to="/history">旧履歴を見る</NavLink>
    </div>
  )
}
