'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useTheme } from '@/lib/hooks/useTheme'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import AppNav from '@/components/layout/AppNav'
import OfflineBanner from '@/components/layout/OfflineBanner'
import { WorkoutProvider, useWorkout } from '@/lib/context/WorkoutContext'
import { ChevronRight, Dumbbell } from 'lucide-react'

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** Floating pill shown when a workout is active and the user is on another page */
function WorkoutMiniBar() {
  const { isActive, seconds } = useWorkout()
  const pathname = usePathname()
  const router = useRouter()

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
        Antrenament activ · {formatDuration(seconds)}
      </span>
      <ChevronRight size={15} className="text-black flex-shrink-0" />
    </button>
  )
}

const GUEST_ROUTES = ['/home', '/map', '/community', '/training']

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const isGuestRoute = GUEST_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  useEffect(() => {
    if (!loading && !user && !isGuestRoute) {
      router.replace('/login')
    }
  }, [user, loading, router, isGuestRoute])

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
      <OfflineBanner />
      <AppNav />
      <WorkoutMiniBar />
      {/* On mobile: pb-16 for bottom nav. On desktop: ml-16 (icon sidebar) or ml-48 (label sidebar) */}
      <main className="pb-16 md:pb-0 md:ml-16 lg:ml-48">
        {children}
      </main>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WorkoutProvider>
        <AppLayoutInner>{children}</AppLayoutInner>
      </WorkoutProvider>
    </ThemeProvider>
  )
}
