// SPDX-License-Identifier: GPL-3.0-only
import { useCallback, useEffect, useState } from 'react'
import {
  ExternalLink,
  Globe,
  Info,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings2,
  Trash2,
  Usb,
  Users,
} from 'lucide-react'
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
import {
  fetchSnapshot,
  keysAction,
  notify,
  removeKey,
  setConfig as saveConfig,
  setUsbMode,
  setUsbSwitch,
  setUsbTimeout,
} from '@/lib/bridge'
import { errorRef } from '@/lib/errors'
import type { Config, KeyEntry, Language, UsbState } from '@/lib/schema'
import { APP_VERSION, LICENSE_NAME, REPO_URL } from '@/lib/constants'

type ToggleKey = 'toggle_adb_enabled' | 'restore_adb_enabled'
type UsbMode = 'charging' | 'mtp' | 'ptp' | 'rndis' | 'ncm' | 'midi'

interface KeyFeedback {
  id: string
  status: 'success' | 'error'
  message: string
  detail?: string
}

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

function KeyFeedbackNotice({ feedback }: { feedback: KeyFeedback }) {
  const tone =
    feedback.status === 'success'
      ? 'border-success-soft bg-success-soft text-success'
      : 'border-destructive bg-card text-destructive'
  return (
    <p
      role="status"
      aria-live="polite"
      className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${tone}`}
    >
      {feedback.message}
      {feedback.detail ? (
        <span className="mt-1 block font-mono text-[11px] break-all opacity-80">{feedback.detail}</span>
      ) : null}
    </p>
  )
}

export function Settings() {
  const { t, lang, setLang } = useI18n()
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [keyFeedback, setKeyFeedback] = useState<KeyFeedback | null>(null)
  const [keysPath, setKeysPath] = useState('/sdcard/adb_keys')
  const [clearOpen, setClearOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [usb, setUsb] = useState<UsbState | null>(null)
  const [authorizedKeys, setAuthorizedKeys] = useState<KeyEntry[]>([])
  const [deleteTarget, setDeleteTarget] = useState<KeyEntry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snapshot = await fetchSnapshot(['config', 'usb', 'keys'])
      if (!snapshot.config) throw new Error('config section missing')
      setConfig(snapshot.config)
      setLang(snapshot.config.language)
      setUsb(snapshot.usb ?? null)
      setAuthorizedKeys(snapshot.keys ?? [])
      setError(null)
    } catch {
      setError(t('error.status'))
    } finally {
      setLoading(false)
    }
  }, [t, setLang])

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

  const feedbackFor = useCallback(
    (code: number, id: string, success: string): KeyFeedback => {
      if (code === 0) {
        return { id, status: 'success', message: success }
      }
      const ref = errorRef(code)
      return { id, status: 'error', message: t(ref.key, ref.vars) }
    },
    [t],
  )

  const refreshUsb = useCallback(async () => {
    try {
      const snapshot = await fetchSnapshot(['usb'])
      if (snapshot.usb) setUsb(snapshot.usb)
    } catch {
      // keep the last known state; the next action will retry
    }
  }, [])

  const refreshKeys = useCallback(async () => {
    try {
      const snapshot = await fetchSnapshot(['keys'])
      if (snapshot.keys) setAuthorizedKeys(snapshot.keys)
    } catch {
      // keep the last known state; the next action will retry
    }
  }, [])

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

  async function handleUsbSwitch(kind: 'adb' | 'developer' | 'wireless', value: boolean) {
    setBusy(`usb-${kind}`)
    setError(null)
    setNotice(null)
    try {
      const outcome = await setUsbSwitch(kind, value)
      if (outcome.code !== 0) {
        report(outcome.code)
      } else {
        setNotice(t('usb.saved'))
        await refreshUsb()
      }
    } catch {
      setError(t('error.status'))
    } finally {
      setBusy(null)
    }
  }

  async function handleUsbMode(mode: UsbMode) {
    if (busy) return
    setBusy(`usb-mode-${mode}`)
    setError(null)
    setNotice(null)
    try {
      const outcome = await setUsbMode(mode)
      if (outcome.code !== 0) {
        report(outcome.code)
      } else {
        setNotice(t('usb.saved'))
        await refreshUsb()
      }
    } catch {
      setError(t('error.status'))
    } finally {
      setBusy(null)
    }
  }

  async function handleUsbTimeout(days: number) {
    setBusy(`usb-timeout-${days}`)
    setError(null)
    setNotice(null)
    try {
      const outcome = await setUsbTimeout(days)
      if (outcome.code !== 0) {
        report(outcome.code)
      } else {
        setNotice(t('usb.timeoutSaved'))
        notify(t('usb.timeoutSaved'))
        await refreshUsb()
      }
    } catch {
      setError(t('error.status'))
    } finally {
      setBusy(null)
    }
  }

  async function handleRemoveKey() {
    if (!deleteTarget) return
    const target = deleteTarget
    const busyId = `key-delete:${target.id}`
    setBusy(busyId)
    setError(null)
    setNotice(null)
    try {
      const outcome = await removeKey(target.id)
      const feedbackId = 'devices'
      if (outcome.code === 0) {
        setKeyFeedback(feedbackFor(0, feedbackId, t('keys.deleted')))
        notify(t('keys.done'))
      } else {
        setKeyFeedback(feedbackFor(outcome.code, feedbackId, t('keys.deleted')))
        notify(t(errorRef(outcome.code).key, errorRef(outcome.code).vars))
      }
      await refreshKeys()
    } catch {
      setKeyFeedback({ id: 'devices', status: 'error', message: t('error.status') })
    } finally {
      setBusy(null)
      setDeleteTarget(null)
    }
  }

  async function handleKeyAction(action: 'import' | 'backup' | 'clear') {
    if (action === 'import' && !keysPath.trim()) {
      setKeyFeedback({ id: 'keys', status: 'error', message: t('keys.pathRequired') })
      return
    }
    const busyId = `keys-${action}`
    setBusy(busyId)
    setError(null)
    setNotice(null)
    setKeyFeedback(null)
    try {
      const outcome = await keysAction(
        action,
        action === 'backup' ? keysPath.trim() || undefined : undefined,
      )
      const body = outcome.body
      if (outcome.code !== 0) {
        setKeyFeedback(feedbackFor(outcome.code, 'keys', ''))
        if (outcome.code === 16) await refreshKeys()
        return
      }
      if (action === 'import') {
        setKeyFeedback({
          id: 'keys',
          status: 'success',
          message: t('keys.import', { added: body?.added ?? 0, skipped: body?.skipped ?? 0 }),
        })
      } else if (action === 'backup') {
        setKeyFeedback({
          id: 'keys',
          status: 'success',
          message: t('keys.backup', { path: body?.path ?? '' }),
          detail: body?.path,
        })
      } else {
        setKeyFeedback({
          id: 'keys',
          status: 'success',
          message: t('keys.clear', { path: body?.backup ?? '' }),
          detail: body?.backup,
        })
      }
      await refreshKeys()
      notify(t('keys.done'))
    } catch {
      setKeyFeedback({ id: 'keys', status: 'error', message: t('error.status') })
    } finally {
      setBusy(null)
      setClearOpen(false)
    }
  }

  async function handleRestore() {
    if (!keysPath.trim()) {
      setKeyFeedback({ id: 'keys', status: 'error', message: t('keys.pathRequired') })
      setRestoreOpen(false)
      return
    }
    setBusy('keys-restore')
    setError(null)
    setNotice(null)
    setKeyFeedback(null)
    try {
      await keysAction('backup')
      const outcome = await keysAction('restore', keysPath)
      if (outcome.code !== 0) {
        setKeyFeedback(feedbackFor(outcome.code, 'keys', ''))
      } else {
        setKeyFeedback({
          id: 'keys',
          status: 'success',
          message: t('keys.restore'),
          detail: outcome.body?.backup,
        })
        notify(t('keys.done'))
      }
      await refreshKeys()
    } catch {
      setKeyFeedback({ id: 'keys', status: 'error', message: t('error.status') })
    } finally {
      setBusy(null)
      setRestoreOpen(false)
    }
  }

  const timeoutDays = !usb
    ? null
    : usb.adb_allowed_connection_time === 0
      ? 0
      : usb.adb_allowed_connection_time === 604800000
        ? 7
        : usb.adb_allowed_connection_time === 2592000000
          ? 30
          : null
  const tetherActive = usb?.mode === 'rndis' || usb?.mode === 'ncm'

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
            <Usb className="h-4 w-4 text-primary" />
            <CardTitle>{t('usb.title')}</CardTitle>
          </div>
          <CardDescription>{t('usb.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ToggleRow
            id="usb-adb"
            title={t('usb.adb')}
            description={t('usb.adbDesc')}
            checked={usb?.adb_enabled === 1}
            disabled={busy !== null || !usb || usb.adb_enabled === -1}
            onChange={(value) => void handleUsbSwitch('adb', value)}
          />
          <ToggleRow
            id="usb-developer"
            title={t('usb.developer')}
            description={t('usb.developerDesc')}
            checked={usb?.developer_enabled === 1}
            disabled={busy !== null || !usb}
            onChange={(value) => void handleUsbSwitch('developer', value)}
          />
          <ToggleRow
            id="usb-wireless"
            title={t('usb.wireless')}
            description={t('usb.wirelessDesc')}
            checked={usb?.adb_wifi_enabled === 1}
            disabled={busy !== null || !usb || !usb.adb_wifi_supported}
            onChange={(value) => void handleUsbSwitch('wireless', value)}
          />
          {usb && !usb.adb_wifi_supported ? (
            <p className="pt-1 text-xs text-destructive">{t('usb.wirelessUnsupported')}</p>
          ) : null}
          {usb?.adb_wifi_enabled === 1 ? (
            <p className="pt-1 text-xs text-warning">{t('usb.wirelessConflict')}</p>
          ) : null}

          <div className="mt-3 border-t border-border pt-3">
            <Label>{t('usb.mode')}</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['charging', 'mtp', 'ptp', 'rndis', 'ncm', 'midi'] as const).map((mode) => {
                const highlighted =
                  mode === 'rndis' || mode === 'ncm'
                    ? tetherActive
                    : usb?.mode === mode
                return (
                  <Button
                    key={mode}
                    variant={highlighted ? 'default' : 'outline'}
                    disabled={busy !== null || !usb?.supports_usb}
                    onClick={() => void handleUsbMode(mode)}
                  >
                    {busy === `usb-mode-${mode}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t(`usb.mode.${mode}`)}
                  </Button>
                )
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t('usb.changeWarning')}</p>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <Label>{t('usb.timeout')}</Label>
            <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{t('usb.timeoutDesc')}</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { days: 0, label: 'usb.timeout.never' },
                { days: 7, label: 'usb.timeout.7' },
                { days: 30, label: 'usb.timeout.30' },
              ].map((option) => (
                <Button
                  key={option.days}
                  variant={timeoutDays === option.days ? 'default' : 'outline'}
                  disabled={busy !== null || !usb}
                  onClick={() => void handleUsbTimeout(option.days)}
                >
                  {busy === `usb-timeout-${option.days}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t(option.label)}
                </Button>
              ))}
            </div>
          </div>

          {usb ? (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                {t('usb.functions')}:{' '}
                {usb.functions.length > 0 ? usb.functions.join(', ') : t('usb.none')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('usb.config')}: {usb.usb_config || t('usb.none')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('usb.state')}: {usb.usb_state || t('usb.none')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('usb.persist')}: {usb.persist_usb_config || t('usb.none')}
              </p>
              {!usb.supports_usb ? (
                <p className="mt-1 text-xs text-destructive">{t('usb.unsupported')}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <CardTitle>{t('keys.devices')}</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('keys.refresh')}
              disabled={busy !== null}
              onClick={() => void refreshKeys()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>{t('keys.devicesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-4">
          {authorizedKeys.length > 0 ? (
            authorizedKeys.map((key) => {
              const deleting = busy === `key-delete:${key.id}`
              return (
                <div
                  key={`${key.index}-${key.id}`}
                  className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {key.comment || t('keys.unnamed')}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{key.id}</p>
                    <p className="text-[11px] text-muted-foreground">{key.algorithm}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('keys.delete')}
                    disabled={deleting || (busy !== null && !busy.startsWith('key-delete'))}
                    onClick={() => setDeleteTarget(key)}
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">{t('keys.devicesEmpty')}</p>
          )}
          {keyFeedback && keyFeedback.id === 'devices' ? (
            <KeyFeedbackNotice feedback={keyFeedback} />
          ) : null}
          {authorizedKeys.length > 0 ? (
            <Button
              variant="destructive"
              className="mt-2"
              disabled={busy !== null}
              onClick={() => setClearOpen(true)}
            >
              {t('keys.revokeAll')}
            </Button>
          ) : null}
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
            {!keysPath.trim() ? (
              <p className="text-xs text-destructive">{t('keys.pathRequired')}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={busy !== null || !keysPath.trim()}
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
              disabled={busy !== null || !keysPath.trim()}
              onClick={() => setRestoreOpen(true)}
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
          {keyFeedback && keyFeedback.id !== 'devices' ? (
            <KeyFeedbackNotice feedback={keyFeedback} />
          ) : null}
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

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('keys.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('keys.deleteDesc', {
                comment: deleteTarget?.comment || t('keys.unnamed'),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={busy !== null}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() => void handleRemoveKey()}
            >
              {busy?.startsWith('key-delete') ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('keys.restoreTitle')}</DialogTitle>
            <DialogDescription>{t('keys.restoreDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOpen(false)} disabled={busy !== null}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() => void handleRestore()}
            >
              {busy === 'keys-restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
