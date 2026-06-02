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
import { ChevronRight, Dumbbell, Bell, Users, MessageSquare, UserPlus } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'

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

function NotifPermissionModal({ onAllow, onDismiss }: { onAllow: () => void; onDismiss: () => void }) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#1ED75F18', border: '1px solid #1ED75F30' }}>
            <Bell size={24} className="text-brand-green" />
          </div>
          <div>
            <p className="font-black text-white text-base">{t('notif_modal.title')}</p>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed">{t('notif_modal.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 mb-6">
          {([
            [Users,         'notif_modal.cat_community'],
            [Dumbbell,      'notif_modal.cat_trainings'],
            [MessageSquare, 'notif_modal.cat_messages'],
            [UserPlus,      'notif_modal.cat_friends'],
          ] as const).map(([Icon, key]) => (
            <div key={key} className="flex items-start gap-3">
              <span className="text-brand-green flex-shrink-0 mt-0.5"><Icon size={15} /></span>
              <p className="text-xs text-white/70 text-left leading-relaxed">{t(key)}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onAllow}
            className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm">
            {t('notif_modal.allow')}
          </button>
          <button onClick={onDismiss}
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

  useEffect(() => {
    if (!user || pushStatus !== 'idle') return
    if (!localStorage.getItem(NOTIF_PROMPT_KEY)) setShowNotifModal(true)
  }, [user, pushStatus])

  function dismissNotifModal() {
    localStorage.setItem(NOTIF_PROMPT_KEY, '1')
    setShowNotifModal(false)
  }

  async function allowNotifications() {
    await requestPermission()
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
      {showNotifModal && (
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
            <ErrorBoundary>
              <AppLayoutInner>{children}</AppLayoutInner>
            </ErrorBoundary>
          </NotificationProvider>
        </WorkoutProvider>
      </ThemeProvider>
    </LanguageProvider>
  )
}
