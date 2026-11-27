// SPDX-License-Identifier: GPL-3.0-only

export interface MessageRef {
  key: string
  vars?: Record<string, string | number>
}

export const KNOWN_ERROR_CODES = [10, 11, 12, 13, 14, 15, 16] as const

const known = new Set<number>(KNOWN_ERROR_CODES)

export function errorRef(code: number): MessageRef {
  if (known.has(code)) return { key: `error.${code}` }
  return { key: 'error.generic', vars: { code } }
}
