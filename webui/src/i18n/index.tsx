// SPDX-License-Identifier: GPL-3.0-only
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Language } from '@/lib/schema'
import { translate, type Vars } from './translate'

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string, vars?: Vars) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('zh')

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    try {
      localStorage.setItem('myadb.lang', next)
    } catch {
      // storage can be unavailable
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
    }
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('myadb.lang')
      if (saved === 'zh' || saved === 'en') setLangState(saved)
    } catch {
      // storage can be unavailable
    }
  }, [])

  const t = useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang])

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
