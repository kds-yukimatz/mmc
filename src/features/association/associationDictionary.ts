import payload from '../../../public/data/kahotore_trigger_dictionary_v1.json'
import type { AssociationRecord, TriggerDictionaryPayload } from '../../domain/association'
import type { Question } from '../../domain/question'
import { isEquivalent } from '../../services/synonymNormalizer'

const dictionary = payload as TriggerDictionaryPayload

export const shelves = dictionary.shelves
export const reinforcementRecords: AssociationRecord[] = dictionary.records.map((record) => ({
  id: record.id,
  year: record.year,
  case: record.case,
  trigger: record.trigger,
  shelf: record.shelf,
  fruitKeywords: record.fruit_keywords,
  source: record.source,
  sourceType: record.source_type,
}))

export function resolveShelf(question: Question): string | undefined {
  if (question.case === 'IV') return undefined
  const text = [question.questionSummary, question.answerUnitLabel, ...question.mmcTheme, ...question.cuts].join('／')

  if (question.case === 'I') {
    if (/SWOT|経営環境|強み|弱み|機会|脅威/.test(text)) return 'SWOT・強み'
    if (/新事業/.test(text)) return '新事業・事業展開'
    if (/人事|人材|採用|配置|評価|報酬|能力開発|動機|経営理念/.test(text)) return '人的資源管理'
    if (/組織|権限|コミュニケーション/.test(text)) return '組織構造'
    if (/戦略|差別化|事業展開/.test(text)) return '経営戦略'
  }

  if (question.case === 'II') {
    if (/SWOT|3C|経営環境|強み|弱み|機会|脅威/.test(text)) return 'SWOT・3C'
    if (/関係性|愛顧|固定客|継続/.test(text)) return '関係性マーケティング'
    if (/協業|連携/.test(text)) return '協業'
    if (/ターゲット|顧客層|市場細分/.test(text)) return 'ターゲット'
    if (/品揃え|商品|製品/.test(text)) return '製品・品揃え'
    if (/サービス|交流/.test(text)) return 'サービス'
    if (/プロモーション|販促|イベント/.test(text)) return 'プロモーション'
    if (/情報発信|広告|SNS|WEB|HP/.test(text)) return '情報発信'
  }

  if (question.case === 'III') {
    if (/SWOT|強み/.test(text)) return '強み'
    if (/技能承継|技術承継|人材育成/.test(text)) return '技能承継'
    if (/外注/.test(text)) return '外注'
    if (/営業/.test(text)) return '営業'
    if (/情報管理|情報共有|データ/.test(text)) return '情報管理'
    if (/品質|不良|クレーム/.test(text)) return '品質管理'
    if (/設計|VE|DR/.test(text)) return '設計'
    if (/生産|工程|納期|在庫/.test(text)) return '生産管理'
  }

  return undefined
}

export function buildAssociationRecords(questions: Question[]): AssociationRecord[] {
  const baseRecords = questions.flatMap<AssociationRecord>((question) => {
    const shelf = resolveShelf(question)
    if (!shelf || question.case === 'IV' || !question.fruitKeywords.length) return []
    return [{
      id: `base-${question.id}`,
      year: question.year,
      case: question.case,
      trigger: question.answerUnitLabel || question.questionSummary,
      shelf,
      fruitKeywords: question.fruitKeywords,
      source: `${question.answerSourcePages ?? question.sourcePages ?? '出典ページ未記録'}${question.answerSource ? `（${question.answerSource}）` : ''}`,
      sourceType: '本試3年',
    }]
  })
  return [...reinforcementRecords, ...baseRecords]
}

export function gradeAssociation(expected: string[], actual: string[], useSynonyms = true) {
  const matched = expected.filter((expectedItem) =>
    actual.some((actualItem) => isEquivalent(expectedItem, actualItem, useSynonyms)),
  )
  return {
    matched,
    missed: expected.filter((item) => !matched.includes(item)),
    score: expected.length ? Math.round((matched.length / expected.length) * 100) : 0,
  }
}
