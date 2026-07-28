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
    if (!('serviceWorker' in navigator) || registeredRef.current) return
    registeredRef.current = true

    const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'

    function onUpdateFound(reg: ServiceWorkerRegistration) {
      const newSW = reg.installing
      if (!newSW) return
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'activated' && navigator.serviceWorker.controller) {
          window.location.reload()
        }
      })
    }

    navigator.serviceWorker.register(`/sw.js?v=${buildId}`).then(reg => {
      reg.addEventListener('updatefound', () => onUpdateFound(reg))
      // Force an update check immediately — catches stale cached SW
      reg.update().catch(() => {})
    }).catch(() => {})

    // Also check for updates from any existing registration (e.g., PWA opened from cache)
    navigator.serviceWorker.getRegistration().then(existing => {
      if (existing) {
        existing.addEventListener('updatefound', () => onUpdateFound(existing))
        existing.update().catch(() => {})
      }
    }).catch(() => {})

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
