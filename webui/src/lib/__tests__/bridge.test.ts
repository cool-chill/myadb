// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { commandFor, isNativeBridge, runAdbctl, shellQuote } from '@/lib/bridge'
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

  it('rejects an out-of-range port', async () => {
    const raw = await runAdbctl(['enable', '--port', '80'])
    expect(raw.code).toBe(14)
  })
})
