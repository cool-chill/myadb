// SPDX-License-Identifier: GPL-3.0-only
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  Bug,
  ChevronDown,
  Copy,
  Loader2,
  Power,
  RefreshCw,
  ScrollText,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ErrorNotice } from '@/components/error-notice'
import { StateBadge } from '@/components/state-badge'
import { useI18n } from '@/i18n'
import {
  copyText,
  disable,
  enable,
  fetchConfig,
  fetchDoctor,
  fetchLogs,
  fetchStatus,
  isNativeBridge,
  notify,
  setBoot,
  setPort,
} from '@/lib/bridge'
import { errorRef } from '@/lib/errors'
import { isValidPort, type Config, type Doctor, type Status } from '@/lib/schema'

type BusyAction = 'toggle' | 'port' | 'boot' | 'doctor' | null

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

export function Home() {
  const { t, setLang } = useI18n()
  const [status, setStatus] = useState<Status | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState<string | null>(null)
  const [portInput, setPortInput] = useState('')
  const [portInvalid, setPortInvalid] = useState(false)
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)

  const load = useCallback(
    async (spinner: boolean) => {
      if (spinner) setLoading(true)
      try {
        const [nextStatus, nextConfig] = await Promise.all([fetchStatus(), fetchConfig()])
        setStatus(nextStatus)
        setConfig(nextConfig)
        setLang(nextConfig.language)
        setPortInput(String(nextConfig.port))
      } catch {
        setError(t('error.status'))
      } finally {
        if (spinner) setLoading(false)
      }
    },
    [t, setLang],
  )

  useEffect(() => {
    void load(true)
  }, [load])

  const report = useCallback(
    (code: number) => {
      if (code === 0) return
      const ref = errorRef(code)
      setError(t(ref.key, ref.vars))
    },
    [t],
  )

  const runDoctor = useCallback(async () => {
    setBusy('doctor')
    try {
      const [nextDoctor, nextLogs] = await Promise.all([fetchDoctor(), fetchLogs(50)])
      setDoctor(nextDoctor)
      setLogs(nextLogs)
      setShowLogs(true)
    } catch {
      setError(t('error.status'))
    } finally {
      setBusy(null)
    }
  }, [t])

  async function handleToggle(next: boolean) {
    if (!config || busy) return
    setBusy('toggle')
    setError(null)
    try {
      const outcome = next ? await enable(config.port) : await disable()
      report(outcome.code)
      if (outcome.code === 0) notify(t('toast.applied'))
    } catch {
      setError(t('error.status'))
    }
    await load(false)
    setBusy(null)
  }

  async function handleApplyPort() {
    const value = Number(portInput)
    if (!isValidPort(value)) {
      setPortInvalid(true)
      return
    }
    setPortInvalid(false)
    setBusy('port')
    setError(null)
    try {
      const outcome = await setPort(value)
      report(outcome.code)
      if (outcome.code === 0) notify(t('toast.applied'))
    } catch {
      setError(t('error.status'))
    }
    await load(false)
    setBusy(null)
  }

  async function handleBoot(next: boolean) {
    if (!config || busy) return
    setBusy('boot')
    setError(null)
    try {
      const outcome = await setBoot(next, config.port)
      report(outcome.code)
      if (outcome.code === 0) notify(t('boot.saved'))
    } catch {
      setError(t('error.status'))
    }
    await load(false)
    setBusy(null)
  }

  async function handleCopy(command: string) {
    const copied = await copyText(command)
    notify(copied ? t('toast.copied') : t('toast.copyFailed'))
  }

  const effectivePort = status && status.port > 0 ? status.port : (config?.port ?? 5555)
  const adbEnabledLabel =
    status?.adb_enabled === 1
      ? t('common.enabled')
      : status?.adb_enabled === 0
        ? t('common.disabled')
        : t('common.unknown')

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!isNativeBridge() ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-accent-foreground">
          {t('mock.notice')}
        </p>
      ) : null}

      {error ? (
        <ErrorNotice message={error} actionLabel={t('common.viewLog')} onAction={() => void runDoctor()} />
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <CardTitle>{t('status.title')}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {status ? <StateBadge state={status.state} /> : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.refresh')}
                disabled={busy !== null}
                onClick={() => {
                  setError(null)
                  void load(false)
                }}
              >
                <RefreshCw className={busy === null ? 'h-4 w-4' : 'h-4 w-4 opacity-50'} />
              </Button>
            </div>
          </div>
          <CardDescription>{t('status.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <InfoRow label={t('status.port')} value={<span className="font-mono">{status && status.port > 0 ? status.port : '—'}</span>} />
          <InfoRow
            label={t('status.listening')}
            value={
              <span className={status?.listening ? 'text-success' : 'text-warning'}>
                {status?.listening ? t('common.yes') : t('common.no')}
              </span>
            }
          />
          <InfoRow
            label={t('status.adbd')}
            value={status?.adbd_running ? t('common.enabled') : t('common.disabled')}
          />
          <InfoRow label={t('status.adbEnabled')} value={adbEnabledLabel} />
          <InfoRow
            label={t('status.boot')}
            value={config?.enabled ? t('common.enabled') : t('common.disabled')}
          />
          <InfoRow
            label={t('status.ip')}
            value={status && status.ips.length > 0 ? status.ips.join(', ') : t('status.none')}
          />
          {status ? (
            <p className="pt-2 text-xs text-muted-foreground">
              {t('status.lastUpdate', { time: new Date(status.timestamp * 1000).toLocaleTimeString() })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Power className="h-4 w-4 text-primary" />
            <CardTitle>{t('control.title')}</CardTitle>
          </div>
          <CardDescription>{t('control.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="adb-toggle" className="text-sm font-medium">
              {t('control.enable')}
            </Label>
            <div className="flex items-center gap-2">
              {busy === 'toggle' ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              <Switch
                id="adb-toggle"
                checked={Boolean(status && status.port > 0)}
                disabled={busy !== null || !config}
                onCheckedChange={(checked) => void handleToggle(checked)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="port-input">{t('control.port')}</Label>
            <div className="flex gap-2">
              <Input
                id="port-input"
                inputMode="numeric"
                type="number"
                min={1024}
                max={65535}
                value={portInput}
                aria-invalid={portInvalid}
                placeholder={t('control.portPlaceholder')}
                onChange={(event) => {
                  setPortInput(event.target.value)
                  setPortInvalid(false)
                }}
              />
              <Button
                variant="secondary"
                disabled={busy !== null || !config}
                onClick={() => void handleApplyPort()}
              >
                {busy === 'port' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy === 'port' ? t('control.applying') : t('control.apply')}
              </Button>
            </div>
            {portInvalid ? <p className="text-xs text-destructive">{t('control.portInvalid')}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('boot.title')}</CardTitle>
          <CardDescription>{t('boot.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="boot-toggle">{t('boot.label')}</Label>
            <div className="flex items-center gap-2">
              {busy === 'boot' ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              <Switch
                id="boot-toggle"
                checked={Boolean(config?.enabled)}
                disabled={busy !== null || !config}
                onCheckedChange={(checked) => void handleBoot(checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            <CardTitle>{t('connect.title')}</CardTitle>
          </div>
          <CardDescription>{t('connect.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-4">
          {status && status.ips.length > 0 ? (
            status.ips.map((ip) => {
              const command = `adb connect ${ip}:${effectivePort}`
              return (
                <div
                  key={ip}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2"
                >
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{command}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('connect.copy')}
                    onClick={() => void handleCopy(command)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">{t('connect.empty')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-primary" />
              <CardTitle>{t('diag.title')}</CardTitle>
            </div>
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void runDoctor()}>
              {busy === 'doctor' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
              {busy === 'doctor' ? t('diag.running') : t('diag.run')}
            </Button>
          </div>
          <CardDescription>{t('diag.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          {doctor ? (
            <div>
              <InfoRow label={t('diag.root')} value={doctor.root ? t('common.yes') : t('common.no')} />
              <InfoRow label={t('diag.model')} value={doctor.model || t('common.unknown')} />
              <InfoRow label={t('diag.android')} value={doctor.android || t('common.unknown')} />
              <InfoRow label={t('diag.selinux')} value={doctor.selinux || t('common.unknown')} />
              <InfoRow
                label={t('diag.listenAddrs')}
                value={doctor.listen_addrs || t('diag.none')}
              />
              <InfoRow
                label={t('diag.adbdPids')}
                value={doctor.adbd_pids.length > 0 ? doctor.adbd_pids.join(', ') : t('diag.none')}
              />
              <InfoRow
                label={t('diag.occupied')}
                value={doctor.port_occupied ? t('common.yes') : t('common.no')}
              />
              <InfoRow label={t('diag.keys')} value={doctor.keys_count} />
              <InfoRow
                label={t('diag.warnings')}
                value={doctor.warnings.length > 0 ? doctor.warnings.join(', ') : t('diag.none')}
              />
            </div>
          ) : null}

          <Button
            variant="ghost"
            className="justify-between"
            onClick={() => setShowLogs((value) => !value)}
          >
            <span className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              {t('diag.logs')}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showLogs ? 'rotate-180' : ''}`}
            />
          </Button>
          {showLogs ? (
            logs.length > 0 ? (
              <pre className="log-scroll max-h-64 overflow-auto rounded-lg bg-foreground p-3 font-mono text-[11px] leading-relaxed text-background">
                {logs.join('\n')}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">{t('diag.empty')}</p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
