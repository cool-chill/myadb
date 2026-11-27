// SPDX-License-Identifier: GPL-3.0-only
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Globe, Info, KeyRound, Loader2, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ErrorNotice } from '@/components/error-notice'
import { useI18n } from '@/i18n'
import { translate } from '@/i18n/translate'
import { fetchConfig, keysAction, notify, setConfig as saveConfig } from '@/lib/bridge'
import { errorRef } from '@/lib/errors'
import type { Config, Language } from '@/lib/schema'
import { APP_VERSION, LICENSE_NAME, REPO_URL } from '@/lib/constants'

type ToggleKey = 'toggle_adb_enabled' | 'restore_adb_enabled'

function ToggleRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  title: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{title}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

export function Settings() {
  const { t, lang, setLang } = useI18n()
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [keysPath, setKeysPath] = useState('/sdcard/adb_keys')
  const [clearOpen, setClearOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConfig(await fetchConfig())
      setError(null)
    } catch {
      setError(t('error.status'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const report = useCallback(
    (code: number) => {
      if (code === 0) return
      const ref = errorRef(code)
      setError(t(ref.key, ref.vars))
    },
    [t],
  )

  async function handleToggle(key: ToggleKey, value: boolean) {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      const outcome = await saveConfig(key, value)
      if (outcome.code !== 0) {
        report(outcome.code)
      } else {
        setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
        setNotice(t('settings.saved'))
      }
    } catch {
      setError(t('error.status'))
    } finally {
      setBusy(null)
    }
  }

  async function handleLanguage(next: Language) {
    if (next === config?.language || busy) return
    setBusy('language')
    setError(null)
    setNotice(null)
    try {
      const outcome = await saveConfig('language', next)
      if (outcome.code !== 0) {
        report(outcome.code)
      } else {
        setConfig((prev) => (prev ? { ...prev, language: next } : prev))
        setLang(next)
        setNotice(translate(next, 'settings.saved'))
        notify(translate(next, 'settings.saved'))
      }
    } catch {
      setError(t('error.status'))
    } finally {
      setBusy(null)
    }
  }

  async function handleKeyAction(action: 'import' | 'backup' | 'restore' | 'clear') {
    setBusy(`keys-${action}`)
    setError(null)
    setNotice(null)
    try {
      const outcome = await keysAction(action, action === 'clear' ? undefined : keysPath)
      if (outcome.code !== 0) {
        report(outcome.code)
        return
      }
      const body = outcome.body
      if (action === 'import') {
        setNotice(t('keys.import', { added: body?.added ?? 0, skipped: body?.skipped ?? 0 }))
      } else if (action === 'backup') {
        setNotice(t('keys.backup', { path: body?.path ?? '' }))
      } else if (action === 'restore') {
        setNotice(t('keys.restore'))
      } else {
        setNotice(t('keys.clear', { path: body?.backup ?? '' }))
      }
      notify(t('keys.done'))
    } catch {
      setError(t('error.status'))
    } finally {
      setBusy(null)
      setClearOpen(false)
    }
  }

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorNotice message={error} /> : null}
      {notice ? (
        <p className="rounded-lg border border-success-soft bg-success-soft px-3 py-2 text-sm text-success">
          {notice}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <CardTitle>{t('settings.language')}</CardTitle>
          </div>
          <CardDescription>{t('settings.languageDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={lang === 'zh' ? 'default' : 'outline'}
              disabled={busy !== null}
              onClick={() => void handleLanguage('zh')}
            >
              中文
            </Button>
            <Button
              variant={lang === 'en' ? 'default' : 'outline'}
              disabled={busy !== null}
              onClick={() => void handleLanguage('en')}
            >
              English
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <CardTitle>{t('settings.behavior')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <ToggleRow
            id="toggle-adb"
            title={t('settings.toggleAdb')}
            description={t('settings.toggleAdbDesc')}
            checked={Boolean(config?.toggle_adb_enabled)}
            disabled={busy !== null || !config}
            onChange={(value) => void handleToggle('toggle_adb_enabled', value)}
          />
          <ToggleRow
            id="restore-adb"
            title={t('settings.restoreAdb')}
            description={t('settings.restoreAdbDesc')}
            checked={Boolean(config?.restore_adb_enabled)}
            disabled={busy !== null || !config}
            onChange={(value) => void handleToggle('restore_adb_enabled', value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <CardTitle>{t('settings.keys')}</CardTitle>
          </div>
          <CardDescription>{t('settings.keysDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="keys-path">{t('settings.keysPath')}</Label>
            <Input
              id="keys-path"
              value={keysPath}
              placeholder={t('settings.keysPathPlaceholder')}
              onChange={(event) => setKeysPath(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void handleKeyAction('import')}
            >
              {busy === 'keys-import' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('settings.keysImport')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void handleKeyAction('backup')}
            >
              {busy === 'keys-backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('settings.keysBackup')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void handleKeyAction('restore')}
            >
              {busy === 'keys-restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('settings.keysRestore')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() => setClearOpen(true)}
            >
              {busy === 'keys-clear' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('settings.keysClear')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <CardTitle>{t('settings.about')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4 text-sm">
          <p className="leading-relaxed text-muted-foreground">{t('about.description')}</p>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <span className="text-muted-foreground">{t('settings.version')}</span>
            <span className="font-mono font-medium">v{APP_VERSION}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <span className="text-muted-foreground">{t('settings.license')}</span>
            <span className="font-medium">{LICENSE_NAME}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <span className="text-muted-foreground">{t('settings.repo')}</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              GitHub
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">{t('footer.powered')}</p>
        </CardContent>
      </Card>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.keysClearTitle')}</DialogTitle>
            <DialogDescription>{t('settings.keysClearDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)} disabled={busy !== null}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() => void handleKeyAction('clear')}
            >
              {busy === 'keys-clear' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
