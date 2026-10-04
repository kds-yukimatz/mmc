import type {
  AbstractionGradingResult,
  AbstractionInput,
  AbstractionRecord,
  FruitCategory,
  FruitConcept,
  Term,
} from '../domain/abstraction'
import { normalizeText } from './synonymNormalizer'

type Catalogs = {
  frameworks: Term[]
  categories: FruitCategory[]
  concepts: FruitConcept[]
}
const negative = [
  'しない',
  'しません',
  '不要',
  '未実施',
  '未共有',
  '共有不足',
  '未活用',
  '活用不足',
]
const viaPriority = {
  label: 0,
  synonym: 1,
  rule: 2,
  acceptable: 3,
  context: 4,
} as const
const norm = (s: string) => normalizeText(s)
const containsRule = (value: string, rules: Term['rules']) =>
  rules.some(
    (r) =>
      r.allOf.length > 0 &&
      r.allOf.every((x) => norm(value).includes(norm(x))) &&
      (!r.anyOf.length || r.anyOf.some((x) => norm(value).includes(norm(x)))) &&
      !r.noneOf.some((x) => norm(value).includes(norm(x))),
  )
function matchTerm(
  input: string,
  term: Term,
  synonyms: boolean,
): 'label' | 'synonym' | 'rule' | null {
  if (norm(input) === norm(term.label)) return 'label'
  if (!synonyms) return null
  if (term.synonyms.some((x) => norm(x) === norm(input))) return 'synonym'
  if (norm(input).length <= 80 && containsRule(input, term.rules)) return 'rule'
  return null
}
function uniqueInputs(values: string[]) {
  const seen = new Set<string>()
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = norm(value)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** Independent exact-phrase grader for abstraction practice; it never calls legacy or micro graders. */
export function gradeAbstraction(
  record: AbstractionRecord,
  input: AbstractionInput,
  catalogs: Catalogs,
  useSynonyms: boolean,
): AbstractionGradingResult {
  const shelves = uniqueInputs(input.shelves),
    // The UI accepts at most twelve fruit tags. Keep grading complexity bounded
    // even when callers bypass that input limit.
    fruits = uniqueInputs(input.fruits).slice(0, 12)
  const frameworks = uniqueInputs(input.frameworks),
    cuts = uniqueInputs(input.cuts)
  const categoryMap = new Map(catalogs.categories.map((x) => [x.id, x]))
  const conceptMap = new Map(catalogs.concepts.map((x) => [x.id, x]))
  const expected = new Set(record.fruitCategories)
  const nearbyConceptIds = new Set<string>(),
    contextMatches: string[] = [],
    unmatchedInputs: string[] = [],
    offShelfInputs: string[] = []
  for (const value of shelves) {
    const matched = catalogs.categories.filter((category) =>
      matchTerm(value, category, useSynonyms),
    )
    if (!matched.length) unmatchedInputs.push(value)
    else if (matched.every((category) => !expected.has(category.id)))
      offShelfInputs.push(value)
  }
  const shelfMatches = new Map<string, string[]>()
  for (const group of record.shelfGroups) {
    const matches = shelves.filter((value) =>
      group.categoryIds.some((id) => {
        const term = categoryMap.get(id)
        return term && matchTerm(value, term, useSynonyms)
      }),
    )
    if (matches.length) shelfMatches.set(group.id, matches)
  }
  const hits = [...shelfMatches.keys()]
  const missingShelfGroupIds = record.shelfGroups
    .map((x) => x.id)
    .filter((id) => !shelfMatches.has(id))
  const matchedCore: AbstractionGradingResult['matchedCore'] = []
  const edges: Array<{
    inputIndex: number
    coreId: string
    via: 'label' | 'synonym' | 'rule' | 'acceptable' | 'context'
    rank: number
  }> = []
  fruits.forEach((value, inputIndex) => {
    const matchingConcepts = catalogs.concepts.flatMap((concept) => {
      if (negative.some((x) => norm(value).includes(norm(x)))) return []
      const via = matchTerm(value, concept, useSynonyms)
      if (!via) return []
      return [{ concept, via }]
    })
    let recognized = matchingConcepts.length > 0
    for (const { concept } of matchingConcepts) {
      const intersection = concept.categoryIds.filter((id) => expected.has(id))
      if (!intersection.length) offShelfInputs.push(value)
      for (const cat of intersection) nearbyConceptIds.add(cat)
      const via = matchTerm(value, concept, useSynonyms)
      if (record.coreFruitKeywords.includes(concept.id) && via)
        edges.push({
          inputIndex,
          coreId: concept.id,
          via,
          rank: viaPriority[via],
        })
      for (const acceptable of record.acceptableFruitKeywords.filter(
        (x) => x.conceptId === concept.id,
      )) {
        if (acceptable.substitutesCoreId && useSynonyms && intersection.length)
          edges.push({
            inputIndex,
            coreId: acceptable.substitutesCoreId,
            via: 'acceptable',
            rank: 3,
          })
      }
    }
    for (const context of record.contextDependentKeywords) {
      if (
        norm(context.label) === norm(value) ||
        (useSynonyms && context.synonyms.some((x) => norm(x) === norm(value)))
      ) {
        contextMatches.push(context.label)
        recognized = true
        if (useSynonyms && context.impliesCoreId)
          edges.push({
            inputIndex,
            coreId: context.impliesCoreId,
            via: 'context',
            rank: 4,
          })
      }
    }
    if (!recognized) unmatchedInputs.push(value)
  })
  // Maximum-cardinality bipartite assignment, then stable via/core/input ordering.
  const sortedEdges = edges.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.coreId.localeCompare(b.coreId) ||
      a.inputIndex - b.inputIndex,
  )
  const coreIds = [...record.coreFruitKeywords].sort(),
    coreIndex = new Map(coreIds.map((id, i) => [id, i]))
  const edgeByInput = new Map<number, typeof sortedEdges>()
  for (const edge of sortedEdges)
    edgeByInput.set(edge.inputIndex, [
      ...(edgeByInput.get(edge.inputIndex) ?? []),
      edge,
    ])
  const compareAssignments = (
    left: typeof sortedEdges,
    right: typeof sortedEdges,
  ) => {
    const ordered = (items: typeof sortedEdges) =>
      items
        .slice()
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            a.coreId.localeCompare(b.coreId) ||
            a.inputIndex - b.inputIndex,
        )
    const a = ordered(left)
    const b = ordered(right)
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const difference =
        a[index].rank - b[index].rank ||
        a[index].coreId.localeCompare(b[index].coreId) ||
        a[index].inputIndex - b[index].inputIndex
      if (difference) return difference
    }
    return a.length - b.length
  }
  let states = new Map<number, typeof sortedEdges>([[0, []]])
  for (let inputIndex = 0; inputIndex < fruits.length; inputIndex++) {
    const next = new Map(states)
    for (const [mask, chosen] of states)
      for (const edge of edgeByInput.get(inputIndex) ?? []) {
        const index = coreIndex.get(edge.coreId)
        if (index === undefined) continue
        const bit = 1 << index
        if (mask & bit) continue
        const key = mask | bit,
          candidate = [...chosen, edge],
          prior = next.get(key)
        if (!prior || compareAssignments(candidate, prior) < 0)
          next.set(key, candidate)
      }
    states = next
  }
  const best =
    [...states.values()].sort(
      (a, b) => b.length - a.length || compareAssignments(a, b),
    )[0] ?? []
  for (const edge of best) {
    const concept = conceptMap.get(edge.coreId)!
    const actual = fruits[edge.inputIndex]
    const prior = matchedCore.find((x) => x.coreId === edge.coreId)
    if (!prior || viaPriority[edge.via] < viaPriority[prior.via]) {
      if (prior) matchedCore.splice(matchedCore.indexOf(prior), 1)
      matchedCore.push({ coreId: edge.coreId, actual, via: edge.via })
    }
    for (const cat of concept.categoryIds.filter((id) => expected.has(id)))
      nearbyConceptIds.add(cat)
  }
  matchedCore.sort((a, b) => a.coreId.localeCompare(b.coreId))
  const inferredCategoryIds = [...nearbyConceptIds]
  const inferredShelfGroupHits = record.shelfGroups
    .filter((group) =>
      group.categoryIds.some((id) => inferredCategoryIds.includes(id)),
    )
    .map((group) => group.id)
  // Framework/cut matching is deliberately field-specific.
  const frameworkMatches = frameworks.flatMap((value) =>
    catalogs.frameworks.some(
      (term) =>
        record.frameworkIds.includes(term.id) &&
        matchTerm(value, term, useSynonyms),
    )
      ? [value]
      : [],
  )
  const cutMatches = cuts.filter((value) =>
    record.cutTerms.some((term) => matchTerm(value, term, useSynonyms)),
  )
  const coreCredits = matchedCore.length,
    target = record.candidateTarget
  const totalShelfHits = new Set([...hits, ...inferredShelfGroupHits])
  const shelfEvidence = totalShelfHits.size > 0
  const shelfAll = totalShelfHits.size === record.shelfGroups.length
  let grade: AbstractionGradingResult['grade'],
    score: AbstractionGradingResult['score']
  if (input.mode === 'abstract-shelf') {
    if (shelfAll && !offShelfInputs.length) {
      grade = 'excellent'
      score = 100
    } else if (shelfAll || totalShelfHits.size) {
      grade = 'good'
      score = 75
    } else if (frameworkMatches.length || cutMatches.length) {
      grade = 'partial'
      score = 40
    } else {
      grade = 'miss'
      score = 0
    }
  } else if (
    target !== null &&
    coreCredits >= target &&
    shelfAll &&
    !offShelfInputs.length
  ) {
    grade = 'excellent'
    score = 100
  } else if (coreCredits >= 2 && shelfEvidence) {
    grade = 'good'
    score = 75
  } else if (coreCredits >= 1 || shelfEvidence) {
    grade = 'partial'
    score = 40
  } else {
    grade = 'miss'
    score = 0
  }
  return {
    grade,
    score,
    shelfGroupHits: hits,
    missingShelfGroupIds,
    inferredCategoryIds,
    matchedCore,
    missingCoreIds: record.coreFruitKeywords.filter(
      (id) => !matchedCore.some((x) => x.coreId === id),
    ),
    nearbyConceptIds: record.acceptableFruitKeywords
      .filter(
        (x) =>
          x.substitutesCoreId === null &&
          fruits.some((value) => {
            const c = conceptMap.get(x.conceptId)
            return c && matchTerm(value, c, useSynonyms)
          }),
      )
      .map((x) => x.conceptId),
    contextMatches,
    unmatchedInputs,
    offShelfInputs: [...new Set(offShelfInputs)],
    frameworkMatches,
    cutMatches,
    coreCredits,
    target,
  }
}
