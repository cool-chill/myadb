// SPDX-License-Identifier: GPL-3.0-only

export const MIN_CHROMIUM = 111

export function detectChromeVersion(userAgent?: string): number | null {
  const ua = userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(ua)
  if (!match) return null
  const version = Number(match[1])
  return Number.isFinite(version) ? version : null
}

export function isOutdatedWebView(userAgent?: string): boolean {
  const version = detectChromeVersion(userAgent)
  return version !== null && version < MIN_CHROMIUM
}
