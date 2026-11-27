// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { detectChromeVersion, isOutdatedWebView, MIN_CHROMIUM } from '@/lib/webview'

describe('webview detection', () => {
  it('reads the Chrome major version from a WebView UA', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/111.0.5563.116 Mobile Safari/537.36'
    expect(detectChromeVersion(ua)).toBe(111)
    expect(isOutdatedWebView(ua)).toBe(false)
  })

  it('flags older WebViews', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36'
    expect(detectChromeVersion(ua)).toBe(95)
    expect(isOutdatedWebView(ua)).toBe(true)
    expect(MIN_CHROMIUM).toBe(111)
  })

  it('returns null when the UA is not Chromium based', () => {
    expect(detectChromeVersion('curl/8.0')).toBeNull()
  })
})
