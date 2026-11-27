// SPDX-License-Identifier: GPL-3.0-only
import { exec, spawn, toast } from 'kernelsu'
import {
  parseConfig,
  parseDoctor,
  parseKeys,
  parseLog,
  parseSnapshot,
  parseUsb,
  parseResult,
  parseStatus,
  type CommandResultBody,
  type Config,
  type Doctor,
  type KeyEntry,
  type Snapshot,
  type Status,
  type UsbState,
} from './schema'
import { mockExec } from './mock'

export const ADBCTL_PATH = '/data/adb/modules/myadb/bin/adbctl'

export interface RawResult {
  code: number
  stdout: string
  stderr: string
}

export interface Outcome {
  code: number
  body: CommandResultBody | null
  stdout: string
  stderr: string
}

export type SnapshotSection = 'status' | 'config' | 'usb' | 'keys'

interface CacheEntry {
  expires: number
  promise: Promise<RawResult>
}

const CACHE_TTL_MS = 1500
const cache = new Map<string, CacheEntry>()
const cacheStats = { hits: 0, misses: 0 }

export function invalidateCache(): void {
  cache.clear()
}

export function getCacheStats(): { hits: number; misses: number; size: number } {
  return { ...cacheStats, size: cache.size }
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function commandFor(args: string[]): string {
  return [shellQuote(ADBCTL_PATH), ...args.map(shellQuote)].join(' ')
}

export function isNativeBridge(): boolean {
  if (import.meta.env.DEV) return false
  return typeof window !== 'undefined' && 'ksu' in window
}

function execNative(args: string[]): Promise<RawResult> {
  return exec(commandFor(args)).then((res) => ({
    code: res.errno,
    stdout: res.stdout,
    stderr: res.stderr,
  }))
}

function spawnNative(args: string[]): Promise<RawResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      resolve({ code, stdout, stderr })
    }

    try {
      const child = spawn(ADBCTL_PATH, args)
      child.stdout.on('data', (data) => {
        stdout += data
      })
      child.stderr.on('data', (data) => {
        stderr += data
      })
      child.on('exit', (code: number) => finish(code))
      child.on('error', (error: unknown) => {
        stderr += String(error)
        finish(-1)
      })
    } catch (error) {
      stderr = String(error)
      finish(-1)
    }
  })
}

export async function runAdbctl(args: string[], streaming = false): Promise<RawResult> {
  if (!isNativeBridge()) return mockExec(args)
  return streaming ? spawnNative(args) : execNative(args)
}

async function runOutcome(args: string[], streaming = false): Promise<Outcome> {
  const raw = await runAdbctl(args, streaming)
  return { ...raw, body: parseResult(raw.stdout) }
}

async function runMutation(args: string[], streaming = false): Promise<Outcome> {
  const outcome = await runOutcome(args, streaming)
  if (outcome.code === 0 || outcome.code === 16) invalidateCache()
  return outcome
}

function cachedRun(key: string, args: string[]): Promise<RawResult> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expires > now) {
    cacheStats.hits += 1
    return hit.promise
  }
  cacheStats.misses += 1
  const promise = runAdbctl(args)
  cache.set(key, { expires: now + CACHE_TTL_MS, promise })
  return promise
}

export async function fetchSnapshot(
  sections: SnapshotSection[] = ['status', 'config'],
  options: { bypassCache?: boolean } = {},
): Promise<Snapshot> {
  const key = `snapshot:${sections.join(',')}`
  const args = ['snapshot', '--with', sections.join(',')]
  const raw = options.bypassCache ? await runAdbctl(args) : await cachedRun(key, args)
  const snapshot = parseSnapshot(raw.stdout)
  if (!snapshot) throw new Error('invalid snapshot payload')
  return snapshot
}

export async function fetchStatus(): Promise<Status> {
  const raw = await runAdbctl(['status', '--json'])
  const status = parseStatus(raw.stdout)
  if (!status) throw new Error('invalid status payload')
  return status
}

export async function fetchConfig(): Promise<Config> {
  const raw = await runAdbctl(['config'])
  const config = parseConfig(raw.stdout)
  if (!config) throw new Error('invalid config payload')
  return config
}

export async function fetchDoctor(): Promise<Doctor> {
  const raw = await runAdbctl(['doctor', '--json'])
  const doctor = parseDoctor(raw.stdout)
  if (!doctor) throw new Error('invalid doctor payload')
  return doctor
}

export async function fetchLogs(lines = 50): Promise<string[]> {
  const raw = await runAdbctl(['log', '-n', String(lines)])
  const log = parseLog(raw.stdout)
  return log ? log.lines : []
}

export function enable(port: number): Promise<Outcome> {
  return runMutation(['enable', '--port', String(port)], true)
}

export function disable(): Promise<Outcome> {
  return runMutation(['disable'], true)
}

export function setPort(port: number): Promise<Outcome> {
  return runMutation(['set-port', String(port)], true)
}

export function setBoot(enabled: boolean, port?: number): Promise<Outcome> {
  const args = ['boot', enabled ? 'on' : 'off']
  if (port !== undefined) args.push('--port', String(port))
  return runMutation(args)
}

export function setConfig(key: string, value: string | number | boolean): Promise<Outcome> {
  return runMutation(['config', 'set', key, String(value)])
}

export async function fetchUsb(): Promise<UsbState> {
  const raw = await runAdbctl(['usb', 'status'])
  const usb = parseUsb(raw.stdout)
  if (!usb) throw new Error('invalid usb payload')
  return usb
}

export function setUsbSwitch(
  kind: 'adb' | 'developer' | 'wireless',
  enabled: boolean,
): Promise<Outcome> {
  return runMutation(['usb', 'set', kind, enabled ? 'on' : 'off'])
}

export function setUsbMode(
  mode: 'charging' | 'mtp' | 'ptp' | 'rndis' | 'ncm' | 'midi',
): Promise<Outcome> {
  return runMutation(['usb', 'mode', mode])
}

export function setUsbTimeout(days: number): Promise<Outcome> {
  return runMutation(['usb', 'timeout', String(days)])
}

export async function fetchKeys(): Promise<KeyEntry[]> {
  const raw = await runAdbctl(['keys', 'list'])
  const keys = parseKeys(raw.stdout)
  if (!keys) throw new Error('invalid keys payload')
  return keys
}

export function removeKey(id: string): Promise<Outcome> {
  return runMutation(['keys', 'remove', id])
}

export function keysAction(
  action: 'import' | 'backup' | 'restore' | 'clear',
  path?: string,
): Promise<Outcome> {
  const args = ['keys', action]
  if (path) args.push(path)
  return runMutation(args)
}

export function notify(message: string) {
  if (!isNativeBridge()) return
  try {
    toast(message)
  } catch {
    // toast is best-effort
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', 'readonly')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}
