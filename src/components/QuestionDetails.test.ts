import { describe, expect, it } from 'vitest'
import { getThemeDisplay } from './themeDisplay'

describe('MMC題意の表示', () => {
  it('複数の題意をすべて表示対象にする', () => {
    expect(getThemeDisplay({ mmcTheme: ['オペレーション（人事）', '経営理念'], themeStatus: 'verified' }))
      .toEqual(['オペレーション（人事）', '経営理念'])
  })

  it('未確認データは明示する', () => {
    expect(getThemeDisplay({ mmcTheme: [], themeStatus: 'unverified' })).toEqual(['MMC題意未確認'])
  })
})
