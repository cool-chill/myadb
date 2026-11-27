// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import zh from '@/i18n/zh.json'
import en from '@/i18n/en.json'
import { translate } from '@/i18n/translate'

const zhKeys = Object.keys(zh).sort()
const enKeys = Object.keys(en).sort()

describe('i18n dictionaries', () => {
  it('have identical key sets', () => {
    expect(enKeys).toEqual(zhKeys)
  })

  it('keep placeholders in sync', () => {
    const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort()
    for (const key of zhKeys) {
      expect(placeholders(en[key as keyof typeof en] ?? '')).toEqual(
        placeholders(zh[key as keyof typeof zh] ?? ''),
      )
    }
  })
})

describe('translate', () => {
  it('renders Chinese by default', () => {
    expect(translate('zh', 'state.ACTIVE')).toBe('运行中')
  })

  it('interpolates variables', () => {
    expect(translate('en', 'status.lastUpdate', { time: '12:00' })).toBe('Updated 12:00')
    expect(translate('zh', 'error.generic', { code: 99 })).toBe('操作失败（错误码 99）')
  })

  it('falls back to the key when missing', () => {
    expect(translate('en', 'missing.key')).toBe('missing.key')
  })
})
