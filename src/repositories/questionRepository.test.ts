import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawQuestion } from '../domain/question'

const mocks = vi.hoisted(() => ({
  bulkPut: vi.fn(),
  toArray: vi.fn(),
  bulkDelete: vi.fn(),
  resultPut: vi.fn(),
  settingsPut: vi.fn(),
  transaction: vi.fn(async (...args: unknown[]) => {
    const callback = args.at(-1) as () => Promise<void>
    await callback()
  }),
}))

vi.mock('../db/indexedDb', () => ({
  db: {
    questions: {
      bulkPut: mocks.bulkPut,
      toArray: mocks.toArray,
      bulkDelete: mocks.bulkDelete,
    },
    trainingResults: { put: mocks.resultPut },
    settings: { put: mocks.settingsPut },
    transaction: mocks.transaction,
  },
}))

import { mapQuestion, questionRepository } from './questionRepository'

const rawQuestion: RawQuestion = {
  id: '2025-I-Q3',
  year: 2025,
  case: 'I',
  question_no: 'Q3',
  question_text: '設問文',
  question_summary: '題意要約',
  answer_target: '強み',
  mmc_theme: ['オペレーション（組織）'],
  theme_status: 'verified',
  theme_source_pages: '組織 p5',
  question_status: 'verified',
  question_source_pages: 'R7 事例Ⅰ p4',
  model_answer: '模範解答',
  fruit_keywords: ['権限委譲'],
  cuts: ['組織構造'],
  status: 'verified',
  source_pages: '組織 p4',
  answer_source: 'MMC本試3年解答帖',
  version: '1.0',
}

describe('問題データ更新', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.toArray.mockResolvedValue([])
  })

  it('snake_caseをアプリ内部のcamelCaseへ変換する', () => {
    expect(mapQuestion(rawQuestion)).toMatchObject({
      questionText: '設問文',
      answerTarget: '強み',
      mmcTheme: ['オペレーション（組織）'],
      themeStatus: 'verified',
      themeSourcePages: '組織 p5',
      questionSourcePages: 'R7 事例Ⅰ p4',
      answerSource: 'MMC本試3年解答帖',
    })
  })

  it('JSON更新時にquestionsだけを更新し、履歴と設定には触れない', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ metadata: { record_count: 1 }, records: [rawQuestion] }),
    })) as unknown as typeof fetch

    await questionRepository.initialize()

    expect(mocks.bulkPut).toHaveBeenCalledOnce()
    expect(mocks.transaction).toHaveBeenCalledWith('rw', expect.anything(), expect.any(Function))
    expect(mocks.resultPut).not.toHaveBeenCalled()
    expect(mocks.settingsPut).not.toHaveBeenCalled()
  })
})
