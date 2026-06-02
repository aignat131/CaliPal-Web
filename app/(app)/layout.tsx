'use client'

import { useEffect, useState } from 'react'
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
import { ChevronRight, Dumbbell, Bell, Users, MessageSquare, UserPlus } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { doc, updateDoc } from 'firebase/firestore'
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
  const { isActive, seconds } = useWorkout()
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()

  if (!isActive || pathname === '/workout') return null

  return (
    <button
      onClick={() => router.push('/workout')}
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 px-5 h-11 rounded-full shadow-xl cursor-pointer active:scale-95 transition-transform"
      style={{ backgroundColor: '#1ED75F' }}
    >
      <span className="w-2 h-2 rounded-full bg-black animate-pulse flex-shrink-0" />
      <Dumbbell size={14} className="text-black flex-shrink-0" />
      <span className="text-sm font-black text-black whitespace-nowrap">
        {t('layout.active_workout')} · {formatDuration(seconds)}
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
      <div className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="flex flex-col items-center text-center gap-3 mb-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#1ED75F18', border: '1px solid #1ED75F30' }}>
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
                  backgroundColor: prefs[key] ? '#1ED75F' : 'transparent',
                  border: prefs[key] ? '2px solid #1ED75F' : '2px solid rgba(255,255,255,0.25)',
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

const GUEST_ROUTES = ['/home', '/map', '/community', '/training']

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const isGuestRoute = GUEST_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const { status: pushStatus, requestPermission } = usePushNotifications(user?.uid)
  const [showNotifModal, setShowNotifModal] = useState(false)

  useEffect(() => {
    if (!loading && !user && !isGuestRoute) {
      router.replace('/login')
    }
  }, [user, loading, router, isGuestRoute])

  // Scroll to top on every route change
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (!user || pushStatus !== 'idle') return
    if (!localStorage.getItem(NOTIF_PROMPT_KEY)) setShowNotifModal(true)
  }, [user, pushStatus])

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

  return (
    <div className={`min-h-screen${theme === 'light' ? ' light' : ''}`} style={{ backgroundColor: 'var(--app-bg)' }}>
      {showNotifModal && user && (
        <NotifPermissionModal onAllow={allowNotifications} onDismiss={dismissNotifModal} />
      )}
      <WorkoutUnloadGuard />
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
