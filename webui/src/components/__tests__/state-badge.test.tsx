// SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n'
import { StateBadge } from '@/components/state-badge'

describe('StateBadge', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the localized label for a state', () => {
    render(
      <I18nProvider>
        <StateBadge state="ACTIVE" />
      </I18nProvider>,
    )
    expect(screen.getByText('运行中')).toBeInTheDocument()
  })

  it('renders an error state', () => {
    render(
      <I18nProvider>
        <StateBadge state="ERROR" />
      </I18nProvider>,
    )
    expect(screen.getByText('错误')).toBeInTheDocument()
  })
})
