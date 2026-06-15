'use client'

import { createContext, useContext } from 'react'

export type Theme = 'light' | 'soft' | 'green' | 'dark' | 'blue' | 'purple'

export const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: 'dark', setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}
