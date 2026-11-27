// SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n'
import { Home } from '@/pages/Home'
import { Settings } from '@/pages/Settings'

function renderSettings() {
  return render(
    <I18nProvider>
      <Settings />
    </I18nProvider>,
  )
}

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

  it('renders the settings page without a notification switch', async () => {
    renderSettings()

    expect(await screen.findByText('界面语言')).toBeInTheDocument()
    expect(await screen.findByText('USB 与设备')).toBeInTheDocument()
    expect(await screen.findByText('已授权设备')).toBeInTheDocument()
    expect(await screen.findByText('desktop@example')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByText('GPL-3.0')).toBeInTheDocument()
    expect(screen.queryByText('常驻通知')).toBeNull()
    expect(screen.queryByText('无线调试端口已关闭')).toBeNull()
  })

  it('renders the extended USB and authorization controls', async () => {
    renderSettings()

    expect(await screen.findByText('无线调试')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MIDI' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '网络共享 (NCM)' })).toBeInTheDocument()
    expect(screen.getByText('授权有效期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '永不过期' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤销全部授权' })).toBeInTheDocument()
    expect(screen.getByText(/USB 状态/)).toBeInTheDocument()
  })

  it('disables import and restore when the key path is empty', async () => {
    renderSettings()

    const input = (await screen.findByLabelText('密钥文件路径')) as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByRole('button', { name: '导入' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '恢复' })).toBeDisabled()
    expect(screen.getByText('请先填写密钥文件路径')).toBeInTheDocument()
  })

  it('shows in-place feedback after a key import', async () => {
    renderSettings()

    const imported = await screen.findByRole('button', { name: '导入' })
    fireEvent.click(imported)
    expect(await screen.findByRole('status')).toHaveTextContent('已导入')
    expect(await screen.findByText('imported@host')).toBeInTheDocument()
  })

  it('shows in-place feedback after deleting an authorized device', async () => {
    renderSettings()

    const deleteButtons = await screen.findAllByRole('button', { name: '删除' })
    fireEvent.click(deleteButtons[0])
    fireEvent.click(await screen.findByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('已删除授权设备')
    })
  })
})
