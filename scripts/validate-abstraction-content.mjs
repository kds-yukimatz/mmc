import { readFileSync } from 'node:fs'

const fail = []
const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const data = read('../public/data/kahotore_abstraction_v1.json')
const base = read('../public/data/kahotore_mmc_base_v2.json')
const questionIds = new Set(base.records.map((q) => q.id))
const id = /^[a-z0-9-]+$/
const unique = (items, name) => {
  const ids = new Set(),
    labels = new Set()
  for (const x of items) {
    const label = x.label
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]/gu, '')
    if (!id.test(x.id) || ids.has(x.id))
      fail.push(`${name}: invalid/duplicate id ${x.id}`)
    if (!label || labels.has(label))
      fail.push(`${name}: empty/duplicate normalized label ${x.label}`)
    ids.add(x.id)
    labels.add(label)
  }
}
if (
  data.schema_version !== 1 ||
  !data.metadata?.version ||
  !/^\w{40}$/.test(data.metadata.base_commit) ||
  !data.metadata.note ||
  !['frameworks', 'categories', 'concepts', 'records'].every((k) =>
    Array.isArray(data[k]),
  )
)
  fail.push('manifest required fields')
unique(data.frameworks ?? [], 'framework')
unique(data.categories ?? [], 'category')
unique(data.concepts ?? [], 'concept')
const categories = new Map((data.categories ?? []).map((x) => [x.id, x])),
  concepts = new Map((data.concepts ?? []).map((x) => [x.id, x])),
  frameworks = new Map((data.frameworks ?? []).map((x) => [x.id, x]))
for (const c of data.concepts ?? [])
  for (const id of c.category_ids ?? [])
    if (!categories.has(id)) fail.push(`${c.id}: unknown category ${id}`)
unique(
  (data.records ?? []).map((x) => ({ id: x.id, label: x.abstract_question })),
  'record',
)
for (const r of data.records ?? []) {
  if (
    !id.test(r.id) ||
    !['I', 'II', 'III'].includes(r.case) ||
    !r.abstract_question?.trim() ||
    !Number.isInteger(r.content_revision) ||
    r.content_revision < 1
  )
    fail.push(`${r.id}: required field invalid`)
  if (
    !Array.isArray(r.source_refs) ||
    !r.source_refs.length ||
    r.source_refs.some(
      (x) =>
        (x.kind === 'base_question' && !questionIds.has(x.id)) ||
        !['base_question', 'trigger', 'practice', 'review_stock'].includes(
          x.kind,
        ) ||
        !x.id,
    )
  )
    fail.push(`${r.id}: invalid source reference`)
  if (
    r.case === 'IV' ||
    r.source_refs.some(
      (x) => x.kind === 'private_question' || x.id.startsWith('private-'),
    )
  )
    fail.push(`${r.id}: IV/private sources are not allowed`)
  if (
    !['reviewed', 'draft'].includes(r.editorial?.status) ||
    !r.editorial?.note
  )
    fail.push(`${r.id}: editorial metadata missing`)
  if (
    r.editorial?.status === 'reviewed' &&
    (!r.editorial.reviewer ||
      !Number.isFinite(Date.parse(r.editorial.reviewed_at)))
  )
    fail.push(`${r.id}: reviewed record lacks reviewer/timestamp`)
  const groups = r.shelf_groups ?? [],
    flatten = groups.flatMap((g) => g.category_ids ?? [])
  if (
    groups.length < 1 ||
    groups.length > 2 ||
    groups.some((g) => !g.id || !g.category_ids?.length) ||
    new Set(flatten).size !== flatten.length ||
    [...flatten].sort().join('|') !==
      [...(r.fruit_categories ?? [])].sort().join('|')
  )
    fail.push(`${r.id}: shelf group/category mismatch`)
  for (const fw of r.framework_ids ?? [])
    if (!frameworks.has(fw)) fail.push(`${r.id}: unknown framework ${fw}`)
  const core = r.core_fruit_keywords ?? [],
    b = (r.modes ?? []).includes('abstract-fruit'),
    a = (r.modes ?? []).includes('abstract-shelf')
  if (
    !a ||
    b !== core.length > 0 ||
    (b &&
      (core.length < 2 ||
        core.length > 6 ||
        ![2, 3].includes(r.candidate_target) ||
        r.candidate_target > core.length)) ||
    (!b &&
      (core.length ||
        r.acceptable_fruit_keywords?.length ||
        r.candidate_target !== null))
  )
    fail.push(`${r.id}: invalid modes/core/target`)
  const coverage = new Set()
  for (const cid of core) {
    const c = concepts.get(cid)
    if (!c) {
      fail.push(`${r.id}: unknown core ${cid}`)
      continue
    }
    for (const cat of c.category_ids ?? [])
      if (r.fruit_categories.includes(cat)) coverage.add(cat)
    if (!(c.category_ids ?? []).some((cat) => r.fruit_categories.includes(cat)))
      fail.push(`${r.id}: core is outside expected shelf ${cid}`)
  }
  if (
    b &&
    r.shelf_groups.some((g) => !g.category_ids.some((id) => coverage.has(id)))
  )
    fail.push(`${r.id}: core categories do not cover each shelf group`)
  for (const x of r.acceptable_fruit_keywords ?? []) {
    const c = concepts.get(x.concept_id)
    if (
      !c ||
      core.includes(x.concept_id) ||
      (x.substitutes_core_id && !core.includes(x.substitutes_core_id)) ||
      (x.substitutes_core_id &&
        !c.category_ids.some((id) => r.fruit_categories.includes(id)))
    )
      fail.push(`${r.id}: invalid acceptable candidate ${x.concept_id}`)
  }
  const transfers = (r.variants ?? []).filter((x) => x.role === 'transfer')
  if (
    (b && transfers.length !== 2) ||
    (!b && transfers.length !== 0) ||
    transfers.some((x) => !x.text?.trim()) ||
    new Set((r.variants ?? []).map((x) => x.id)).size !==
      (r.variants ?? []).length
  )
    fail.push(`${r.id}: transfer variants invalid`)
}
if (
  data.records?.length !== 8 ||
  data.records.filter((r) => r.modes.includes('abstract-fruit')).length !== 6
)
  fail.push('initial reviewed dataset must have 8 total / 6 fruit records')
if (fail.length) {
  console.error(fail.join('\n'))
  process.exitCode = 1
} else
  console.log(
    '抽象題意教材: 8 records / 6 fruit records / source, catalog, shelf and variant checks passed',
  )
