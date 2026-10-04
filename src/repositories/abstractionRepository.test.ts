import { describe, expect, it } from 'vitest'
import raw from '../../public/data/kahotore_abstraction_v1.json'
import { parseAbstractionContent } from './abstractionRepository'

type RuleFixture = {
  allOf?: string[]
  anyOf?: string[]
  noneOf?: string[]
  all_of?: string[]
  any_of?: string[]
  none_of?: string[]
}
type ContentFixture = {
  records: Array<{
    id: string
    editorial: { status?: string; [key: string]: unknown }
    source_refs?: unknown[]
    acceptable_fruit_keywords: Array<{
      concept_id: string
      substitutes_core_id?: string | null
      [key: string]: unknown
    }>
  }>
  concepts: Array<{ id: string; rules: RuleFixture[]; [key: string]: unknown }>
  [key: string]: unknown
}

const fixture = () => structuredClone(raw) as unknown as ContentFixture

describe('parseAbstractionContent', () => {
  it('applies draft and null defaults and converts snake-case expression rules', () => {
    const input = fixture()
    const record = input.records[0]
    delete record.editorial.status
    const acceptableRecord = input.records.find(
      (candidate) => candidate.acceptable_fruit_keywords.length,
    )!
    delete acceptableRecord.acceptable_fruit_keywords[0].substitutes_core_id
    const concept = input.concepts.find((candidate) => candidate.rules.length)!
    const rule = concept.rules[0]
    rule.all_of = rule.allOf
    rule.any_of = rule.anyOf
    rule.none_of = rule.noneOf
    delete rule.allOf
    delete rule.anyOf
    delete rule.noneOf

    const parsed = parseAbstractionContent(input)

    expect(parsed.records[0].editorial.status).toBe('draft')
    expect(
      parsed.records.find((candidate) => candidate.id === acceptableRecord.id)
        ?.acceptableFruitKeywords[0].substitutesCoreId,
    ).toBeNull()
    expect(
      parsed.concepts.find((candidate) => candidate.id === concept.id)
        ?.rules[0],
    ).toEqual({
      allOf: rule.all_of,
      anyOf: rule.any_of,
      noneOf: rule.none_of,
    })
  })

  it('rejects malformed top-level content and missing required source references', () => {
    expect(() => parseAbstractionContent({ schema_version: 1 })).toThrow()
    const input = fixture()
    delete input.records[0].source_refs
    expect(() => parseAbstractionContent(input)).toThrow(/必須項目/)
  })

  it('rejects malformed rule contents rather than passing unsafe shape to the grader', () => {
    const input = fixture()
    const concept = input.concepts.find((candidate) => candidate.rules.length)!
    concept.rules[0].allOf = []
    expect(() => parseAbstractionContent(input)).toThrow(/用語カタログ/)
  })
})
