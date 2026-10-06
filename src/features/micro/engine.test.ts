import { describe, expect, it } from 'vitest'
import seed from '../../../public/data/micro-content-v1.json'
import { reviewFruitStock } from '../../data/reviewFruitStock'
import type { Attempt, Content, Plan } from './domain'
import {
  addDays,
  exactMatch,
  initialState,
  localDate,
  phase,
  rebuildStates,
  reduceState,
  selectCard,
  stable,
  validateContent,
} from './engine'
const content = seed as Content
const plan: Plan = {
  id: 'micro',
  examDate: '2026-10-25',
  fallbackStartDate: '2026-10-04',
  timezone: 'Asia/Tokyo',
  inputMode: 'mental',
  slotLocalDate: '2026-10-04',
  slotCursor: 0,
  mandatoryConceptIds: [],
}
const attempt = (changes: Partial<Attempt> = {}): Attempt => ({
  id: 's:1',
  sessionId: 's',
  ordinal: 1,
  mappingId: 'map-01',
  cardId: 'map-01-cue-1-recall',
  cueId: 'map-01-cue-1',
  contentVersion: 'micro-seed-1',
  answeredAt: '2026-10-04T01:00:00.000Z',
  localDate: '2026-10-04',
  grade: 'fast',
  hintUsed: false,
  override: false,
  activeRevealMs: 15000,
  wasNew: true,
  slot: 'coverage',
  cardKind: 'recall',
  examDate: null,
  ...changes,
})
describe('教材と完全一致', () => {
  it('31必須を保ち、Bストック22件を含む教材の出典とcue対応を検証する', () => {
    expect(validateContent(content)).toEqual([])
    expect(content.concepts.filter((c) => c.mandatory)).toHaveLength(31)
    expect(content.concepts).toHaveLength(content.metadata.conceptCount)
    expect(content.mappings).toHaveLength(content.metadata.mappingCount)
    expect(content.cards).toHaveLength(content.metadata.cardCount)
    const mmcMappings = content.mappings.filter(
      (mapping) => mapping.source.kind === 'mmc_original',
    )
    expect(mmcMappings).toHaveLength(content.metadata.mmcOriginal!.mappingCount)
    expect(
      content.cards.filter(
        (card) =>
          content.mappings.find((mapping) => mapping.id === card.mappingId)
            ?.source.kind === 'mmc_original' && card.kind === 'recall',
      ),
    ).toHaveLength(content.metadata.mmcOriginal!.mappingCount * 2)
    expect(
      new Set(
        content.metadata.mmcOriginal!.sources.map((source) => source.filename),
      ),
    ).toHaveProperty('size', content.metadata.mmcOriginal!.sourceFileCount)
    const cs532 = content.metadata.mmcOriginal!.sources.find(
      (source) => source.filename === 'mmc2025Cs532x03kaisetu.pdf',
    )!
    expect(cs532).toMatchObject({ documentYear: 2026, filenameYear: 2025 })
    expect(
      content.metadata.mmcOriginal!.sources.every(
        (source) =>
          !source.filename.includes('\\') && !source.filename.includes('/'),
      ),
    ).toBe(true)
    const correctedConcept = content.concepts.find(
      (concept) => concept.id === 'fruit-mmc-cs331-13',
    )!
    const correctedMapping = content.mappings.find(
      (mapping) => mapping.id === 'mmc-cs331-13',
    )!
    expect(correctedConcept.label).toBe('カムアップシステム')
    expect(correctedMapping.answerSlots[0].accepted).not.toContain(
      'ムアアップシステム',
    )
    expect(
      content.mappings.flatMap((mapping) =>
        mapping.cues.flatMap((cue) => cue.hintChoices),
      ),
    ).not.toContain('ムアアップシステム')
    const bStocks = reviewFruitStock.filter((stock) => stock.priority === 'B')
    expect(bStocks).toHaveLength(22)
    for (const stock of bStocks) {
      const ref = `src/data/reviewFruitStock.ts#${stock.id}`
      const answers = content.mappings
        .filter((mapping) => mapping.source.refs.includes(ref))
        .flatMap((mapping) =>
          mapping.answerSlots.flatMap((slot) => slot.accepted),
        )
      for (const word of stock.fruitKeywords) expect(answers).toContain(word)
    }
  })
  it('MMC独自問題を試験期の新規上限に関係なく練習し、範囲を継続する', () => {
    const finalPhase = '2026-10-24T01:00:00.000Z'
    const first = selectCard(
      content,
      {},
      [],
      plan,
      finalPhase,
      [],
      false,
      'mmc',
    )!
    expect(first.mapping.source.kind).toBe('mmc_original')
    expect(first.slot).toBe('coverage')
    const firstAttempt = attempt({
      mappingId: first.mapping.id,
      cardId: first.card.id,
      cueId: first.cue.id,
      answeredAt: finalPhase,
      localDate: '2026-10-24',
    })
    const second = selectCard(
      content,
      rebuildStates([firstAttempt]),
      [firstAttempt],
      plan,
      finalPhase,
      [first.mapping.id],
      false,
      'mmc',
    )!
    expect(second.mapping.source.kind).toBe('mmc_original')
    expect(second.mapping.id).not.toBe(first.mapping.id)
  })
  it('題意越境・部分一致・全体類義語を採用しない', () => {
    const education = content.mappings.find((m) => m.id === 'map-25')!
    expect(exactMatch(education, ['OJT'])).toBe(false)
    expect(exactMatch(education, ['教育'])).toBe(false)
    expect(exactMatch(education, ['教育 制度の未整備'])).toBe(true)
    const mapping = {
      ...education,
      expectedCount: 2 as const,
      answerSlots: [
        { conceptId: '1', accepted: ['共有', '管理'] },
        { conceptId: '2', accepted: ['共有'] },
      ],
    }
    expect(exactMatch(mapping, ['共有'])).toBe(false)
    expect(exactMatch(mapping, ['共有', '管理'])).toBe(true)
  })
})
describe('暦日・予定・安定', () => {
  it('日本時間の暦日境界とD7/D1の新規上限', () => {
    expect(localDate('2026-10-03T15:00:00Z')).toBe('2026-10-04')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(phase(plan, '2026-10-04').newLimit).toBe(6)
    expect(phase(plan, '2026-10-11').newLimit).toBe(3)
    expect(phase(plan, '2026-10-18').newLimit).toBe(0)
    expect(phase(plan, '2026-10-24').newLimit).toBe(0)
  })
  it('初回・同日成功は安定せず、24hを空けた2成功と2cueで安定', () => {
    const first = reduceState(initialState('map-01'), attempt())
    expect(first.stage).toBe(1)
    expect(stable(first)).toBe(false)
    const sameDay = reduceState(
      first,
      attempt({
        answeredAt: '2026-10-04T02:00:00.000Z',
        cueId: 'map-01-cue-2',
      }),
    )
    expect(sameDay.delayedFastStreak).toBe(0)
    expect(sameDay.dueAt).toBe(first.dueAt)
    const second = reduceState(
      first,
      attempt({
        answeredAt: '2026-10-05T01:00:00.000Z',
        localDate: '2026-10-05',
        cueId: 'map-01-cue-2',
        wasNew: false,
      }),
    )
    const third = reduceState(
      second,
      attempt({
        answeredAt: '2026-10-08T01:00:00.000Z',
        localDate: '2026-10-08',
        wasNew: false,
      }),
    )
    expect(second.stage).toBe(2)
    expect(third.stage).toBe(3)
    expect(stable(third)).toBe(true)
  })
  it('ヒント・別解・使い分け失敗・maintenanceは安定を延長しない', () => {
    expect(
      reduceState(initialState('map-01'), attempt({ hintUsed: true }))
        .lastGrade,
    ).toBe('hesitant')
    expect(
      reduceState(initialState('map-01'), attempt({ override: true }))
        .delayedFastStreak,
    ).toBe(0)
    const failed = reduceState(
      initialState('map-01'),
      attempt({ grade: 'miss', cardKind: 'contrast' }),
    )
    expect(failed.contrastRecoveryRequired).toBe(true)
    const recalled = reduceState(
      failed,
      attempt({
        answeredAt: '2026-10-05T01:00:00.000Z',
        localDate: '2026-10-05',
      }),
    )
    expect(recalled.contrastRecoveryRequired).toBe(true)
    const recovered = reduceState(
      recalled,
      attempt({
        cardKind: 'contrast',
        answeredAt: '2026-10-06T01:00:00.000Z',
        localDate: '2026-10-06',
      }),
    )
    expect(recovered.contrastRecoveryRequired).toBe(false)
    const maintained = reduceState(
      recovered,
      attempt({
        slot: 'maintenance',
        answeredAt: '2026-10-07T01:00:00.000Z',
        localDate: '2026-10-07',
      }),
    )
    expect(maintained.dueAt).toBe(recovered.dueAt)
    expect(maintained.delayedFastStreak).toBe(recovered.delayedFastStreak)
  })
  it('試験日以降の予定はD2以前ならD1へ短縮、D1では翌日', () => {
    const a = attempt({ examDate: '2026-10-06' })
    const initial = {
      ...initialState('map-01'),
      stage: 2 as const,
      firstConfirmedAt: '2026-09-30T01:00:00.000Z',
      lastDelayedFastAt: '2026-10-01T01:00:00.000Z',
      lastAttemptAt: '2026-10-01T01:00:00.000Z',
    }
    expect(localDate(reduceState(initial, a).dueAt!)).toBe('2026-10-05')
    expect(
      localDate(
        reduceState(initial, {
          ...a,
          answeredAt: '2026-10-05T01:00:00.000Z',
          localDate: '2026-10-05',
          grade: 'miss',
        }).dueAt!,
      ),
    ).toBe('2026-10-06')
  })
})
describe('出題枠と再試行', () => {
  it('coverageは失敗多数でも未確認必須を選ぶ、通常上限は6、専用開始は上限・期を超える', () => {
    const answered = content.mappings.slice(0, 6).map((m, i) =>
      attempt({
        id: `s${i}:1`,
        sessionId: `s${i}`,
        mappingId: m.id,
        grade: 'miss',
      }),
    )
    const states = rebuildStates(answered)
    const now = '2026-10-04T01:01:00.000Z'
    expect(selectCard(content, states, answered, plan, now)).toBeNull()
    const special = selectCard(content, states, answered, plan, now, [], true)!
    expect(special.slot).toBe('coverage')
    expect(states[special.mapping.id]).toBeUndefined()
    expect(
      selectCard(content, {}, [], plan, '2026-10-18T01:00:00.000Z'),
    ).toBeNull()
    expect(
      selectCard(content, {}, [], plan, '2026-10-18T01:00:00.000Z', [], true)
        ?.slot,
    ).toBe('coverage')
  })
  it('再試行には10分・別mapping2回答、同セットmapping除外、cueを交代', () => {
    const one = {
      ...content,
      mappings: [content.mappings[0]],
      cards: content.cards.filter((c) => c.mappingId === 'map-01'),
    }
    const a = attempt({ grade: 'miss' }),
      others = [
        attempt({
          id: 'b:1',
          mappingId: 'map-02',
          answeredAt: '2026-10-04T01:01:00.000Z',
        }),
        attempt({
          id: 'c:1',
          mappingId: 'map-03',
          answeredAt: '2026-10-04T01:02:00.000Z',
        }),
      ]
    const history = [a, ...others],
      states = rebuildStates(history)
    expect(
      selectCard(one, states, [a], plan, '2026-10-04T01:11:00.000Z'),
    ).toBeNull()
    expect(
      selectCard(one, states, history, plan, '2026-10-04T01:09:00.000Z'),
    ).toBeNull()
    const retry = selectCard(
      one,
      states,
      history,
      plan,
      '2026-10-04T01:10:00.000Z',
    )!
    expect(retry.cue.id).toBe('map-01-cue-2')
    expect(
      selectCard(one, states, history, plan, '2026-10-04T01:10:00.000Z', [
        'map-01',
      ]),
    ).toBeNull()
  })
})
