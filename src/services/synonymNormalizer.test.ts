import { describe, expect, it } from 'vitest'
import { isEquivalent, normalizeText } from './synonymNormalizer'

describe('文字列正規化', () => {
  it('全角英数・空白・記号・大文字小文字を統一する', () => expect(normalizeText(' ＷＥＢ・販促 ')).toBe('web販促'))
  it('部分一致を許容する', () => expect(isEquivalent('人材育成', '人材育成の強化')).toBe(true))
})
