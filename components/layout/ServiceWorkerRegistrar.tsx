'use client'

import { useEffect, useRef } from 'react'

// Expose the install prompt so the app can trigger it later (e.g., from a Settings page)
let _deferredPrompt: BeforeInstallPromptEvent | null = null
export function getInstallPrompt() { return _deferredPrompt }
export function clearInstallPrompt() { _deferredPrompt = null }

// Non-standard browser event — extend EventTarget for correct typing
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export function ServiceWorkerRegistrar() {
  const registeredRef = useRef(false)

  useEffect(() => {
    // Register SW once, appending the build ID so the browser sees a new file on each deploy
    if ('serviceWorker' in navigator && !registeredRef.current) {
      registeredRef.current = true
      const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'
      navigator.serviceWorker.register(`/sw.js?v=${buildId}`).catch(() => {})
    }

    // Capture the PWA install prompt — prevents the default mini-infobar
    // and lets us show our own install UI at the right moment
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      _deferredPrompt = e
      // Dispatch a custom event so any component can listen for install availability
      window.dispatchEvent(new CustomEvent('pwa-installable'))
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  return null
}
