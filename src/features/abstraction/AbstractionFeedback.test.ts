import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import {
  AbstractionDiagnostics,
  AbstractionSourceDetails,
} from './AbstractionFeedback'
import {
  abstractionCatalogs,
  abstractionContent,
} from '../../repositories/abstractionRepository'
import { gradeAbstraction } from '../../services/abstractionGrader'
import type { Question } from '../../domain/question'
describe('abstraction result diagnostics', () => {
  it('reports framework and cut matches separately from shelf grading', () => {
    const record = abstractionContent.records.find((r) => r.id === 'aq-ii-3c')!
    const grading = gradeAbstraction(
      record,
      {
        mode: 'abstract-shelf',
        frameworks: ['3C'],
        shelves: [],
        fruits: [],
        cuts: ['顧客'],
      },
      abstractionCatalogs,
      false,
    )
    const html = renderToStaticMarkup(
      createElement(AbstractionDiagnostics, {
        record,
        catalogs: abstractionCatalogs,
        grading,
        synonymsEnabled: false,
      }),
    )
    expect(html).toContain('登録語のみで判定')
    expect(html).toContain('フレームワークの一致：3C')
    expect(html).toContain('切り口の一致：顧客')
    expect(grading.grade).toBe('partial')
  })
  it('shows source relationships and nests the model answer in closed details', () => {
    const record = abstractionContent.records[0]
    const question = {
      id: record.sourceRefs.find((r) => r.kind === 'base_question')!.id,
      year: 2023,
      case: 'I',
      questionNo: '第3問',
      questionSummary: '元設問要約',
      mmcTheme: ['人事施策'],
      modelAnswer: 'MMC答案参照',
    } as Question
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(AbstractionSourceDetails, {
          record,
          questions: [question],
        }),
      ),
    )
    expect(html).toContain('元問題との関係')
    expect(html).toContain('MMC原文・KM原本の転記ではありません')
    expect(html).toContain('元設問要約：元設問要約')
    expect(html).toContain('MMC題意：人事施策')
    expect(html).toContain('<details><summary>MMC模範解答</summary>')
    expect(html).not.toContain('<details open')
    expect(html).toContain('href="/overview"')
  })
})
