import raw from '../../public/data/kahotore_abstraction_v1.json'
import type {
  AbstractionContent,
  AbstractionRecord,
  FruitCategory,
  FruitConcept,
  Term,
} from '../domain/abstraction'
import { normalizeText } from '../services/synonymNormalizer'
import rawBase from '../../public/data/kahotore_mmc_base_v2.json'
import rawTriggers from '../../public/data/kahotore_trigger_dictionary_v1.json'
import rawPractice from '../../public/data/kahotore_weakness_practice_v1.json'
import { reviewFruitStock } from '../data/reviewFruitStock'

const row = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v))
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')
const ruleParts = (rule: Record<string, unknown>) => ({
  allOf: rule.all_of ?? rule.allOf,
  anyOf: rule.any_of ?? rule.anyOf,
  noneOf: rule.none_of ?? rule.noneOf,
})
const validRules = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.every((rule) => {
    if (!row(rule)) return false
    const { allOf, anyOf, noneOf } = ruleParts(rule)
    return (
      strings(allOf) &&
      allOf.length > 0 &&
      strings(anyOf) &&
      strings(noneOf) &&
      allOf.every((x) => x.trim()) &&
      anyOf.every((x) => x.trim()) &&
      noneOf.every((x) => x.trim())
    )
  })
const validId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9-]+$/.test(v)
const emptyContent = (): AbstractionContent => ({
  schemaVersion: 1,
  metadata: { version: '', baseCommit: '', note: '' },
  frameworks: [],
  categories: [],
  concepts: [],
  records: [],
})
const term = (r: Record<string, unknown>): Term => ({
  id: r.id as string,
  label: r.label as string,
  synonyms: (r.synonyms ?? []) as string[],
  rules: ((r.rules ?? []) as Record<string, unknown>[]).map((rule) => {
    const parts = ruleParts(rule)
    return {
      allOf: parts.allOf as string[],
      anyOf: parts.anyOf as string[],
      noneOf: parts.noneOf as string[],
    }
  }),
})
export function parseAbstractionContent(value: unknown): AbstractionContent {
  if (
    !row(value) ||
    value.schema_version !== 1 ||
    !row(value.metadata) ||
    !['frameworks', 'categories', 'concepts', 'records'].every((key) =>
      Array.isArray(value[key]),
    )
  )
    throw new Error('抽象題意教材の形式が正しくありません')
  const metadata = value.metadata
  if (
    typeof metadata.version !== 'string' ||
    typeof metadata.base_commit !== 'string' ||
    typeof metadata.note !== 'string' ||
    !metadata.version.trim() ||
    !metadata.note.trim() ||
    typeof metadata.base_commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(metadata.base_commit)
  )
    throw new Error('抽象題意教材のmetadataが正しくありません')
  const mapTerm = (v: unknown): Term => {
    if (
      !row(v) ||
      typeof v.id !== 'string' ||
      typeof v.label !== 'string' ||
      !v.label.trim() ||
      (v.synonyms !== undefined && !strings(v.synonyms)) ||
      (v.rules !== undefined && !validRules(v.rules)) ||
      (v.synonyms !== undefined && v.synonyms.some((x) => !x.trim()))
    )
      throw new Error('用語カタログに不正な項目があります')
    return term(v)
  }
  const frameworks = (value.frameworks as unknown[]).map(mapTerm)
  const categories: FruitCategory[] = (value.categories as unknown[]).map(
    (v) => {
      if (
        !row(v) ||
        !Array.isArray(v.cases) ||
        !v.cases.every((c) => ['I', 'II', 'III'].includes(c as string))
      )
        throw new Error('棚カタログが不正です')
      return { ...mapTerm(v), cases: v.cases as FruitCategory['cases'] }
    },
  )
  const concepts: FruitConcept[] = (value.concepts as unknown[]).map((v) => {
    if (
      !row(v) ||
      !strings((v as Record<string, unknown>).category_ids) ||
      !strings((v as Record<string, unknown>).micro_concept_ids ?? [])
    )
      throw new Error('果カタログが不正です')
    return {
      ...mapTerm(v),
      categoryIds: v.category_ids as string[],
      microConceptIds: (v.micro_concept_ids ?? []) as string[],
    }
  })
  const records: AbstractionRecord[] = (value.records as unknown[]).map((v) => {
    if (
      !row(v) ||
      !validId(v.id) ||
      !['I', 'II', 'III'].includes(v.case as string) ||
      typeof v.abstract_question !== 'string' ||
      !v.abstract_question.trim() ||
      !Number.isInteger(v.content_revision) ||
      Number(v.content_revision) < 1 ||
      !row(v.editorial)
    )
      throw new Error('抽象題意recordが不正です')
    const r = v
    const requiredArrays = [
      'source_refs',
      'fruit_categories',
      'shelf_groups',
      'core_fruit_keywords',
      'modes',
    ]
    if (
      requiredArrays.some((k) => !Array.isArray(r[k])) ||
      !strings(r.fruit_categories) ||
      !strings(r.core_fruit_keywords) ||
      !strings(r.modes) ||
      !r.modes.every((m) => ['abstract-shelf', 'abstract-fruit'].includes(m)) ||
      !Array.isArray(r.source_refs) ||
      !r.source_refs.every(
        (x) =>
          row(x) &&
          ['base_question', 'trigger', 'practice', 'review_stock'].includes(
            x.kind as string,
          ) &&
          typeof x.id === 'string' &&
          x.id.trim(),
      ) ||
      (r.framework_ids !== undefined && !strings(r.framework_ids)) ||
      (r.cut_terms !== undefined &&
        (!Array.isArray(r.cut_terms) ||
          !r.cut_terms.every(
            (x) =>
              row(x) &&
              validId(x.id) &&
              typeof x.label === 'string' &&
              x.label.trim() &&
              (x.synonyms === undefined || strings(x.synonyms)) &&
              (x.rules === undefined || validRules(x.rules)),
          ))) ||
      (r.variants !== undefined &&
        (!Array.isArray(r.variants) ||
          !r.variants.every(
            (x) =>
              row(x) &&
              validId(x.id) &&
              typeof x.text === 'string' &&
              x.text.trim() &&
              ['practice', 'transfer'].includes(x.role as string),
          ))) ||
      !Array.isArray(r.shelf_groups) ||
      !r.shelf_groups.every(
        (x) =>
          row(x) &&
          validId(x.id) &&
          strings(x.category_ids) &&
          x.category_ids.length > 0,
      ) ||
      !row(r.editorial) ||
      r.editorial.kind !== 'designed_practice' ||
      (r.editorial.status !== undefined &&
        !['draft', 'reviewed'].includes(r.editorial.status as string)) ||
      typeof r.editorial.note !== 'string' ||
      !r.editorial.note.trim() ||
      (r.editorial.reviewer !== undefined &&
        r.editorial.reviewer !== null &&
        typeof r.editorial.reviewer !== 'string') ||
      (r.editorial.reviewed_at !== undefined &&
        r.editorial.reviewed_at !== null &&
        typeof r.editorial.reviewed_at !== 'string') ||
      (r.acceptable_fruit_keywords !== undefined &&
        (!Array.isArray(r.acceptable_fruit_keywords) ||
          !r.acceptable_fruit_keywords.every(
            (x) =>
              row(x) &&
              typeof x.concept_id === 'string' &&
              (x.substitutes_core_id === undefined ||
                x.substitutes_core_id === null ||
                typeof x.substitutes_core_id === 'string'),
          ))) ||
      (r.context_dependent_keywords !== undefined &&
        (!Array.isArray(r.context_dependent_keywords) ||
          !r.context_dependent_keywords.every(
            (x) =>
              row(x) &&
              typeof x.label === 'string' &&
              x.label.trim() &&
              (x.synonyms === undefined || strings(x.synonyms)) &&
              typeof x.reason === 'string' &&
              x.reason.trim() &&
              (x.implies_core_id === null ||
                x.implies_core_id === undefined ||
                typeof x.implies_core_id === 'string'),
          ))) ||
      (r.weakness_tags !== undefined && !strings(r.weakness_tags)) ||
      (r.candidate_target !== undefined &&
        r.candidate_target !== null &&
        ![2, 3].includes(r.candidate_target as number))
    )
      throw new Error(`record ${r.id} の必須項目が不正です`)
    const acceptable = (r.acceptable_fruit_keywords ?? []) as Record<
      string,
      unknown
    >[]
    const context = (r.context_dependent_keywords ?? []) as Record<
      string,
      unknown
    >[]
    const result: AbstractionRecord = {
      id: r.id as string,
      case: r.case as AbstractionRecord['case'],
      abstractQuestion: r.abstract_question as string,
      variants: ((r.variants ?? []) as Record<string, unknown>[]).map((x) => ({
        id: x.id as string,
        text: x.text as string,
        role: x.role as 'practice' | 'transfer',
      })),
      sourceRefs: (r.source_refs as Record<string, unknown>[]).map((x) => ({
        kind: x.kind as AbstractionRecord['sourceRefs'][number]['kind'],
        id: x.id as string,
      })),
      frameworkIds: (r.framework_ids ?? []) as string[],
      cutTerms: ((r.cut_terms ?? []) as Record<string, unknown>[]).map((x) => ({
        ...term(x),
      })),
      fruitCategories: r.fruit_categories as string[],
      shelfGroups: (r.shelf_groups as Record<string, unknown>[]).map((x) => ({
        id: x.id as string,
        categoryIds: x.category_ids as string[],
      })),
      coreFruitKeywords: r.core_fruit_keywords as string[],
      acceptableFruitKeywords: acceptable.map((x) => ({
        conceptId: x.concept_id as string,
        substitutesCoreId: (x.substitutes_core_id as string | null) ?? null,
      })),
      contextDependentKeywords: context.map((x) => ({
        label: x.label as string,
        synonyms: (x.synonyms ?? []) as string[],
        reason: x.reason as string,
        impliesCoreId: (x.implies_core_id as string | null) ?? null,
      })),
      candidateTarget: (r.candidate_target ?? null) as 2 | 3 | null,
      modes: r.modes as AbstractionRecord['modes'],
      weaknessTags: (r.weakness_tags ?? []) as string[],
      editorial: {
        kind: 'designed_practice',
        status: (r.editorial.status ?? 'draft') as 'draft' | 'reviewed',
        reviewer: (r.editorial.reviewer as string | null) ?? null,
        reviewedAt: (r.editorial.reviewed_at as string | null) ?? null,
        note: r.editorial.note,
      },
      contentRevision: r.content_revision as number,
    }
    return result
  })
  return {
    schemaVersion: 1,
    metadata: {
      version: metadata.version,
      baseCommit: metadata.base_commit,
      note: metadata.note,
    },
    frameworks,
    categories,
    concepts,
    records,
  }
}

const parseErrors: string[] = []
export const abstractionContent = (() => {
  try {
    return parseAbstractionContent(raw)
  } catch (error) {
    parseErrors.push(
      error instanceof Error ? error.message : '抽象題意教材を解析できません',
    )
    return emptyContent()
  }
})()
export const abstractionCatalogs = {
  frameworks: abstractionContent.frameworks,
  categories: abstractionContent.categories,
  concepts: abstractionContent.concepts,
}
export function validateAbstractionContent(
  content = abstractionContent,
): string[] {
  const errors: string[] = [...parseErrors],
    idPattern = /^[a-z0-9-]+$/
  const unique = (items: { id: string; label: string }[], name: string) => {
    const ids = new Set<string>(),
      labels = new Set<string>()
    for (const item of items) {
      if (!idPattern.test(item.id) || ids.has(item.id))
        errors.push(`${name} id不正/重複: ${item.id}`)
      ids.add(item.id)
      const label = normalizeText(item.label)
      if (!label || labels.has(label))
        errors.push(`${name} label不正/重複: ${item.label}`)
      labels.add(label)
    }
  }
  unique(content.frameworks, 'framework')
  unique(content.categories, 'category')
  unique(content.concepts, 'concept')
  unique(
    content.records.map((r) => ({ id: r.id, label: r.abstractQuestion })),
    'record',
  )
  const categoryIds = new Set(content.categories.map((x) => x.id)),
    conceptMap = new Map(content.concepts.map((x) => [x.id, x])),
    frameworkIds = new Set(content.frameworks.map((x) => x.id))
  for (const c of content.concepts)
    if (c.categoryIds.some((x) => !categoryIds.has(x)))
      errors.push(`${c.id}: unknown category`)
  const sourceIds: Record<
    AbstractionRecord['sourceRefs'][number]['kind'],
    Set<string>
  > = {
    base_question: new Set(
      (rawBase.records as { id: string }[]).map((x) => x.id),
    ),
    trigger: new Set(
      (rawTriggers.records as { id: string }[]).map((x) => x.id),
    ),
    practice: new Set(
      (rawPractice.records as { id: string }[]).map((x) => x.id),
    ),
    review_stock: new Set(reviewFruitStock.map((x) => x.id)),
  }
  for (const r of content.records) {
    if (
      !['I', 'II', 'III'].includes(r.case) ||
      !r.sourceRefs.length ||
      r.sourceRefs.some(
        (x) => /^private/i.test(x.id) || !sourceIds[x.kind]?.has(x.id),
      )
    )
      errors.push(`${r.id}: case/source reference invalid`)
    if (
      !r.editorial.note ||
      (r.editorial.status === 'reviewed' &&
        (!r.editorial.reviewer ||
          !r.editorial.reviewedAt ||
          !Number.isFinite(Date.parse(r.editorial.reviewedAt)) ||
          !/^\d{4}-\d\d-\d\dT.*Z$/.test(r.editorial.reviewedAt)))
    )
      errors.push(`${r.id}: editorial review invalid`)
    if (!r.shelfGroups.length || r.shelfGroups.length > 2)
      errors.push(`${r.id}: shelf group count invalid`)
    const groups = r.shelfGroups.flatMap((g) => g.categoryIds),
      uniqueGroups = new Set(groups)
    if (
      groups.some((x) => !categoryIds.has(x)) ||
      groups.length !== uniqueGroups.size ||
      [...groups].sort().join('|') !== [...r.fruitCategories].sort().join('|')
    )
      errors.push(`${r.id}: shelves do not match categories`)
    if (r.frameworkIds.some((x) => !frameworkIds.has(x)))
      errors.push(`${r.id}: unknown framework`)
    if (
      r.coreFruitKeywords.some((x) => !conceptMap.has(x)) ||
      (r.coreFruitKeywords.length &&
        (r.coreFruitKeywords.length < 2 ||
          r.coreFruitKeywords.length > 6 ||
          ![2, 3].includes(r.candidateTarget as number) ||
          (r.candidateTarget ?? 0) > r.coreFruitKeywords.length))
    )
      errors.push(`${r.id}: core/target invalid`)
    if (
      !r.coreFruitKeywords.length &&
      (r.candidateTarget !== null || r.acceptableFruitKeywords.length)
    )
      errors.push(`${r.id}: shelf-only record has fruit targets`)
    if (
      r.coreFruitKeywords.some(
        (id) =>
          !conceptMap
            .get(id)
            ?.categoryIds.some((cat) => r.fruitCategories.includes(cat)),
      )
    )
      errors.push(`${r.id}: core shelf mismatch`)
    if (
      r.acceptableFruitKeywords.some(
        (x) =>
          !conceptMap.has(x.conceptId) ||
          (x.substitutesCoreId &&
            !r.coreFruitKeywords.includes(x.substitutesCoreId)),
      )
    )
      errors.push(`${r.id}: acceptable reference invalid`)
    const substituted = new Set<string>()
    for (const item of r.acceptableFruitKeywords) {
      if (item.substitutesCoreId && substituted.has(item.conceptId))
        errors.push(
          `${r.id}: acceptable concept maps to multiple core concepts`,
        )
      if (item.substitutesCoreId) substituted.add(item.conceptId)
      const concept = conceptMap.get(item.conceptId)
      if (
        item.substitutesCoreId &&
        concept &&
        !concept.categoryIds.some((id) => r.fruitCategories.includes(id))
      )
        errors.push(`${r.id}: acceptable concept shelf mismatch`)
    }
    if (
      r.coreFruitKeywords.length &&
      r.shelfGroups.some(
        (group) =>
          !group.categoryIds.some((id) =>
            r.coreFruitKeywords.some((core) =>
              conceptMap.get(core)?.categoryIds.includes(id),
            ),
          ),
      )
    )
      errors.push(`${r.id}: core does not cover every shelf group`)
    for (const context of r.contextDependentKeywords)
      if (
        context.impliesCoreId &&
        !r.coreFruitKeywords.includes(context.impliesCoreId)
      )
        errors.push(`${r.id}: context implication is outside core`)
    if (
      r.variants.filter((x) => x.role === 'transfer').length !==
        (r.coreFruitKeywords.length ? 2 : 0) ||
      r.variants.some((x) => !x.text.trim())
    )
      errors.push(`${r.id}: variants invalid`)
    if (
      r.modes.includes('abstract-fruit') !== Boolean(r.coreFruitKeywords.length)
    )
      errors.push(`${r.id}: mode/core mismatch`)
  }
  return errors
}
export const abstractionContentErrors = validateAbstractionContent()
export const abstractionIsReady = abstractionContentErrors.length === 0
