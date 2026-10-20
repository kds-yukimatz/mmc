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
  it('日本時間の暦日境界と試験日の期', () => {
    expect(localDate('2026-10-03T15:00:00Z')).toBe('2026-10-04')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(phase(plan, '2026-10-04')).toMatchObject({ days: 21, period: 1 })
    expect(phase(plan, '2026-10-11')).toMatchObject({ days: 14, period: 2 })
    expect(phase(plan, '2026-10-18')).toMatchObject({ days: 7, period: 3 })
    expect(phase(plan, '2026-10-25')).toMatchObject({ days: 0, period: 3 })
    expect(phase(plan, '2026-10-26')).toMatchObject({ days: -1, period: 3 })
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
  it.each([
    { date: '2026-10-24', examDate: '2026-10-25' },
    { date: '2026-10-25', examDate: '2026-10-25' },
  ])(
    '必須31が既知・期限到来でも試験前日と当日既出後に非必須の新規を中心に選ぶ ($date)',
    ({ date, examDate }) => {
      const mandatoryIds = content.concepts
        .filter((c) => c.mandatory)
        .map((c) => c.mandatoryMappingId!)
      const baseline = mandatoryIds.map((mappingId, i) =>
        attempt({
          id: `required-${i}`,
          mappingId,
          wasNew: false,
          answeredAt: '2026-10-01T01:00:00.000Z',
          localDate: '2026-10-01',
          examDate,
        }),
      )
      const alreadyNew = content.mappings.find(
        (m) => !mandatoryIds.includes(m.id),
      )!
      const history = [
        ...baseline,
        attempt({
          id: 'today-new',
          mappingId: alreadyNew.id,
          answeredAt: `${date}T00:30:00.000Z`,
          localDate: date,
        }),
      ]
      const states = rebuildStates(history)
      const chosenNew: string[] = []
      for (let i = 0; i < 12; i++) {
        const now = `${date}T01:00:00.000Z`
        const selected = selectCard(
          content,
          states,
          history,
          { ...plan, examDate },
          now,
        )!
        expect(selected.mapping.id).not.toBe(alreadyNew.id)
        if (!states[selected.mapping.id]?.firstConfirmedAt) {
          chosenNew.push(selected.mapping.id)
          states[selected.mapping.id] = {
            ...initialState(selected.mapping.id),
            firstConfirmedAt: now,
            dueAt: `${addDays(date, 1)}T00:00:00.000Z`,
            lastAttemptAt: now,
            lastGrade: 'fast',
          }
        }
        history.push(
          attempt({
            id: `today-${i}`,
            mappingId: selected.mapping.id,
            cardId: selected.card.id,
            cueId: selected.cue.id,
            answeredAt: `${now.slice(0, 19)}.${String(i + 1).padStart(3, '0')}Z`,
            localDate: date,
            wasNew: !baseline.some((a) => a.mappingId === selected.mapping.id),
            slot: selected.slot,
          }),
        )
      }
      expect(new Set(chosenNew).size).toBeGreaterThanOrEqual(8)
      expect(chosenNew.every((id) => !mandatoryIds.includes(id))).toBe(true)
    },
  )
  it('coverageの出典巡回を必須過重なしでMMC・B・その他・必須へ分散する', () => {
    const states: Record<string, ReturnType<typeof initialState>> = {}
    const groups: string[] = []
    for (let i = 0; i < 6; i++) {
      const selected = selectCard(
        content,
        states,
        [],
        plan,
        '2026-10-04T01:00:00.000Z',
      )!
      const mapping = selected.mapping
      groups.push(
        content.concepts.some(
          (c) => c.mandatory && c.mandatoryMappingId === mapping.id,
        )
          ? 'mandatory'
          : mapping.source.kind === 'mmc_original'
            ? 'MMC'
            : content.concepts.some(
                  (c) =>
                    mapping.conceptIds.includes(c.id) &&
                    c.priority === 'B' &&
                    mapping.source.kind === 'review_stock',
                )
              ? 'B'
              : 'other',
      )
      states[mapping.id] = {
        ...initialState(mapping.id),
        firstConfirmedAt: '2026-10-04T01:00:00.000Z',
      }
    }
    expect(groups).toEqual(['MMC', 'B', 'MMC', 'other', 'MMC', 'mandatory'])
  })
  it('全161小問を日跨ぎで巡回し、既知項目は接触回数の少ない順に維持する', () => {
    let states: Record<string, ReturnType<typeof initialState>> = {}
    let history: Attempt[] = []
    const reached = new Set<string>()
    for (let i = 0; i < 300 && reached.size < content.mappings.length; i++) {
      const date = addDays('2026-10-20', i)
      const now = `${date}T01:00:00.000Z`
      const selected = selectCard(content, states, history, plan, now)!
      if (!states[selected.mapping.id]?.firstConfirmedAt)
        reached.add(selected.mapping.id)
      const nextAttempt = attempt({
        id: `journey-${i}`,
        mappingId: selected.mapping.id,
        cardId: selected.card.id,
        cueId: selected.cue.id,
        answeredAt: now,
        localDate: date,
        wasNew: !states[selected.mapping.id]?.firstConfirmedAt,
        slot: selected.slot,
      })
      history = [...history, nextAttempt]
      states = rebuildStates(history)
    }
    expect(reached.size).toBe(content.mappings.length)

    const known = content.mappings.slice(0, 3)
    const priorityStates = Object.fromEntries(
      known.map((m, i) => [
        m.id,
        {
          ...initialState(m.id),
          firstConfirmedAt: '2026-10-01T01:00:00Z',
          lastAttemptAt: `2026-10-0${i + 1}T01:00:00Z`,
          dueAt: '2026-10-05T00:00:00Z',
        },
      ]),
    )
    const repeated = [
      ...known.map((m, i) =>
        attempt({
          id: `known-${i}`,
          mappingId: m.id,
          answeredAt: '2026-10-03T01:00:00.000Z',
          localDate: '2026-10-03',
        }),
      ),
      ...Array.from({ length: 1 }, (_, i) =>
        attempt({
          id: `repeat-${i}`,
          mappingId: known[0].id,
          answeredAt: '2026-10-03T02:00:00.000Z',
          localDate: '2026-10-03',
        }),
      ),
    ]
    const choice = selectCard(
      { ...content, mappings: known },
      priorityStates,
      repeated,
      { ...plan, slotCursor: 0 },
      '2026-10-04T01:00:00.000Z',
    )!
    expect(repeated.length % 4).toBe(0)
    expect(choice.mapping.id).toBe(known[1].id)
  })
  it('期限復習も新規もない期限枠では既存の使い分けカードを出す', () => {
    const mapping = content.mappings.find((m) =>
      content.cards.some((c) => c.mappingId === m.id && c.kind === 'contrast'),
    )!
    const scopedContent = {
      ...content,
      mappings: [mapping],
      cards: content.cards.filter((c) => c.mappingId === mapping.id),
    }
    const state = {
      ...initialState(mapping.id),
      firstConfirmedAt: '2026-10-01T01:00:00Z',
      dueAt: '2026-10-05T00:00:00Z',
    }
    const history = content.mappings
      .filter((m) => m.id !== mapping.id)
      .slice(0, 2)
      .map((m, i) =>
        attempt({
          id: `cursor-${i}`,
          mappingId: m.id,
          answeredAt: '2026-10-03T01:00:00Z',
          localDate: '2026-10-03',
        }),
      )
    const result = selectCard(
      scopedContent,
      { [mapping.id]: state },
      history,
      plan,
      '2026-10-04T01:00:00.000Z',
    )!
    expect(history.length % 4).toBe(2)
    expect(result.slot).toBe('contrast')
    expect(result.card.kind).toBe('contrast')
  })
  it('期限到来枠は古い期限を先に選び、回復が必要ならcontrast cardで出す', () => {
    const mapping = content.mappings.find((m) =>
      content.cards.some((c) => c.mappingId === m.id && c.kind === 'contrast'),
    )!
    const recent = content.mappings.find((m) => m.id !== mapping.id)!
    const state = (dueAt: string, recovery = false) => ({
      ...initialState(mapping.id),
      firstConfirmedAt: '2026-10-01T01:00:00Z',
      dueAt,
      contrastRecoveryRequired: recovery,
    })
    const states = {
      [mapping.id]: state('2026-10-01T00:00:00Z', true),
      [recent.id]: {
        ...initialState(recent.id),
        firstConfirmedAt: '2026-10-01T01:00:00Z',
        dueAt: '2026-10-03T00:00:00Z',
      },
    }
    const history = [
      ...content.mappings
        .filter((m) => m.id !== mapping.id && m.id !== recent.id)
        .slice(0, 2)
        .map((m, i) =>
          attempt({
            id: `cursor-${i}`,
            mappingId: m.id,
            answeredAt: '2026-10-03T01:00:00Z',
            localDate: '2026-10-03',
          }),
        ),
      ...Array.from({ length: 4 }, (_, i) =>
        attempt({
          id: `older-repeat-${i}`,
          mappingId: mapping.id,
          answeredAt: '2026-10-03T02:00:00Z',
          localDate: '2026-10-03',
        }),
      ),
    ]
    const result = selectCard(
      content,
      states,
      history,
      plan,
      '2026-10-04T01:00:00.000Z',
    )!
    expect(result.mapping.id).toBe(mapping.id)
    expect(result.slot).toBe('due')
    expect(result.card.kind).toBe('contrast')
  })
  it('専用必須開始は必須のみ、MMC scopeはMMC独自問題のみを出す', () => {
    const mandatory = selectCard(
      content,
      {},
      [],
      plan,
      '2026-10-24T01:00:00.000Z',
      [],
      true,
    )!
    expect(
      content.concepts.some(
        (c) => c.mandatoryMappingId === mandatory.mapping.id,
      ),
    ).toBe(true)
    const mmc = selectCard(
      content,
      {},
      [],
      plan,
      '2026-10-24T01:00:00.000Z',
      [],
      false,
      'mmc',
    )!
    expect(mmc.mapping.source.kind).toBe('mmc_original')
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
