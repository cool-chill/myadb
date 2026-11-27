// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react'
import { Home as HomeIcon, Settings as SettingsIcon, Smartphone } from 'lucide-react'
import { Home } from '@/pages/Home'
import { Settings } from '@/pages/Settings'
import { useI18n } from '@/i18n'
import { fetchConfig } from '@/lib/bridge'
import { detectChromeVersion, MIN_CHROMIUM } from '@/lib/webview'

type Tab = 'home' | 'settings'

export default function App() {
  const { t, setLang } = useI18n()
  const [tab, setTab] = useState<Tab>('home')
  const [oldWebView, setOldWebView] = useState<string | null>(null)

  useEffect(() => {
    const version = detectChromeVersion()
    if (version !== null && version < MIN_CHROMIUM) {
      setOldWebView(String(version))
    }
  }, [])

  useEffect(() => {
    fetchConfig()
      .then((config) => setLang(config.language))
      .catch(() => {
        // The fallback language (zh) is already active.
      })
  }, [setLang])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col">
        <header className="safe-top sticky top-0 z-20 border-b border-border bg-background">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">{t('app.title')}</h1>
              <p className="truncate text-xs text-muted-foreground">{t('app.subtitle')}</p>
            </div>
          </div>
        </header>

        {oldWebView ? (
          <div
            role="alert"
            style={{
              backgroundColor: '#fef3c7',
              borderBottom: '1px solid #fcd34d',
              color: '#92400e',
              fontSize: '12px',
              lineHeight: 1.5,
              padding: '10px 16px',
            }}
          >
            {t('webview.warning', { version: oldWebView })}
          </div>
        ) : null}

        <main className="flex-1 px-4 py-4 pb-28">{tab === 'home' ? <Home /> : <Settings />}</main>

        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card">
          <div className="mx-auto grid w-full max-w-xl grid-cols-2">
            <button
              type="button"
              aria-current={tab === 'home' ? 'page' : undefined}
              onClick={() => setTab('home')}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                tab === 'home' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <HomeIcon className="h-5 w-5" />
              {t('nav.home')}
            </button>
            <button
              type="button"
              aria-current={tab === 'settings' ? 'page' : undefined}
              onClick={() => setTab('settings')}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                tab === 'settings' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <SettingsIcon className="h-5 w-5" />
              {t('nav.settings')}
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}
