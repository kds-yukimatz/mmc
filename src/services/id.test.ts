import { describe, expect, it } from 'vitest'
import { createLocalId } from './id'

describe('createLocalId', () => {
  it('空でない一意な履歴IDを生成する', () => {
    const first = createLocalId()
    const second = createLocalId()
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
  })
})
