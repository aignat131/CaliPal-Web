'use client'

import { useEffect } from 'react'

/**
 * Global keyboard avoidance for mobile.
 * When an input/textarea receives focus on a touch device,
 * scrolls it into the visible viewport after the keyboard opens.
 */
export function useKeyboardAvoidance() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Only apply on touch devices
    if (!('ontouchstart' in window)) return

    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement
      if (!target) return
      const tag = target.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !target.isContentEditable) return

      // Delay to let the mobile keyboard animation complete
      setTimeout(() => {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 300)
    }

    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [])
}
