import { describe, expect, it } from 'vitest'
import type {
  AbstractionRecord,
  FruitCategory,
  FruitConcept,
  Term,
} from '../domain/abstraction'
import { gradeAbstraction } from './abstractionGrader'

const term = (id: string, label: string, synonyms: string[] = []): Term => ({
  id,
  label,
  synonyms,
  rules: [],
})
const categories: FruitCategory[] = [
  { ...term('cat-info', '情報活用', ['情報管理']), cases: ['I', 'II', 'III'] },
  { ...term('cat-relationship', '関係性マーケティング'), cases: ['II'] },
  { ...term('cat-production', '生産管理'), cases: ['III'] },
  { ...term('cat-procurement', '資材管理'), cases: ['III'] },
  { ...term('cat-hr', '人事'), cases: ['I', 'III'] },
]
const concepts: FruitConcept[] = [
  {
    ...term('kf-collect', '情報収集', ['顧客ニーズ把握']),
    categoryIds: ['cat-info'],
    microConceptIds: [],
  },
  {
    ...term('kf-customer', '顧客情報活用', ['情報共有']),
    categoryIds: ['cat-info'],
    microConceptIds: [],
    rules: [{ allOf: ['顧客'], anyOf: ['部門間で活用'], noneOf: ['未活用'] }],
  } as FruitConcept,
  {
    ...term('kf-dialogue', '双方向コミュニケーション', ['顧客との対話']),
    categoryIds: ['cat-relationship'],
    microConceptIds: [],
  },
  {
    ...term('kf-order', '発注管理適正化'),
    categoryIds: ['cat-procurement'],
    microConceptIds: [],
  },
  {
    ...term('kf-maint', '予防保全'),
    categoryIds: ['cat-production'],
    microConceptIds: [],
  },
  {
    ...term('kf-standard', '作業標準化'),
    categoryIds: ['cat-production'],
    microConceptIds: [],
  },
  {
    ...term('kf-placement', '適正配置'),
    categoryIds: ['cat-hr'],
    microConceptIds: [],
  },
  {
    ...term('kf-inventory', '在庫管理適正化'),
    categoryIds: ['cat-procurement'],
    microConceptIds: [],
  },
]
const record: AbstractionRecord = {
  id: 'aq-ii-communication',
  case: 'II',
  abstractQuestion: '顧客接点を通じ関係性を深める',
  variants: [],
  sourceRefs: [{ kind: 'practice', id: 'practice-x' }],
  frameworkIds: [],
  cutTerms: [],
  fruitCategories: ['cat-info', 'cat-relationship'],
  shelfGroups: [
    { id: 'shelf-info', categoryIds: ['cat-info'] },
    { id: 'shelf-rel', categoryIds: ['cat-relationship'] },
  ],
  coreFruitKeywords: ['kf-collect', 'kf-customer', 'kf-dialogue'],
  acceptableFruitKeywords: [],
  contextDependentKeywords: [
    {
      label: '顧客情報一元管理',
      synonyms: [],
      reason: '与件で選ぶ',
      impliesCoreId: 'kf-customer',
    },
  ],
  candidateTarget: 3,
  modes: ['abstract-shelf', 'abstract-fruit'],
  weaknessTags: [],
  editorial: {
    kind: 'designed_practice',
    status: 'reviewed',
    reviewer: 'review',
    reviewedAt: '2026-10-04T00:00:00.000Z',
    note: 'Designed',
  },
  contentRevision: 1,
}
const plan: AbstractionRecord = {
  ...record,
  id: 'aq-iii-plan-material',
  case: 'III',
  abstractQuestion: '材料確保と生産',
  fruitCategories: ['cat-production', 'cat-procurement'],
  shelfGroups: [
    { id: 'shelf-prod', categoryIds: ['cat-production'] },
    { id: 'shelf-proc', categoryIds: ['cat-procurement'] },
  ],
  coreFruitKeywords: ['kf-order', 'kf-maint', 'kf-standard'],
  acceptableFruitKeywords: [
    { conceptId: 'kf-inventory', substitutesCoreId: null },
  ],
}
const catalogs = { frameworks: [term('fw-3c', '3C')], categories, concepts }
const grade = (
  r: AbstractionRecord,
  fruits: string[],
  mode: 'abstract-fruit' | 'abstract-shelf' = 'abstract-fruit',
  shelves: string[] = [],
  frameworks: string[] = [],
) =>
  gradeAbstraction(
    r,
    { mode, fruits, shelves, frameworks, cuts: [] },
    catalogs,
    true,
  )
describe('gradeAbstraction', () => {
  it('G01 gives excellent at target without needing every core', () => {
    const g = grade(record, [
      '情報収集',
      '顧客情報活用',
      '双方向コミュニケーション',
    ])
    expect([g.grade, g.score, g.coreCredits]).toEqual(['excellent', 100, 3])
  })
  it('G04 awards good for two distinct core concepts', () =>
    expect(
      grade(record, ['顧客情報活用', '双方向コミュニケーション']).grade,
    ).toBe('good'))
  it('G06 does not penalize omitted context candidates', () =>
    expect(
      grade(record, ['情報収集', '顧客情報活用', '双方向コミュニケーション']),
    ).toEqual(
      grade(record, ['情報収集', '顧客情報活用', '双方向コミュニケーション']),
    ))
  it('G07 classifies known off-shelf concepts as miss; nearby concepts in an expected shelf are evidence', () => {
    const wrong = grade(plan, ['適正配置', '関係性構築'])
    expect(wrong.grade).toBe('miss')
    const nearby = grade(plan, ['在庫管理適正化'])
    expect(nearby.grade).toBe('partial')
  })
  it('G10 accepts explicit context implication only with synonym setting enabled', () =>
    expect(
      grade(record, [
        '顧客情報一元管理',
        '情報収集',
        '双方向コミュニケーション',
      ]).grade,
    ).toBe('excellent'))
  it('G23 prefers a label edge over a synonym edge before core ID order', () => {
    const ambiguous = {
      ...record,
      coreFruitKeywords: ['kf-collect', 'kf-customer'],
      acceptableFruitKeywords: [],
      contextDependentKeywords: [],
      candidateTarget: 2 as const,
    }
    const rankedCatalogs = {
      ...catalogs,
      concepts: concepts.map((concept) =>
        concept.id === 'kf-customer'
          ? { ...concept, label: '情報共有', synonyms: [] }
          : concept.id === 'kf-collect'
            ? { ...concept, synonyms: ['情報共有'] }
            : concept,
      ),
    }
    const match = gradeAbstraction(
      ambiguous,
      {
        mode: 'abstract-fruit',
        fruits: ['情報共有'],
        shelves: [],
        frameworks: [],
        cuts: [],
      },
      rankedCatalogs,
      true,
    )
    expect(match.matchedCore).toEqual([
      { coreId: 'kf-customer', actual: '情報共有', via: 'label' },
    ])
    expect(
      gradeAbstraction(
        ambiguous,
        {
          mode: 'abstract-fruit',
          fruits: ['情報共有'],
          shelves: [],
          frameworks: [],
          cuts: [],
        },
        rankedCatalogs,
        true,
      ).matchedCore,
    ).toEqual(match.matchedCore)
  })
  it('bounds fruit matching to the twelve tags accepted by the UI', () => {
    const tooMany = [
      ...Array.from({ length: 12 }, (_, index) => `未登録${index}`),
      '情報収集',
    ]
    expect(grade(record, tooMany).coreCredits).toBe(0)
  })
  it('A mode evaluates shelf groups and does not convert framework/cuts into shelf hits', () => {
    const fwRecord = { ...record, frameworkIds: ['fw-3c'] }
    const g = grade(fwRecord, [], 'abstract-shelf', [], ['3C'])
    expect(g.grade).toBe('partial')
    expect(g.shelfGroupHits).toEqual([])
  })
})
