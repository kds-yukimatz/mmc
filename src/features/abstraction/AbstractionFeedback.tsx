import { Link } from 'react-router-dom'
import type {
  AbstractionGradingResult,
  AbstractionRecord,
  AbstractionSnapshot,
} from '../../domain/abstraction'
import type { Question } from '../../domain/question'

export function AbstractionDiagnostics({
  record,
  catalogs,
  grading,
  synonymsEnabled,
}: {
  record: AbstractionRecord
  catalogs: AbstractionSnapshot['catalogs']
  grading: AbstractionGradingResult
  synonymsEnabled: boolean
}) {
  return (
    <section>
      {!synonymsEnabled && (
        <p>登録語のみで判定（同義語・表現ルールによる一致は無効）</p>
      )}
      <h3>補助入力の診断</h3>
      <p>棚・代表候補の評価とは別に確認します。</p>
      <p>
        フレームワークの期待：
        {record.frameworkIds
          .map(
            (id) => catalogs.frameworks.find((f) => f.id === id)?.label ?? id,
          )
          .join('・') || '指定なし'}
      </p>
      <p>
        フレームワークの一致：
        {grading.frameworkMatches.join('・') || '一致なし'}
      </p>
      <p>
        切り口の期待：
        {record.cutTerms.map((t) => t.label).join('・') || '指定なし'}
      </p>
      <p>切り口の一致：{grading.cutMatches.join('・') || '一致なし'}</p>
    </section>
  )
}

export function AbstractionSourceDetails({
  record,
  questions,
}: {
  record: AbstractionRecord
  questions: Question[]
}) {
  return (
    <details>
      <summary>元問題との関係</summary>
      <p>
        この抽象題意は設計者作成の汎用練習です。MMC原文・KM原本の転記ではありません。
      </p>
      {record.sourceRefs.map((ref) => {
        const question =
          ref.kind === 'base_question'
            ? questions.find((q) => q.id === ref.id && !q.privateImport)
            : undefined
        return (
          <section key={`${ref.kind}:${ref.id}`}>
            <p>
              出典：{ref.kind} / {ref.id}
            </p>
            {question ? (
              <>
                <p>元設問要約：{question.questionSummary}</p>
                <p>MMC題意：{question.mmcTheme.join('・') || '未確認'}</p>
                <Link
                  to="/overview"
                  onClick={() =>
                    localStorage.setItem(
                      'kahotore-overview-selection',
                      JSON.stringify({
                        year: question.year,
                        caseType: question.case,
                      }),
                    )
                  }
                >
                  原問題を見る（{question.year} 事例{question.case}{' '}
                  {question.questionNo} {question.subQuestionNo ?? ''}）
                </Link>
                <details>
                  <summary>MMC模範解答</summary>
                  <p>{question.modelAnswer || '模範解答未確認'}</p>
                </details>
              </>
            ) : (
              <p>この出典の原問題は現在の教材一覧にはありません。</p>
            )}
          </section>
        )
      })}
    </details>
  )
}
