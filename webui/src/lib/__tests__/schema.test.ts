// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  isValidPort,
  parseConfig,
  parseDoctor,
  parseKeys,
  parseLog,
  parseResult,
  parseSnapshot,
  parseStatus,
  parseUsb,
} from '@/lib/schema'

const status = {
  schema: 1,
  state: 'ACTIVE',
  port: 5555,
  listening: true,
  listener_uid: 0,
  listener_pid: 1234,
  adbd_running: true,
  adb_enabled: 1,
  listen_addrs: '',
  boot_enabled: true,
  ips: ['192.168.1.42'],
  error_code: 0,
  timestamp: 1795000000,
}

describe('status schema', () => {
  it('accepts a well-formed payload', () => {
    expect(parseStatus(JSON.stringify(status))).toEqual(status)
  })

  it('rejects unknown states and wrong types', () => {
    expect(parseStatus(JSON.stringify({ ...status, state: 'ON' }))).toBeNull()
    expect(parseStatus(JSON.stringify({ ...status, port: '5555' }))).toBeNull()
    expect(parseStatus('not json')).toBeNull()
  })
})

describe('config schema', () => {
  it('accepts a valid config', () => {
    const config = {
      schema: 1,
      port: 5555,
      enabled: false,
      toggle_adb_enabled: true,
      restore_adb_enabled: true,
      retry: 3,
      retry_interval: 10,
      language: 'zh',
    }
    expect(parseConfig(JSON.stringify(config))).toEqual(config)
  })

  it('rejects an unsupported language', () => {
    expect(
      parseConfig(
        JSON.stringify({
          schema: 1,
          port: 5555,
          enabled: false,
          toggle_adb_enabled: true,
          restore_adb_enabled: true,
          retry: 3,
          retry_interval: 10,
          language: 'fr',
        }),
      ),
    ).toBeNull()
  })
})

describe('doctor and log payloads', () => {
  it('parses doctor output', () => {
    const doctor = {
      schema: 1,
      root: true,
      model: 'Pixel',
      android: '14',
      selinux: 'Enforcing',
      adbd_running: true,
      adbd_pids: [42],
      listen_addrs: '',
      tcp_port_prop: '5555',
      adb_enabled: 1,
      config_port: 5555,
      listening: true,
      listener_uid: 0,
      listener_pid: 42,
      port_occupied: false,
      keys_exists: true,
      keys_count: 1,
      ips: ['10.0.0.2'],
      warnings: [],
      timestamp: 1,
    }
    expect(parseDoctor(JSON.stringify(doctor))).toEqual(doctor)
  })

  it('parses log output and rejects a bare array', () => {
    expect(parseLog(JSON.stringify({ lines: ['a', 'b'] }))).toEqual({ lines: ['a', 'b'] })
    expect(parseLog(JSON.stringify(['a']))).toBeNull()
  })

  it('parses command results', () => {
    expect(
      parseResult(
        JSON.stringify({ ok: false, error_code: 16, durable: false, adbd_restarted: true }),
      ),
    ).toMatchObject({
      ok: false,
      error_code: 16,
      durable: false,
      adbd_restarted: true,
    })
  })

  it('parses snapshots with optional sections and errors', () => {
    const snapshot = {
      schema: 1,
      sections: ['status', 'config'],
      status,
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
      errors: {},
    }
    expect(parseSnapshot(JSON.stringify(snapshot))).toEqual(snapshot)
    expect(
      parseSnapshot(JSON.stringify({ schema: 1, sections: ['keys'], errors: { keys: 13 } })),
    ).toMatchObject({ errors: { keys: 13 } })
    expect(parseSnapshot(JSON.stringify({ schema: 1 }))).toBeNull()
  })
})

describe('usb and keys payloads', () => {
  it('parses usb status', () => {
    const usb = {
      schema: 1,
      supports_usb: true,
      adb_enabled: 1,
      developer_enabled: 0,
      functions: ['mtp', 'adb'],
      mode: 'mtp',
      usb_config: 'mtp,adb',
      usb_state: 'CONFIGURED',
      persist_usb_config: 'mtp,adb',
      adb_wifi_supported: true,
      adb_wifi_enabled: 0,
      adb_allowed_connection_time: 604800000,
    }
    expect(parseUsb(JSON.stringify(usb))).toEqual(usb)
    expect(parseUsb(JSON.stringify({ ...usb, mode: 'car' }))).toBeNull()
    expect(parseUsb(JSON.stringify({ ...usb, supports_usb: 'yes' }))).toBeNull()
  })

  it('parses authorized key entries without key material', () => {
    const payload = {
      ok: true,
      keys: [
        { index: 1, id: 'AA:BB', comment: 'desktop@test', algorithm: 'ADB' },
      ],
    }
    expect(parseKeys(JSON.stringify(payload))).toEqual(payload.keys)
    expect(parseKeys(JSON.stringify({ ok: true, keys: [{ id: 1 }] }))).toBeNull()
  })
})

describe('port validation', () => {
  it('enforces the documented range', () => {
    expect(isValidPort(1023)).toBe(false)
    expect(isValidPort(1024)).toBe(true)
    expect(isValidPort(65535)).toBe(true)
    expect(isValidPort(65536)).toBe(false)
    expect(isValidPort(Number.NaN)).toBe(false)
  })
})
