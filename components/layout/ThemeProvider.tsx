'use client'

import { useState, useEffect } from 'react'
import { ThemeContext, type Theme } from '@/lib/hooks/useTheme'

const VALID_THEMES: Theme[] = ['light', 'soft', 'green', 'dark', 'blue', 'purple']

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('calipal-theme') as Theme | null
    if (saved && VALID_THEMES.includes(saved)) {
      setThemeState(saved)
    }
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem('calipal-theme', t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
