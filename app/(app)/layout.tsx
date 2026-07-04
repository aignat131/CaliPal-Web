'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useTheme } from '@/lib/hooks/useTheme'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import AppNav from '@/components/layout/AppNav'
import OfflineBanner from '@/components/layout/OfflineBanner'
import { WorkoutProvider, useWorkout } from '@/lib/context/WorkoutContext'
import { NotificationProvider } from '@/lib/context/NotificationContext'
import { LanguageProvider } from '@/lib/context/LanguageContext'
import { ToastProvider } from '@/lib/context/ToastContext'
import { ChevronRight, Dumbbell, Bell, Users, MessageSquare, UserPlus, Palette } from 'lucide-react'
import type { Theme } from '@/lib/hooks/useTheme'
import { useT } from '@/lib/context/LanguageContext'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import TrainingPhotoBanner from '@/components/training/TrainingPhotoBanner'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { useKeyboardAvoidance } from '@/lib/hooks/useKeyboardAvoidance'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** Warn before page unload when a workout is active */
function WorkoutUnloadGuard() {
  const { isActive } = useWorkout()
  useEffect(() => {
    if (!isActive) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isActive])
  return null
}

/** Floating pill shown when a workout is active and the user is on another page */
function WorkoutMiniBar() {
  const { isActive, isPaused, seconds } = useWorkout()
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()

  if (!isActive || pathname === '/workout') return null

  return (
    <button
      onClick={() => router.push('/workout')}
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 px-5 h-11 rounded-full shadow-xl cursor-pointer active:scale-95 transition-transform"
      style={{ backgroundColor: isPaused ? '#facc15' : 'var(--accent)' }}
    >
      {isPaused
        ? <span className="w-2 h-2 rounded-sm bg-black flex-shrink-0" />
        : <span className="w-2 h-2 rounded-full bg-black animate-pulse flex-shrink-0" />
      }
      <Dumbbell size={14} className="text-black flex-shrink-0" />
      <span className="text-sm font-black text-black whitespace-nowrap">
        {isPaused ? 'Pauză' : t('layout.active_workout')} · {formatDuration(seconds)}
      </span>
      <ChevronRight size={15} className="text-black flex-shrink-0" />
    </button>
  )
}

const NOTIF_PROMPT_KEY = 'calipal_notif_prompt_seen'

type NotifPrefs = {
  pushNotifCommunity: boolean
  pushNotifTrainings: boolean
  pushNotifMessages: boolean
  pushNotifFriends: boolean
}

const NOTIF_CATEGORIES: { key: keyof NotifPrefs; Icon: React.ElementType; labelKey: string }[] = [
  { key: 'pushNotifCommunity', Icon: Users,         labelKey: 'notif_modal.cat_community' },
  { key: 'pushNotifTrainings', Icon: Dumbbell,      labelKey: 'notif_modal.cat_trainings' },
  { key: 'pushNotifMessages',  Icon: MessageSquare, labelKey: 'notif_modal.cat_messages'  },
  { key: 'pushNotifFriends',   Icon: UserPlus,      labelKey: 'notif_modal.cat_friends'   },
]

function NotifPermissionModal({
  onAllow,
  onDismiss,
}: {
  onAllow: (prefs: NotifPrefs) => void
  onDismiss: () => void
}) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)
  const [prefs, setPrefs] = useState<NotifPrefs>({
    pushNotifCommunity: true,
    pushNotifTrainings: true,
    pushNotifMessages:  true,
    pushNotifFriends:   true,
  })

  const allChecked = Object.values(prefs).every(Boolean)

  function toggle(key: keyof NotifPrefs) {
    setPrefs(p => ({ ...p, [key]: !p[key] }))
  }

  function toggleAll() {
    const next = !allChecked
    setPrefs({ pushNotifCommunity: next, pushNotifTrainings: next, pushNotifMessages: next, pushNotifFriends: next })
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 px-6">
      <div ref={panelRef} className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="flex flex-col items-center text-center gap-3 mb-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.09)', border: '1px solid rgba(var(--accent-rgb), 0.19)' }}>
            <Bell size={24} className="text-brand-green" />
          </div>
          <div>
            <p className="font-black text-white text-base">{t('notif_modal.title')}</p>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed">{t('notif_modal.subtitle')}</p>
          </div>
        </div>

        {/* Category checkboxes */}
        <div className="flex flex-col gap-1 mb-3">
          {NOTIF_CATEGORIES.map(({ key, Icon, labelKey }) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors active:bg-white/5"
            >
              {/* Custom checkbox */}
              <span
                className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: prefs[key] ? 'var(--accent)' : 'transparent',
                  border: prefs[key] ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.25)',
                }}
              >
                {prefs[key] && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <span className="text-brand-green flex-shrink-0"><Icon size={15} /></span>
              <p className="text-xs text-white/75 text-left leading-relaxed flex-1">{t(labelKey)}</p>
            </button>
          ))}
        </div>

        {/* Select / deselect all */}
        <div className="flex justify-end mb-4">
          <button
            onClick={toggleAll}
            className="text-xs font-semibold text-brand-green/80 px-1"
          >
            {allChecked ? t('notif_modal.deselect_all') : t('notif_modal.select_all')}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onAllow(prefs)}
            className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm">
            {t('notif_modal.allow')}
          </button>
          <button
            onClick={onDismiss}
            className="w-full h-10 rounded-2xl text-white/45 text-sm font-semibold">
            {t('notif_modal.later')}
          </button>
        </div>
      </div>
    </div>
  )
}

const THEME_PICKER_KEY = 'calipal_theme_picked'

const THEME_CLASS: Record<Theme, string> = {
  light: 'light',
  soft: 'soft',
  green: '',
  dark: 'dark-deep',
  blue: 'theme-blue',
  purple: 'theme-purple',
}

const THEME_SWATCHES: { key: Theme; swatch: string }[] = [
  { key: 'light',  swatch: '#F3F4F0' },
  { key: 'soft',   swatch: '#D4D5D0' },
  { key: 'green',  swatch: '#1ED75F' },
  { key: 'dark',   swatch: '#0D2E2B' },
  { key: 'blue',   swatch: '#3B82F6' },
  { key: 'purple', swatch: '#A855F7' },
]

function ThemePickerModal({ onConfirm, onSkip }: { onConfirm: () => void; onSkip: () => void }) {
  const { theme, setTheme } = useTheme()
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 px-6">
      <div ref={panelRef} className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.09)', border: '1px solid rgba(var(--accent-rgb), 0.19)' }}>
            <Palette size={24} className="text-brand-green" />
          </div>
          <div>
            <p className="font-black text-white text-base">{t('theme_picker.title')}</p>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed">{t('theme_picker.subtitle')}</p>
          </div>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          {THEME_SWATCHES.map(({ key, swatch }) => (
            <button key={key} onClick={() => setTheme(key)}
              className="w-10 h-10 rounded-full transition-all duration-200"
              style={{
                backgroundColor: swatch,
                border: theme === key ? '2.5px solid var(--accent)' : '2px solid rgba(255,255,255,0.15)',
                transform: theme === key ? 'scale(1.18)' : 'scale(1)',
                boxShadow: theme === key ? '0 0 14px rgba(var(--accent-rgb), 0.35)' : 'none',
              }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={onConfirm}
            className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm">
            {t('theme_picker.confirm')}
          </button>
          <button onClick={onSkip}
            className="w-full h-10 rounded-2xl text-white/45 text-sm font-semibold">
            {t('theme_picker.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}

const GUEST_ROUTES = ['/home', '/map', '/community', '/training']

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const isGuestRoute = GUEST_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const { status: pushStatus, requestPermission } = usePushNotifications(user?.uid)
  const [showNotifModal, setShowNotifModal] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  useKeyboardAvoidance()

  useEffect(() => {
    if (!loading && !user && !isGuestRoute) {
      router.replace('/login')
    }
  }, [user, loading, router, isGuestRoute])

  // Scroll to top on every route change
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // Show theme picker on first visit (before notification modal)
  useEffect(() => {
    if (!user) return
    if (!localStorage.getItem(THEME_PICKER_KEY)) setShowThemePicker(true)
  }, [user])

  useEffect(() => {
    if (!user || pushStatus !== 'idle') return
    if (showThemePicker) return // Wait for theme picker to be dismissed first
    if (!localStorage.getItem(NOTIF_PROMPT_KEY)) setShowNotifModal(true)
  }, [user, pushStatus, showThemePicker])

  // Track online/lastSeen status
  useEffect(() => {
    if (!user) return
    const userRef = doc(db, 'users', user.uid)
    const setOnline  = () => updateDoc(userRef, { isOnline: true }).catch(() => {})
    const setOffline = () => updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {})
    setOnline()
    window.addEventListener('focus', setOnline)
    window.addEventListener('blur',  setOffline)
    window.addEventListener('beforeunload', setOffline)
    return () => {
      setOffline()
      window.removeEventListener('focus', setOnline)
      window.removeEventListener('blur',  setOffline)
      window.removeEventListener('beforeunload', setOffline)
    }
  }, [user])

  function dismissThemePicker() {
    localStorage.setItem(THEME_PICKER_KEY, '1')
    setShowThemePicker(false)
  }

  function dismissNotifModal() {
    localStorage.setItem(NOTIF_PROMPT_KEY, '1')
    setShowNotifModal(false)
  }

  async function allowNotifications(prefs: NotifPrefs) {
    await requestPermission()
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { ...prefs })
      } catch { /* non-critical — defaults are all true */ }
    }
    dismissNotifModal()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user && !isGuestRoute) return null

  const themeClass = THEME_CLASS[theme]

  return (
    <div className={`min-h-screen${themeClass ? ` ${themeClass}` : ''}`} style={{ backgroundColor: 'var(--app-bg)' }}>
      {showThemePicker && user && (
        <ThemePickerModal onConfirm={dismissThemePicker} onSkip={dismissThemePicker} />
      )}
      {showNotifModal && !showThemePicker && user && (
        <NotifPermissionModal onAllow={allowNotifications} onDismiss={dismissNotifModal} />
      )}
      <WorkoutUnloadGuard />
      <TrainingPhotoBanner />
      <OfflineBanner />
      <AppNav />
      <WorkoutMiniBar />
      {/* On mobile: pb-16 for bottom nav. On desktop: ml-16 (icon sidebar) or ml-48 (label sidebar) */}
      <main className="md:pb-0 md:ml-16 lg:ml-48" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}>
        {children}
      </main>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <WorkoutProvider>
          <NotificationProvider>
            <ToastProvider>
              <ErrorBoundary>
                <AppLayoutInner>{children}</AppLayoutInner>
              </ErrorBoundary>
            </ToastProvider>
          </NotificationProvider>
        </WorkoutProvider>
      </ThemeProvider>
    </LanguageProvider>
  )
}
