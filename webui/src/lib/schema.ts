// SPDX-License-Identifier: GPL-3.0-only
import { z } from 'zod'

export const stateSchema = z.enum(['ACTIVE', 'IDLE', 'DEGRADED', 'BLOCKED', 'ERROR'])
export type AdbState = z.infer<typeof stateSchema>

export const statusSchema = z.object({
  schema: z.number().int(),
  state: stateSchema,
  port: z.number().int(),
  listening: z.boolean(),
  listener_uid: z.number().int(),
  listener_pid: z.number().int(),
  adbd_running: z.boolean(),
  adb_enabled: z.number().int(),
  listen_addrs: z.string(),
  boot_enabled: z.boolean(),
  ips: z.array(z.string()),
  error_code: z.number().int(),
  timestamp: z.number().int(),
})
export type Status = z.infer<typeof statusSchema>

export const languageSchema = z.enum(['zh', 'en'])
export type Language = z.infer<typeof languageSchema>

export const configSchema = z.object({
  schema: z.number().int(),
  port: z.number().int(),
  enabled: z.boolean(),
  toggle_adb_enabled: z.boolean(),
  restore_adb_enabled: z.boolean(),
  notification: z.boolean(),
  retry: z.number().int(),
  retry_interval: z.number().int(),
  language: languageSchema,
})
export type Config = z.infer<typeof configSchema>

export const doctorSchema = z
  .object({
    schema: z.number().int(),
    root: z.boolean(),
    model: z.string(),
    android: z.string(),
    selinux: z.string(),
    adbd_running: z.boolean(),
    adbd_pids: z.array(z.number().int()),
    listen_addrs: z.string(),
    tcp_port_prop: z.string(),
    adb_enabled: z.number().int(),
    config_port: z.number().int(),
    listening: z.boolean(),
    listener_uid: z.number().int(),
    listener_pid: z.number().int(),
    port_occupied: z.boolean(),
    keys_exists: z.boolean(),
    keys_count: z.number().int(),
    ips: z.array(z.string()),
    warnings: z.array(z.string()),
    timestamp: z.number().int(),
  })
  .passthrough()
export type Doctor = z.infer<typeof doctorSchema>

export const usbSchema = z.object({
  schema: z.number().int(),
  supports_usb: z.boolean(),
  adb_enabled: z.number().int(),
  developer_enabled: z.number().int(),
  functions: z.array(z.string()),
  mode: z.enum(['mtp', 'ptp', 'rndis', 'midi', 'charging', 'unknown']),
})
export type UsbState = z.infer<typeof usbSchema>

export const keyEntrySchema = z.object({
  index: z.number().int(),
  id: z.string(),
  comment: z.string(),
  algorithm: z.string(),
})
export type KeyEntry = z.infer<typeof keyEntrySchema>

export const keysListSchema = z.object({
  ok: z.boolean(),
  keys: z.array(keyEntrySchema),
})

export const logSchema = z.object({
  lines: z.array(z.string()),
})
export type LogResult = z.infer<typeof logSchema>

export const resultSchema = z
  .object({
    ok: z.boolean(),
    error_code: z.number().int(),
    message: z.string().optional(),
    added: z.number().int().optional(),
    skipped: z.number().int().optional(),
    invalid: z.number().int().optional(),
    path: z.string().optional(),
    backup: z.string().optional(),
  })
  .passthrough()
export type CommandResultBody = z.infer<typeof resultSchema>

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function parseStatus(raw: string): Status | null {
  const result = statusSchema.safeParse(parseJson(raw))
  return result.success ? result.data : null
}

export function parseConfig(raw: string): Config | null {
  const result = configSchema.safeParse(parseJson(raw))
  return result.success ? result.data : null
}

export function parseDoctor(raw: string): Doctor | null {
  const result = doctorSchema.safeParse(parseJson(raw))
  return result.success ? result.data : null
}

export function parseUsb(raw: string): UsbState | null {
  const result = usbSchema.safeParse(parseJson(raw))
  return result.success ? result.data : null
}

export function parseKeys(raw: string): KeyEntry[] | null {
  const result = keysListSchema.safeParse(parseJson(raw))
  return result.success ? result.data.keys : null
}

export function parseLog(raw: string): LogResult | null {
  const result = logSchema.safeParse(parseJson(raw))
  return result.success ? result.data : null
}

export function parseResult(raw: string): CommandResultBody | null {
  const result = resultSchema.safeParse(parseJson(raw))
  return result.success ? result.data : null
}

export function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1024 && value <= 65535
}
