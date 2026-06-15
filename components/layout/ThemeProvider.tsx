'use client'

import { useState, useEffect } from 'react'
import { ThemeContext, type Theme } from '@/lib/hooks/useTheme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('green')

  useEffect(() => {
    const saved = localStorage.getItem('calipal-theme')
    // Migrate old 'dark' value → 'green' (the teal theme)
    if (saved === 'dark') {
      localStorage.setItem('calipal-theme', 'green')
      setThemeState('green')
    } else if (saved === 'light' || saved === 'green') {
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
