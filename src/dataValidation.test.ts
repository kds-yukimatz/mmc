import { describe, expect, it } from 'vitest'
import payload from '../public/data/kahotore_mmc_base_v2.json'

const records = payload.records
const byId = new Map(records.map((record) => [record.id, record]))

describe('問題データ', () => {
  it('全51件に設問文と模範解答が入っている', () => {
    expect(records).toHaveLength(51)
    expect(records.every((record) => record.question_status === 'verified' && record.question_text.trim().length > 0)).toBe(true)
    expect(records.every((record) => record.model_answer.trim().length > 0)).toBe(true)
  })

  it('MMC題意は配列で、確認済みレコードに1件以上ある', () => {
    expect(records.every((record) => Array.isArray(record.mmc_theme))).toBe(true)
    expect(records.filter((record) => record.theme_status === 'verified').every((record) => record.mmc_theme.length > 0)).toBe(true)
  })

  it('2025年度事例ⅠのMMC題意が解説の表記と一致する', () => {
    for (const suffix of ['S', 'W', 'O', 'T']) {
      expect(byId.get(`2025-I-Q1-${suffix}`)?.mmc_theme).toEqual(['経営環境分析（SWOT）'])
    }
    expect(byId.get('2025-I-Q2')?.mmc_theme).toEqual(['事業戦略'])
    expect(byId.get('2025-I-Q3')?.mmc_theme).toEqual(['オペレーション（組織）'])
    expect(byId.get('2025-I-Q4')?.mmc_theme).toEqual(['オペレーション（人事）', '経営理念'])
  })

  it('分割レコードが同じ設問本文と対応する', () => {
    const q1Parts = ['S', 'W', 'O', 'T'].map((suffix) => byId.get(`2025-I-Q1-${suffix}`))
    expect(new Set(q1Parts.map((record) => record?.question_text)).size).toBe(1)
    expect(new Set(q1Parts.map((record) => record?.question_summary)).size).toBe(4)

    expect(byId.get('2025-III-Q2-1')?.question_text).toBe(byId.get('2025-III-Q2-2')?.question_text)
    expect(byId.get('2024-I-Q4-1')?.question_text).toContain('（設問1）')
    expect(byId.get('2024-I-Q4-2')?.question_text).toContain('（設問2）')
  })

  it('複数解答を求める設問はレコードごとの今回のお題を持つ', () => {
    expect(byId.get('2025-I-Q1-S')?.answer_unit_label).toBe('強み')
    expect(byId.get('2025-I-Q1-W')?.answer_unit_label).toBe('弱み')
    expect(byId.get('2025-I-Q1-O')?.answer_unit_label).toBe('機会')
    expect(byId.get('2025-I-Q1-T')?.answer_unit_label).toBe('脅威')
    expect(byId.get('2025-III-Q2-1')?.answer_unit_label).toBe('課題・改善策①（製造時間短縮）')
    expect(byId.get('2025-III-Q2-2')?.answer_unit_label).toBe('課題・改善策②（クレーム低減）')
  })

  it('設問番号・題意・設問の出典ページがすべて記録されている', () => {
    expect(records.every((record) => record.question_no && record.theme_source_pages && record.question_source_pages && record.answer_source_pages)).toBe(true)
  })

  it('IDは重複せず、各レコードに採点単位と大問グループがある', () => {
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length)
    expect(records.every((record) => record.group_id && record.answer_unit_label)).toBe(true)
  })

  it('事例Ⅳの計算・記述問題を回答欄単位で分離している', () => {
    expect(byId.has('2023-IV-Q1')).toBe(false)
    expect(byId.get('2023-IV-Q1-1')?.model_answer).toContain('11.59')
    expect(byId.get('2023-IV-Q1-1')?.model_answer).not.toContain('競争激化')
    expect(byId.get('2023-IV-Q1-2')?.model_answer).toContain('輸送コスト高騰')
    expect(byId.get('2023-IV-Q1-2')?.model_answer).not.toMatch(/11\.59|23\.04|311\.97/)
    expect(byId.get('2025-IV-Q1-1')?.sub_question_no).toBe('設問1')
    expect(byId.get('2025-IV-Q1-2')?.sub_question_no).toBe('設問2')
    expect(byId.get('2025-IV-Q4-1')?.model_answer).not.toContain('為替リスク')
    expect(byId.get('2025-IV-Q4-2')?.model_answer).not.toContain('長期借入金')
  })

  it('原因記述の果キーワードに指標分類だけを混在させない', () => {
    const cause = byId.get('2023-IV-Q1-2')
    expect(cause?.fruit_keywords).not.toContain('収益性')
    expect(cause?.fruit_keywords).not.toContain('効率性')
    expect(cause?.fruit_keywords).not.toContain('安全性')
  })

  it('2025年度事例Ⅰ第1問の弱みは改善策ではなく弱みそのものを果キーワードにする', () => {
    const weakness = byId.get('2025-I-Q1-W')
    expect(weakness?.model_answer).toContain('収益性の低下')
    expect(weakness?.model_answer).toContain('新規事業に消極的な組織体制')
    expect(weakness?.fruit_keywords).toEqual(['収益性の低下', '新規事業に消極的な組織体制'])
  })

  it.each([
    ['2023-I-Q1-W', ['仕入調達力不足', '顧客開拓力不足']],
    ['2024-I-Q1-W', ['受注管理力不足', '新規開拓力不足']],
    ['2024-II-Q1-W', ['情報発信力不足', 'オンライン販促力不足']],
    ['2025-III-Q1-W', ['製造管理力不足', '技術承継体制の不足']],
  ])('%s は改善策ではなく弱みの解答要素を果キーワードにする', (id, expectedKeywords) => {
    expect(byId.get(id)?.fruit_keywords).toEqual(expectedKeywords)
  })

  it('弱みを問うレコードには改善策の語尾を果キーワードとして混在させない', () => {
    const weaknesses = records.filter((record) => record.answer_target === '弱み')

    expect(weaknesses).not.toHaveLength(0)
    expect(weaknesses.flatMap((record) => record.fruit_keywords)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/強化|改善|拡大|導入|推進/)]),
    )
  })

  it('2025年度事例Ⅱ第1問は自社の現状を改善策ではなく事実として保持する', () => {
    const analysis = byId.get('2025-II-Q1')
    expect(analysis?.fruit_keywords).toContain('WEBサイト未活用')
    expect(analysis?.fruit_keywords).toContain('販促力不足')
    expect(analysis?.fruit_keywords).toContain('顧客流出')
    expect(analysis?.fruit_keywords).not.toContain('WEB販促強化')
  })
})
