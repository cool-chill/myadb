// SPDX-License-Identifier: GPL-3.0-only
// Browser-side fake adbctl used by `npm run dev` and by a production build that
// was opened outside a manager WebView.
import type { Config, Doctor, Status } from './schema'

interface MockState {
  port: number
  listening: boolean
  adbEnabled: number
  config: Config
  logs: string[]
}

const STORAGE_KEY = 'myadb.mock.v1'

function defaultState(): MockState {
  return {
    port: 5555,
    listening: true,
    adbEnabled: 1,
    config: {
      schema: 1,
      port: 5555,
      enabled: true,
      toggle_adb_enabled: true,
      restore_adb_enabled: true,
      retry: 3,
      retry_interval: 10,
      language: 'zh',
    },
    logs: [
      `${stamp()} boot-apply port=5555 result=ok attempt=1`,
      `${stamp()} enable port=5555 result=ok cost=312ms`,
    ],
  }
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function loadState(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MockState>
      if (parsed && parsed.config && typeof parsed.port === 'number') {
        return { ...defaultState(), ...parsed, config: { ...defaultState().config, ...parsed.config } }
      }
    }
  } catch {
    // ignore malformed storage
  }
  return defaultState()
}

const state: MockState = loadState()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage can be unavailable in private mode
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ok(body: unknown) {
  return { code: 0, stdout: JSON.stringify(body), stderr: '' }
}

function err(code: number, message: string, extra: Record<string, unknown> = {}) {
  return {
    code,
    stdout: JSON.stringify({ ok: false, error_code: code, message, ...extra }),
    stderr: '',
  }
}

function addLog(line: string) {
  state.logs.push(`${stamp()} ${line}`)
  if (state.logs.length > 200) state.logs = state.logs.slice(-200)
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535
}

function readPort(rest: string[], fallback: number): number {
  const index = rest.indexOf('--port')
  if (index >= 0) return Number(rest[index + 1])
  const inline = rest.find((item) => item.startsWith('--port='))
  if (inline) return Number(inline.slice('--port='.length))
  const positional = rest.find((item) => /^\d+$/.test(item))
  return positional ? Number(positional) : fallback
}

function statusOf(s: MockState): Status {
  const active = s.port > 0
  return {
    schema: 1,
    state: active ? (s.listening ? 'ACTIVE' : 'DEGRADED') : 'IDLE',
    port: s.port,
    listening: active && s.listening,
    listener_uid: active ? 0 : -1,
    listener_pid: active ? 4242 : -1,
    adbd_running: true,
    adb_enabled: s.adbEnabled,
    listen_addrs: '',
    boot_enabled: s.config.enabled,
    ips: ['192.168.1.42', '10.0.0.7'],
    error_code: 0,
    timestamp: Math.floor(Date.now() / 1000),
  }
}

function doctorOf(s: MockState): Doctor {
  const active = s.port > 0
  return {
    schema: 1,
    root: true,
    model: 'Pixel 8 (mock)',
    android: '14',
    selinux: 'Enforcing',
    adbd_running: true,
    adbd_pids: [4242],
    listen_addrs: '',
    tcp_port_prop: active ? String(s.port) : '-1',
    adb_enabled: s.adbEnabled,
    config_port: s.config.port,
    listening: active && s.listening,
    listener_uid: active ? 0 : -1,
    listener_pid: active ? 4242 : -1,
    port_occupied: false,
    keys_exists: true,
    keys_count: 2,
    ips: ['192.168.1.42', '10.0.0.7'],
    warnings: [],
    timestamp: Math.floor(Date.now() / 1000),
  }
}

export async function mockExec(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  await delay(160)
  const [command, ...rest] = args

  switch (command) {
    case 'status':
      return ok(statusOf(state))

    case 'config': {
      if (rest[0] === 'set') {
        const [, key, value] = rest
        if (!key || value === undefined) return err(15, 'invalid config')
        if (key === 'language' && value !== 'zh' && value !== 'en') return err(15, 'invalid language')
        if (key === 'port' && !validPort(Number(value))) return err(14, 'port out of range')
        const next = { ...state.config } as Record<string, unknown>
        next[key] = key === 'port' || key === 'retry' || key === 'retry_interval' ? Number(value) : value === 'true' ? true : value === 'false' ? false : value
        state.config = next as unknown as Config
        persist()
        return ok({ ok: true, error_code: 0, key, value })
      }
      return ok(state.config)
    }

    case 'enable': {
      const port = readPort(rest, state.config.port)
      if (!validPort(port)) return err(14, 'port out of range')
      state.port = port
      state.listening = true
      state.config.port = port
      addLog(`enable port=${port} result=ok cost=280ms`)
      persist()
      return ok({ ok: true, error_code: 0, state: 'ACTIVE', port, listener_pid: 4242 })
    }

    case 'disable':
      state.port = -1
      state.listening = false
      addLog('disable result=ok')
      persist()
      return ok({ ok: true, error_code: 0, state: 'IDLE', port: -1 })

    case 'set-port': {
      const port = readPort(rest, state.config.port)
      if (!validPort(port)) return err(14, 'port out of range')
      state.config.port = port
      if (state.port > 0) {
        state.port = port
        state.listening = true
      }
      addLog(`set-port port=${port}`)
      persist()
      return ok({ ok: true, error_code: 0, state: state.port > 0 ? 'ACTIVE' : 'IDLE', target_port: port })
    }

    case 'boot': {
      const mode = rest[0]
      const port = readPort(rest.slice(1), state.config.port)
      if (!validPort(port)) return err(14, 'port out of range')
      state.config.enabled = mode === 'on'
      state.config.port = port
      addLog(`boot enabled=${mode === 'on'} port=${port}`)
      persist()
      return ok({ ok: true, error_code: 0, boot_enabled: state.config.enabled, port })
    }

    case 'doctor':
      return ok(doctorOf(state))

    case 'log': {
      const index = rest.indexOf('-n')
      const count = index >= 0 ? Number(rest[index + 1]) : 50
      const lines = Number.isFinite(count) ? state.logs.slice(-count) : state.logs
      return ok({ lines })
    }

    case 'keys': {
      const action = rest[0]
      if (action === 'backup') {
        const path = rest[1] || '/data/adb/modules/myadb/backup/adb_keys'
        addLog(`keys backup path=${path}`)
        persist()
        return ok({ ok: true, error_code: 0, path })
      }
      if (action === 'clear') {
        addLog('keys clear backup=/data/adb/modules/myadb/backup/adb_keys.mock')
        persist()
        return ok({ ok: true, error_code: 0, backup: '/data/adb/modules/myadb/backup/adb_keys.mock' })
      }
      addLog(`keys ${action}`)
      persist()
      return ok({ ok: true, error_code: 0, added: action === 'import' ? 1 : undefined })
    }

    default:
      return err(15, `unknown command: ${command ?? ''}`)
  }
}
