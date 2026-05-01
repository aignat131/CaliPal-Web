'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, Dumbbell, Map, User, LogIn } from 'lucide-react'
import { useTheme } from '@/lib/hooks/useTheme'
import { useAuth } from '@/lib/hooks/useAuth'

const tabs = [
  { href: '/home',      label: 'Acasă',       Icon: Home },
  { href: '/community', label: 'Comunitate',   Icon: Users },
  { href: '/workout',   label: 'Antrenament',  Icon: Dumbbell },
  { href: '/map',       label: 'Hartă',        Icon: Map },
  { href: '/profile',   label: 'Profil',       Icon: User },
]

const guestTabs = [
  { href: '/home',      label: 'Acasă',       Icon: Home },
  { href: '/community', label: 'Comunitate',   Icon: Users },
  { href: '/workout',   label: 'Antrenament',  Icon: Dumbbell },
  { href: '/map',       label: 'Hartă',        Icon: Map },
  { href: '/login',     label: 'Cont',         Icon: LogIn },
]

export default function AppNav() {
  const pathname = usePathname()
  const { theme } = useTheme()
  const { user, loading } = useAuth()
  const inactiveColor = theme === 'light' ? 'rgba(13,27,26,0.40)' : 'rgba(255,255,255,0.45)'
  const navTabs = (!loading && !user) ? guestTabs : tabs

  return (
    <>
      {/* ── Mobile bottom bar (hidden on md+) ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-white/8 md:hidden"
        style={{ backgroundColor: 'var(--app-bg)', height: 64 }}
      >
        {navTabs.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
            >
              <Icon
                size={22}
                className="transition-all duration-200"
                style={{
                  color: active ? '#1ED75F' : inactiveColor,
                  transform: active ? 'translateY(-2px)' : 'translateY(0)',
                }}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span
                className="text-[10px] font-semibold tracking-wide transition-colors"
                style={{ color: active ? '#1ED75F' : inactiveColor }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* ── Desktop left sidebar (hidden below md) ── */}
      <nav
        className="hidden md:flex fixed top-0 left-0 bottom-0 z-50 flex-col items-center pt-6 pb-4 border-r border-white/8 lg:w-48 w-16"
        style={{ backgroundColor: 'var(--app-bg)' }}
      >
        {/* Logo mark */}
        <div className="mb-8 flex items-center justify-center w-full px-3">
          <span className="text-brand-green font-black text-xl tracking-tight lg:inline hidden">CaliPal</span>
          <span className="text-brand-green font-black text-xl lg:hidden">C</span>
        </div>

        <div className="flex flex-col gap-1 w-full px-2 flex-1">
          {navTabs.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group"
                style={{
                  backgroundColor: active ? '#1ED75F18' : 'transparent',
                }}
              >
                <Icon
                  size={20}
                  className="flex-shrink-0 transition-colors"
                  style={{ color: active ? '#1ED75F' : inactiveColor }}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                <span
                  className="text-sm font-semibold tracking-wide transition-colors hidden lg:block"
                  style={{ color: active ? '#1ED75F' : inactiveColor }}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
