// SPDX-License-Identifier: GPL-3.0-only
import zh from './zh.json'
import en from './en.json'
import type { Language } from '@/lib/schema'

export type Vars = Record<string, string | number>

const dictionaries: Record<Language, Record<string, string>> = { zh, en }

export function translate(lang: Language, key: string, vars?: Vars): string {
  const template = dictionaries[lang][key] ?? dictionaries.zh[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}
