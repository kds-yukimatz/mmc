import { synonymGroups } from '../data/synonyms'

export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

function canonical(value: string, useSynonyms: boolean): string {
  const normalized = normalizeText(value)
  if (!useSynonyms) return normalized
  const group = synonymGroups.find((items) =>
    items.some((item) => normalizeText(item) === normalized),
  )
  return group ? normalizeText(group[0]) : normalized
}

export function isEquivalent(a: string, b: string, useSynonyms = true): boolean {
  const left = canonical(a, useSynonyms)
  const right = canonical(b, useSynonyms)
  return Boolean(left && right) && (left.includes(right) || right.includes(left))
}
