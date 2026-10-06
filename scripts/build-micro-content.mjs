import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const read = (path) =>
  JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'))
const seed = read('scripts/micro-inputs/starter-content.json')
const baseMappingCount = seed.mappings.length
const mmcPractice = read('scripts/micro-inputs/mmc-original-practice.json')
const inventory = read('scripts/micro-inputs/frequency-inventory.json')
const base = read('public/data/kahotore_mmc_base_v2.json')
const normalize = (v) => v.normalize('NFKC').replace(/\s/g, '')
const records = base.records.filter(
  (r) =>
    [2023, 2024, 2025].includes(r.year) &&
    ['I', 'II', 'III'].includes(r.case) &&
    r.answer_status === 'verified',
)
const rawWords = [...new Set(records.flatMap((r) => r.fruit_keywords))]
const frequency = (aliases) => {
  const hits = records.filter((r) =>
    r.fruit_keywords.some((k) =>
      aliases.some((a) => normalize(a) === normalize(k)),
    ),
  )
  return {
    groups: [...new Set(hits.map((r) => r.group_id ?? r.id))].sort(),
    years: [...new Set(hits.map((r) => r.year))].sort(),
    recordIds: hits.map((r) => r.id).sort(),
    corpus: seed.metadata.frequencyCorpus,
  }
}
const equal = (a, b) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
const errors = []
if (
  records.length !== inventory.metadata.answerUnitCount ||
  new Set(records.map((r) => r.group_id ?? r.id)).size !==
    inventory.metadata.questionGroupCount ||
  rawWords.length !== inventory.metadata.rawKeywordCount
)
  errors.push('頻度母集団の件数不一致')
for (const r of inventory.records) {
  const f = frequency([r.label])
  if (
    !equal(f.groups, r.groups) ||
    !equal(f.years, r.years) ||
    !equal(f.recordIds, r.recordIds)
  )
    errors.push(`原語頻度不一致: ${r.label}`)
}
for (const c of seed.concepts) {
  const f = frequency(c.evidenceAliases)
  if (
    !equal(f.groups, c.frequency.groups) ||
    !equal(f.years, c.frequency.years) ||
    !equal(f.recordIds, c.frequency.recordIds)
  )
    errors.push(`概念頻度不一致: ${c.id}`)
  c.frequency = f
}
for (const [key, count] of Object.entries({
  concepts: seed.metadata.conceptCount,
  mappings: seed.metadata.mappingCount,
  cards: seed.metadata.cardCount,
}))
  if (
    seed[key].length !== count ||
    new Set(seed[key].map((v) => v.id)).size !== count
  )
    errors.push(`${key}件数・ID不一致`)
if (
  seed.concepts.filter((c) => c.mandatory).length !==
  seed.metadata.mandatoryConceptCount
)
  errors.push('必須件数不一致')
for (const m of seed.mappings) {
  if (
    !m.source.refs.length ||
    m.cues.length !== 2 ||
    m.answerSlots.length !== m.expectedCount ||
    !m.explanation ||
    !m.intent ||
    m.answerSlots.some(
      (s) => !s.accepted.length || !m.conceptIds.includes(s.conceptId),
    )
  )
    errors.push(`mapping不足: ${m.id}`)
  for (const cue of m.cues)
    if (!cue.prompt || cue.hintChoices.length !== 2)
      errors.push(`cue不足: ${cue.id}`)
}
for (const c of seed.cards)
  if (
    !seed.mappings.some(
      (m) => m.id === c.mappingId && m.cues.some((q) => q.id === c.cueId),
    ) ||
    (c.kind === 'contrast' && (!c.distractor || !c.contrastExplanation))
  )
    errors.push(`card不足: ${c.id}`)
for (const c of seed.concepts.filter((c) => c.mandatory))
  if (
    !seed.mappings.some(
      (m) => m.id === c.mandatoryMappingId && m.conceptIds.includes(c.id),
    )
  )
    errors.push(`必須対応不足: ${c.id}`)

// Extend the authored practice set from B-stock source terms. The B stock is
// transpiled only to read its typed data; it remains the source of every ref.
const stockModule = { exports: {} }
const stockSource = readFileSync(
  new URL('../src/data/reviewFruitStock.ts', import.meta.url),
  'utf8',
)
const stockCode = ts.transpileModule(stockSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
new Function('require', 'module', 'exports', stockCode)(
  require,
  stockModule,
  stockModule.exports,
)
const bStocks = stockModule.exports.reviewFruitStock.filter(
  (stock) => stock.priority === 'B',
)
const answerKey = (value) => normalize(value)
const targetedPrompt = new Map([
  [
    '専門知識を活用した提案販売力',
    '顧客の使い方に合う商品を、専門知識を生かして勧める強みは？',
  ],
  ['適正配置', '従業員の希望と能力を生かして人材を置く施策は？'],
  ['柔軟な勤務形態', '生活事情が変わっても働き続けやすくする勤務制度は？'],
  ['計画的OJT', '現場内で育成水準をそろえるため、計画して行う指導法は？'],
  ['外部研修', '現場内指導を補い、社外の知識・技能を学ばせる施策は？'],
  ['公平・公正な評価', '従業員の納得感を高めるため、人事制度で整えるものは？'],
  ['既存経営資源の活用', '新しい事業でも既存の知識や人材を使う方針は？'],
  [
    '特定事業への依存脱却',
    '主力事業の売上変動に経営全体が左右される状態を避ける方針は？',
  ],
  ['経営リスク分散', '収益源を複数にし、単一事業の変動を和らげる狙いは？'],
  ['事業部制', '事業ごとに意思決定と利益管理を担わせる組織形態は？'],
  ['利益責任の明確化', '事業別組織で各事業の採算を明らかにすることは？'],
  ['権限委譲', '経営者に集中した意思決定を現場へ移す施策は？'],
  [
    '定期会議による情報共有',
    '拠点間で実績や方法を継続的に共有する場を設ける施策は？',
  ],
  ['販促不足', '受け身の情報掲載にとどまり、販促が足りない弱みは？'],
  [
    '新規顧客開拓不足',
    '固定客に頼り、新しい顧客を積極的に増やしていない弱みは？',
  ],
  ['HPによる情報発信', '店舗や商品の情報を自社ウェブサイトから届ける施策は？'],
  ['SNSによる共有', '既存顧客とネット上で情報をやり取りする媒体は？'],
  ['顧客ニーズ収集', '顧客の要望や活用上の課題を把握する活動は？'],
  ['高級品', '品質を重視する顧客層の需要に応える商品は？'],
  ['贈答品', '贈り物としての需要に対応する商品展開は？'],
  ['オリジナル商品', '自店ならではの商品で品揃えを差別化する施策は？'],
  ['親子体験教室', '家族で参加し、商品や製造への理解を深める催しは？'],
  ['定期開催', '顧客との接点を一度で終わらせず継続させる開催方法は？'],
  ['工場見学', '製造現場を見てもらい、商品への理解を促す催しは？'],
  ['かんばん方式', '後工程の必要量に合わせて前工程へ生産を指示する方式は？'],
  [
    '繰返注文情報の活用',
    '過去から続く注文量の変化を生産判断に反映することは？',
  ],
  ['生産ロットの適正化', '受注量に合わせ、過大な一括生産を抑えることは？'],
  ['TPM', '全員参加で設備の保全活動を進める考え方は？'],
  ['ポカヨケ', '工具・治具の取り付けなどで起きる単純ミスを防ぐ仕組みは？'],
  ['設備増強', '既存設備の能力不足を、設備の追加で補う施策は？'],
  ['設備改良', '設備自体に手を加えて生産上の制約を減らす施策は？'],
  ['作業標準化', '熟練者ごとに異なる加工手順を共通の手順へそろえることは？'],
  [
    'マニュアル化',
    '決めた作業手順を文書にして誰もが参照できるようにすることは？',
  ],
  [
    'マイスター制度',
    '熟練者の技能を認定・指導役と結び付けて継承する仕組みは？',
  ],
])
const covered = new Set(
  seed.mappings.flatMap((mapping) => {
    const ref = mapping.source.refs.find((value) =>
      value.startsWith('src/data/reviewFruitStock.ts#'),
    )
    return ref
      ? mapping.answerSlots.flatMap((slot) =>
          slot.accepted.map((word) => `${ref}::${answerKey(word)}`),
        )
      : []
  }),
)
const additions = []
const product = bStocks.find(
  (stock) => stock.id === 'stock-I-product-comparison',
)
if (!product || product.fruitKeywords.length !== 2)
  errors.push('比較ストックの二要素が不正')
else
  additions.push({
    stock: product,
    words: product.fruitKeywords,
    intent: 'comparison',
  })
for (const stock of bStocks) {
  if (stock === product) continue
  for (const word of stock.fruitKeywords) {
    const ref = `src/data/reviewFruitStock.ts#${stock.id}`
    if (!covered.has(`${ref}::${answerKey(word)}`))
      additions.push({
        stock,
        words: [word],
        intent:
          stock.id === 'stock-II-marketing-shortage'
            ? 'weakness'
            : word === '経営リスク分散'
              ? 'benefit'
              : 'action',
      })
  }
}
for (const [index, addition] of additions.entries()) {
  const conceptIds = addition.words.map((word) => {
    let concept = seed.concepts.find((item) =>
      [item.label, ...item.evidenceAliases].some(
        (alias) => answerKey(alias) === answerKey(word),
      ),
    )
    if (!concept) {
      const id = `fruit-${String(seed.concepts.length + 1).padStart(2, '0')}`
      concept = {
        id,
        label: word,
        evidenceAliases: [word],
        mandatory: false,
        mandatoryMappingId: null,
        selectionReason:
          '既存Bランク復習ストックを題意別に小問化する設計選定。資料内頻度とは別。',
        priority: 'B',
        frequency: frequency([word]),
      }
      seed.concepts.push(concept)
    }
    return concept.id
  })
  const stock = addition.stock
  const mappingId = `map-${String(baseMappingCount + index + 1).padStart(2, '0')}`
  const ref = `src/data/reviewFruitStock.ts#${stock.id}`
  const context = stock.purpose ?? stock.cause ?? stock.trigger
  const target =
    addition.words.length === 2
      ? '購入後の接点が短い商品と長く続く商品の違いを、同じ比較軸で答える。'
      : (targetedPrompt.get(addition.words[0]) ??
        `${stock.trigger}。${context}。この条件に対応する果を一つ答える。`)
  if (addition.words.length === 1 && !targetedPrompt.has(addition.words[0]))
    errors.push(`B小問の個別cue未作成: ${addition.words[0]}`)
  const paraphrase =
    addition.words.length === 2
      ? '購入後に相談や保守で接点が続く商品と、購入時で接点が終わる商品を対比する。'
      : `${stock.trigger}。${target.replace(/[？?]$/, '。')}`
  const explanation = `${context.replace(/[。．.!！?？\s]+$/, '')}。この小問では「${addition.words.join('・')}」の接続を確認する。`
  const hintDistractor =
    addition.words.length === 2
      ? '品質・価格など別の比較軸'
      : (bStocks
          .find(
            (other) =>
              other.case === stock.case &&
              other.shelf === stock.shelf &&
              other.id !== stock.id,
          )
          ?.fruitKeywords.find((word) => !addition.words.includes(word)) ??
        seed.mappings.find(
          (other) =>
            other.case === stock.case &&
            other.intent === addition.intent &&
            other.answerSlots[0]?.accepted[0] !== addition.words[0],
        )?.answerSlots[0]?.accepted[0] ??
        '別の施策')
  const mapping = {
    id: mappingId,
    conceptIds,
    case: stock.case,
    intent: addition.intent,
    expectedCount: addition.words.length,
    answerSlots: addition.words.map((word, slot) => ({
      conceptId: conceptIds[slot],
      accepted: [word],
    })),
    explanation,
    source: { kind: 'review_stock', refs: [ref] },
    cues: [
      {
        id: `${mappingId}-cue-1`,
        prompt: target,
        hintChoices: [addition.words.join('・'), hintDistractor],
      },
      {
        id: `${mappingId}-cue-2`,
        prompt: paraphrase,
        hintChoices: [addition.words.join('・'), hintDistractor],
      },
    ],
  }
  seed.mappings.push(mapping)
  for (const cue of mapping.cues)
    seed.cards.push({
      id: `${cue.id}-recall`,
      mappingId,
      cueId: cue.id,
      kind: 'recall',
    })
}
for (const stock of bStocks) {
  const ref = `src/data/reviewFruitStock.ts#${stock.id}`
  const accepted = seed.mappings
    .filter((mapping) => mapping.source.refs.includes(ref))
    .flatMap((mapping) =>
      mapping.answerSlots.flatMap((slot) => slot.accepted.map(answerKey)),
    )
  for (const word of stock.fruitKeywords)
    if (!accepted.includes(answerKey(word)))
      errors.push(`Bストック未小問化: ${stock.id}/${word}`)
}
const mmcConceptIds = new Set(seed.concepts.map((c) => c.id))
const mmcMappingIds = new Set(seed.mappings.map((m) => m.id))
const mmcCardIds = new Set(seed.cards.map((c) => c.id))
const reusedConceptIds = new Set(mmcPractice.metadata.reuseConceptIds)
for (const concept of mmcPractice.concepts) {
  if (reusedConceptIds.has(concept.id)) {
    if (!seed.concepts.some((existing) => existing.id === concept.id))
      errors.push(`MMC再利用概念が既存教材にない: ${concept.id}`)
    continue
  }
  if (mmcConceptIds.has(concept.id)) errors.push(`MMC概念ID重複: ${concept.id}`)
  mmcConceptIds.add(concept.id)
  seed.concepts.push(concept)
}
for (const mapping of mmcPractice.mappings) {
  if (mmcMappingIds.has(mapping.id)) errors.push(`MMC問題ID重複: ${mapping.id}`)
  mmcMappingIds.add(mapping.id)
  if (mapping.source.kind !== 'mmc_original' || !mapping.source.refs.length)
    errors.push(`MMC問題の出典不足: ${mapping.id}`)
  if (mapping.conceptIds.some((id) => !mmcConceptIds.has(id)))
    errors.push(`MMC問題の概念不足: ${mapping.id}`)
  seed.mappings.push(mapping)
}
for (const card of mmcPractice.cards) {
  if (mmcCardIds.has(card.id)) errors.push(`MMCカードID重複: ${card.id}`)
  mmcCardIds.add(card.id)
  seed.cards.push(card)
}
if (
  mmcPractice.mappings.length !== mmcPractice.metadata.addedMappingCount ||
  mmcPractice.cards.length !== mmcPractice.metadata.addedCardCount ||
  mmcPractice.concepts.length !== mmcPractice.metadata.addedConceptCount
)
  errors.push('MMC独自問題の登録件数が設計メタデータと不一致')
if (bStocks.length !== 22) errors.push(`Bストック件数不一致: ${bStocks.length}`)
seed.metadata.version = 'micro-seed-3'
seed.metadata.note =
  '既存練習は設計者作成の汎用練習。MMC CS3/CS4の独自短問は解説を根拠に再設計し、原問題・原答案を転載していない。独自問題は本試頻度に含めない。'
seed.metadata.conceptCount = seed.concepts.length
seed.metadata.mappingCount = seed.mappings.length
seed.metadata.cardCount = seed.cards.length
const report = {
  version: seed.metadata.version,
  answerUnits: records.length,
  groups: new Set(records.map((r) => r.group_id ?? r.id)).size,
  rawKeywords: rawWords.length,
  concepts: seed.concepts.length,
  mappings: seed.mappings.length,
  recallCards: seed.cards.filter((c) => c.kind === 'recall').length,
  contrastCards: seed.cards.filter((c) => c.kind === 'contrast').length,
  mandatory: seed.concepts.filter((c) => c.mandatory).length,
  bStocks: bStocks.length,
  bStockMappings: additions.length,
  mmcOriginalMappings: mmcPractice.mappings.length,
  mmcOriginalCards: mmcPractice.cards.length,
  mmcOriginalConcepts: mmcPractice.metadata.addedConceptCount,
  excluded: errors,
}
writeFileSync(
  new URL('../public/data/micro-content-validation.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
)
if (errors.length) throw new Error(errors.join('\n'))
writeFileSync(
  new URL('../public/data/micro-content-v1.json', import.meta.url),
  JSON.stringify(seed, null, 2) + '\n',
)
console.log(JSON.stringify(report))
