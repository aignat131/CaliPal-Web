'use client'

import { createContext, useContext } from 'react'

export type Theme = 'light' | 'green' | 'dark'

export const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: 'green', setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}
