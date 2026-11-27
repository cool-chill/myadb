// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  commandFor,
  fetchKeys,
  fetchSnapshot,
  fetchUsb,
  getCacheStats,
  invalidateCache,
  isNativeBridge,
  runAdbctl,
  setConfig,
  shellQuote,
} from '@/lib/bridge'
import { parseStatus } from '@/lib/schema'

describe('bridge command construction', () => {
  it('quotes single quotes safely', () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`)
    expect(shellQuote('/data/misc/adb/adb_keys')).toBe(`'/data/misc/adb/adb_keys'`)
  })

  it('builds argv without string concatenation', () => {
    expect(commandFor(['enable', '--port', '5555'])).toBe(
      "'/data/adb/modules/myadb/bin/adbctl' 'enable' '--port' '5555'",
    )
  })

  it('uses the mock bridge during development', () => {
    expect(isNativeBridge()).toBe(false)
  })
})

describe('mock bridge', () => {
  it('returns a status payload that matches the schema', async () => {
    const raw = await runAdbctl(['status', '--json'])
    expect(raw.code).toBe(0)
    expect(parseStatus(raw.stdout)).not.toBeNull()
  })

  it('returns usb status and authorized keys from the mock', async () => {
    const usb = await fetchUsb()
    expect(usb.supports_usb).toBe(true)
    expect(usb.mode).toBe('mtp')
    const keys = await fetchKeys()
    expect(keys.length).toBeGreaterThan(0)
    expect(keys[0]).toHaveProperty('id')
    expect(keys[0]).not.toHaveProperty('key')
  })

  it('rejects an out-of-range port', async () => {
    const raw = await runAdbctl(['enable', '--port', '80'])
    expect(raw.code).toBe(14)
  })
})

describe('snapshot bridge', () => {
  it('loads several sections in one call', async () => {
    invalidateCache()
    const snapshot = await fetchSnapshot(['status', 'config', 'usb', 'keys'])
    expect(snapshot.status?.state).toBe('ACTIVE')
    expect(snapshot.config?.language).toBe('zh')
    expect(snapshot.usb?.supports_usb).toBe(true)
    expect(snapshot.keys?.length).toBeGreaterThan(0)
    expect(snapshot.errors).toEqual({})
  })

  it('deduplicates identical requests inside the TTL', async () => {
    invalidateCache()
    const before = getCacheStats()
    const [first, second] = await Promise.all([
      fetchSnapshot(['status', 'config']),
      fetchSnapshot(['status', 'config']),
    ])
    expect(first).toEqual(second)
    expect(getCacheStats().hits - before.hits).toBe(1)
  })

  it('drops cached sections after a mutation', async () => {
    invalidateCache()
    await fetchSnapshot(['config'])
    const outcome = await setConfig('language', 'en')
    expect(outcome.code).toBe(0)
    expect(getCacheStats().size).toBe(0)
    const snapshot = await fetchSnapshot(['config'])
    expect(snapshot.config?.language).toBe('en')
    await setConfig('language', 'zh')
  })
})
