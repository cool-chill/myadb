// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { errorRef, KNOWN_ERROR_CODES } from '@/lib/errors'

describe('errorRef', () => {
  it('maps every documented exit code to a dictionary key', () => {
    for (const code of KNOWN_ERROR_CODES) {
      expect(errorRef(code)).toEqual({ key: `error.${code}` })
    }
  })

  it('falls back to a generic message with the code', () => {
    expect(errorRef(-1)).toEqual({ key: 'error.generic', vars: { code: -1 } })
    expect(errorRef(99)).toEqual({ key: 'error.generic', vars: { code: 99 } })
  })
})
