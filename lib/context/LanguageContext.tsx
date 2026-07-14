'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { translations, type Lang } from '@/lib/i18n/translations'

export type TFunction = (key: string, vars?: Record<string, string | number>) => string

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TFunction
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'RO',
  setLang: () => {},
  t: (key) => key,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('RO')

  useEffect(() => {
    // 1. Check stored preference
    const stored = localStorage.getItem('calipal_lang') as Lang | null
    if (stored === 'RO' || stored === 'EN') {
      setLangState(stored)
      return
    }
    // 2. Auto-detect from browser/device language
    const browserLang = (navigator.language ?? navigator.languages?.[0] ?? '').toLowerCase()
    setLangState(browserLang.startsWith('ro') ? 'RO' : 'EN')
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem('calipal_lang', l)
  }, [])

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const dict = translations[lang] as Record<string, string>
    const fallback = translations.RO as Record<string, string>
    let str = dict[key] ?? fallback[key] ?? key
    if (vars) {
      str = Object.entries(vars).reduce(
        (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
        str,
      )
    }
    return str
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

/** Shorthand: just get the t() function */
export function useT(): TFunction {
  return useContext(LanguageContext).t
}
