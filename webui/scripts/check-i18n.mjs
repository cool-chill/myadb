// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const langs = ['zh', 'en']

function load(lang) {
  return JSON.parse(readFileSync(join(here, '..', 'src', 'i18n', `${lang}.json`), 'utf8'))
}

function placeholders(value) {
  const found = value.match(/\{\w+\}/g) ?? []
  return [...new Set(found)].sort().join(',')
}

const dicts = Object.fromEntries(langs.map((lang) => [lang, load(lang)]))
const keys = Object.fromEntries(langs.map((lang) => [lang, Object.keys(dicts[lang]).sort()]))

let failed = false

for (const lang of langs) {
  for (const key of keys[lang]) {
    const value = dicts[lang][key]
    if (typeof value !== 'string' || value.trim() === '') {
      console.error(`[i18n] ${lang}: empty value for "${key}"`)
      failed = true
    }
  }
}

const reference = langs[0]
for (const lang of langs.slice(1)) {
  const missing = keys[reference].filter((key) => !keys[lang].includes(key))
  const extra = keys[lang].filter((key) => !keys[reference].includes(key))
  for (const key of missing) {
    console.error(`[i18n] ${lang}: missing key "${key}"`)
    failed = true
  }
  for (const key of extra) {
    console.error(`[i18n] ${lang}: unexpected key "${key}"`)
    failed = true
  }
}

for (const key of keys[reference]) {
  const variants = langs.map((lang) => (dicts[lang][key] ? placeholders(dicts[lang][key]) : ''))
  if (new Set(variants).size > 1) {
    console.error(`[i18n] placeholder mismatch for "${key}": ${JSON.stringify(variants)}`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.log(`[i18n] ${langs.join('/')} dictionaries match (${keys[reference].length} keys)`)
