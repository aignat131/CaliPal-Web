'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/lib/hooks/useAuth'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { LocationSharingMode } from '@/types'
import {
  ArrowLeft, ChevronRight, User, LogOut, Lock, Info, Bell,
  Shield, Sun, Moon, Globe, Ruler, MapPin,
} from 'lucide-react'
import { useTheme } from '@/lib/hooks/useTheme'

const SUPERADMIN = 'aignat131@gmail.com'

const LOCATION_MODE_LABELS: Record<LocationSharingMode, string> = {
  OFF: 'Oprit',
  FRIENDS_ONLY: 'Doar prieteni',
  EVERYWHERE: 'Toată lumea',
  TRAINING_ONLY: 'Antrenamente',
}

export default function SettingsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [showLogout, setShowLogout] = useState(false)
  const { status: pushStatus, requestPermission } = usePushNotifications(user?.uid)
  const { theme, toggle } = useTheme()

  const [language, setLanguage] = useState<'RO' | 'EN'>('RO')
  const [units, setUnits] = useState<'Metric' | 'Imperial'>('Metric')
  const [locationMode, setLocationMode] = useState<LocationSharingMode>('EVERYWHERE')
  const [isCoach, setIsCoach] = useState(false)

  useEffect(() => {
    setLanguage((localStorage.getItem('calipal_lang') as 'RO' | 'EN') ?? 'RO')
    setUnits((localStorage.getItem('calipal_units') as 'Metric' | 'Imperial') ?? 'Metric')
  }, [])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      const mode = snap.data()?.locationSharingMode as LocationSharingMode | undefined
      if (mode) setLocationMode(mode)
      setIsCoach(snap.data()?.isCoach ?? false)
    })
    return unsub
  }, [user])

  function setLang(lang: 'RO' | 'EN') {
    setLanguage(lang)
    localStorage.setItem('calipal_lang', lang)
  }

  function setUnit(u: 'Metric' | 'Imperial') {
    setUnits(u)
    localStorage.setItem('calipal_units', u)
  }

  async function setLocMode(mode: LocationSharingMode) {
    setLocationMode(mode)
    if (user) await updateDoc(doc(db, 'users', user.uid), { locationSharingMode: mode })
  }

  async function handleLogout() {
    await signOut(auth)
    router.replace('/login')
  }

  const pushLabel =
    pushStatus === 'granted' ? 'Activate' :
    pushStatus === 'denied' ? 'Blocate (din browser)' :
    pushStatus === 'unsupported' ? 'Nesuportate' : 'Inactive'

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <h2 className="text-lg font-bold text-white mb-2">Deconectare</h2>
            <p className="text-sm text-white/60 mb-6">Ești sigur că vrei să te deconectezi?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogout(false)}
                className="flex-1 h-11 rounded-xl border border-white/20 text-sm font-semibold text-white/80">
                Anulează
              </button>
              <button onClick={handleLogout}
                className="flex-1 h-11 rounded-xl bg-red-500/80 text-white text-sm font-bold">
                Deconectare
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Setări</h1>
        </div>

        {/* Account */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">CONT</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <SettingsRow icon={<User size={17} />} label="Date Personale" href="/profile/edit" />
          <SettingsRow icon={<Lock size={17} />} label="Confidențialitate" href="/profile/privacy" />
        </div>

        {/* Notifications */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">NOTIFICĂRI</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-brand-green"><Bell size={17} /></span>
            <span className="flex-1 text-sm font-medium text-white">Notificări Push</span>
            {pushStatus === 'idle' ? (
              <button onClick={requestPermission}
                className="h-7 px-3 rounded-full bg-brand-green text-black text-xs font-bold">
                Activează
              </button>
            ) : (
              <span className={`text-xs font-semibold ${pushStatus === 'granted' ? 'text-brand-green' : 'text-white/35'}`}>
                {pushLabel}
              </span>
            )}
          </div>
        </div>

        {/* Location sharing */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">LOCAȚIE</p>
        <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="px-4 pt-3.5 pb-1 flex items-center gap-3">
            <span className="text-brand-green"><MapPin size={17} /></span>
            <span className="text-sm font-medium text-white">Partajare locație</span>
          </div>
          <div className="px-4 pb-3.5 grid grid-cols-2 gap-1.5 mt-2">
            {(['OFF', 'FRIENDS_ONLY', 'EVERYWHERE', 'TRAINING_ONLY'] as LocationSharingMode[]).map(mode => (
              <button key={mode} onClick={() => setLocMode(mode)}
                className={`h-8 rounded-xl text-xs font-semibold transition-colors ${
                  locationMode === mode
                    ? 'bg-brand-green text-black'
                    : 'border border-white/15 text-white/50'
                }`}>
                {LOCATION_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        {/* Preferences */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">PREFERINȚE</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          {/* Theme */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-brand-green">
              {theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}
            </span>
            <span className="flex-1 text-sm font-medium text-white">
              {theme === 'light' ? 'Mod luminos' : 'Mod întunecat'}
            </span>
            <button onClick={toggle}
              className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
              style={{ backgroundColor: theme === 'light' ? '#1ED75F' : 'rgba(255,255,255,0.2)' }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                style={{ left: theme === 'light' ? '22px' : '2px' }} />
            </button>
          </div>

          {/* Language */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-brand-green"><Globe size={17} /></span>
            <span className="flex-1 text-sm font-medium text-white">Limbă</span>
            <div className="flex gap-1.5">
              {(['RO', 'EN'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
                    language === l ? 'bg-brand-green text-black' : 'border border-white/20 text-white/50'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          {/* Units */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-brand-green"><Ruler size={17} /></span>
            <span className="flex-1 text-sm font-medium text-white">Unități</span>
            <div className="flex gap-1.5">
              {(['Metric', 'Imperial'] as const).map(u => (
                <button key={u} onClick={() => setUnit(u)}
                  className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
                    units === u ? 'bg-brand-green text-black' : 'border border-white/20 text-white/50'
                  }`}>{u === 'Metric' ? 'kg' : 'lbs'}</button>
              ))}
            </div>
          </div>
        </div>

        {/* About */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">ALTELE</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <SettingsRow icon={<Info size={17} />} label="Despre aplicație" value="v1.0.0" href="/profile/about" />
        </div>

        {/* Coach Hub */}
        {isCoach && (
          <>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">ANTRENOR</p>
            <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              <SettingsRow icon={<Shield size={17} />} label="Coach Hub" href="/coach" />
            </div>
          </>
        )}

        {/* Admin Hub */}
        {user?.email === SUPERADMIN && (
          <>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">ADMIN</p>
            <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              <SettingsRow icon={<Shield size={17} />} label="Admin Hub" href="/admin" />
            </div>
          </>
        )}

        <button onClick={() => setShowLogout(true)}
          className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm text-white bg-red-500/20 border border-red-500/30">
          <LogOut size={16} /> Deconectare
        </button>
      </div>
    </div>
  )
}

function SettingsRow({ icon, label, value, href }: {
  icon: React.ReactNode; label: string; value?: string; href: string
}) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors cursor-pointer">
        <span className="text-brand-green">{icon}</span>
        <span className="flex-1 text-sm font-medium text-white">{label}</span>
        {value && <span className="text-xs text-white/40 mr-1">{value}</span>}
        <ChevronRight size={15} className="text-white/30" />
      </div>
    </Link>
  )
}
