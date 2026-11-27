// SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n'
import { Home } from '@/pages/Home'
import { Settings } from '@/pages/Settings'

describe('pages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the home page with mock status data', async () => {
    render(
      <I18nProvider>
        <Home />
      </I18nProvider>,
    )

    expect(await screen.findByText('运行中')).toBeInTheDocument()
    expect(await screen.findByText(/adb connect 192\.168\.1\.42:5555/)).toBeInTheDocument()
    expect(screen.getByText('无线调试')).toBeInTheDocument()
  })

  it('renders the settings page', async () => {
    render(
      <I18nProvider>
        <Settings />
      </I18nProvider>,
    )

    expect(await screen.findByText('界面语言')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByText('GPL-3.0')).toBeInTheDocument()
  })
})
