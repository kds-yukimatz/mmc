import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { QuestionDetails } from './QuestionDetails'
import { getThemeDisplay } from './themeDisplay'
import { mapQuestion } from '../repositories/questionRepository'
import type { RawQuestion } from '../domain/question'
import payload from '../../public/data/kahotore_mmc_base_v2.json'

describe('MMC題意の表示', () => {
  it('複数の題意をすべて表示対象にする', () => {
    expect(getThemeDisplay({ mmcTheme: ['オペレーション（人事）', '経営理念'], themeStatus: 'verified' }))
      .toEqual(['オペレーション（人事）', '経営理念'])
  })

  it('未確認データは明示する', () => {
    expect(getThemeDisplay({ mmcTheme: [], themeStatus: 'unverified' })).toEqual(['MMC題意未確認'])
  })
})

describe('本試問題の表示', () => {
  const question = mapQuestion(payload.records.find((record) => record.id === '2023-II-Q1')! as RawQuestion)

  it('切り口回答前は企業概要と題意を先に示し、設問文の正解を伏せる', () => {
    const html = renderToStaticMarkup(createElement(QuestionDetails, { question, promptOnly: true }))
    expect(html).toContain('業種・事業概要')
    expect(html).toContain('地域密着型スポーツ用品店')
    expect(html).toContain('題意')
    expect(html).toContain('3C分析')
    expect(html).not.toContain('Customer：顧客')
  })

  it('切り口回答後は設問文を表示する', () => {
    expect(renderToStaticMarkup(createElement(QuestionDetails, { question }))).toContain('Customer：顧客')
  })
})
