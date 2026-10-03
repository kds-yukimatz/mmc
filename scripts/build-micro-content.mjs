import { readFileSync, writeFileSync } from 'node:fs'
const read = (path) =>
  JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'))
const seed = read('scripts/micro-inputs/starter-content.json')
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
if (seed.concepts.filter((c) => c.mandatory).length !== seed.metadata.mandatoryConceptCount)
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
