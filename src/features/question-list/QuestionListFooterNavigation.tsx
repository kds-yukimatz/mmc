import { Check, ChevronRight } from 'lucide-react'
import type { CaseType } from '../../domain/question'
import { caseOrder } from './questionList'
import type { LearningTarget } from './learningSequence'

interface Props {
  current: LearningTarget
  years: number[]
  next?: LearningTarget
  onSelect: (target: LearningTarget) => void
}

const caseLabel: Record<CaseType, string> = { I: '事例Ⅰ', II: '事例Ⅱ', III: '事例Ⅲ', IV: '事例Ⅳ' }

export function QuestionListFooterNavigation({ current, years, next, onSelect }: Props) {
  return <section className="overview-footer-navigation" aria-label="次の設問一覧へ移動">
    <p className="eyebrow">NEXT OVERVIEW</p>
    <h2>ここまで確認しました</h2>
    <p className="overview-current-target"><span>現在表示中</span><strong>{current.year}年度 {caseLabel[current.caseType]}</strong></p>

    <div className="overview-footer-selector">
      <h3>年度を変更</h3>
      <div className="overview-year-buttons">
        {years.map((year) => {
          const active = year === current.year
          return <button key={year} type="button" className={active ? 'active' : ''} aria-pressed={active} disabled={active} onClick={() => onSelect({ year, caseType: current.caseType })}>
            {active && <Check />}{year}{active && <small>表示中</small>}
          </button>
        })}
      </div>
    </div>

    <div className="overview-footer-selector">
      <h3>事例を変更</h3>
      <div className="overview-case-buttons">
        {caseOrder.map((caseType) => {
          const active = caseType === current.caseType
          return <button key={caseType} type="button" className={active ? 'active' : ''} aria-pressed={active} disabled={active} onClick={() => onSelect({ year: current.year, caseType })}>
            {active && <Check />}{caseLabel[caseType]}{active && <small>表示中</small>}
          </button>
        })}
      </div>
    </div>

    {next ? <button className="overview-next-button" type="button" onClick={() => onSelect(next)}><span>次へ：{next.year}年度 {caseLabel[next.caseType]}</span><ChevronRight /></button> : <p className="overview-complete">全事例の確認が完了しました</p>}
  </section>
}
