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
  Shield, Palette, MapPin, Globe, MessageSquarePlus,
  MessageSquare, Dumbbell, Newspaper, Send, CheckCircle, Users, UserPlus,
  Download,
} from 'lucide-react'
import { getInstallPrompt, clearInstallPrompt } from '@/components/layout/ServiceWorkerRegistrar'
import { useTheme } from '@/lib/hooks/useTheme'
import { useLanguage } from '@/lib/context/LanguageContext'

const SUPERADMIN = process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? ''

// ── Toggle row helper ──────────────────────────────────────────────────────────
function EmailToggleRow({
  icon, label, desc, value, onToggle,
}: {
  icon: React.ReactNode
  label: string
  desc: string
  value: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="text-brand-green flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-tight">{label}</p>
        <p className="text-[11px] text-white/35 mt-0.5 leading-snug">{desc}</p>
      </div>
      <button
        onClick={onToggle}
        className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
        style={{ backgroundColor: value ? 'var(--accent)' : 'rgba(255,255,255,0.2)' }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
          style={{ left: value ? '22px' : '2px' }}
        />
      </button>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [showLogout, setShowLogout] = useState(false)
  const { status: pushStatus, requestPermission } = usePushNotifications(user?.uid)
  const { theme, setTheme } = useTheme()
  const { lang, setLang, t } = useLanguage()

  const isSuperAdmin = user?.email === SUPERADMIN

  // User doc state
  const [locationMode, setLocationMode] = useState<LocationSharingMode>('EVERYWHERE')
  const [isCoach, setIsCoach] = useState(false)
  const [msgEmailNotif,      setMsgEmailNotif]      = useState(true)
  const [trainingEmailNotif, setTrainingEmailNotif] = useState(true)
  const [newsEmailNotif,     setNewsEmailNotif]     = useState(true)
  const [pushNotifMessages,  setPushNotifMessages]  = useState(true)
  const [pushNotifTrainings, setPushNotifTrainings] = useState(true)
  const [pushNotifCommunity, setPushNotifCommunity] = useState(true)
  const [pushNotifFriends,   setPushNotifFriends]   = useState(true)

  // PWA install prompt
  const [pwaInstallable, setPwaInstallable] = useState(false)

  useEffect(() => {
    if (getInstallPrompt()) setPwaInstallable(true)
    const handler = () => setPwaInstallable(true)
    window.addEventListener('pwa-installable', handler)
    return () => window.removeEventListener('pwa-installable', handler)
  }, [])

  async function handlePwaInstall() {
    const prompt = getInstallPrompt()
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') { clearInstallPrompt(); setPwaInstallable(false) }
  }

  // Broadcast state (superadmin only)
  const [bSubject,  setBSubject]  = useState('')
  const [bBody,     setBBody]     = useState('')
  const [bSending,  setBSending]  = useState(false)
  const [bResult,   setBResult]   = useState<{ sent: number } | null>(null)
  const [bError,    setBError]    = useState('')
  const [bConfirm,  setBConfirm]  = useState(false)

  const LOCATION_MODE_LABELS: Record<LocationSharingMode, string> = {
    OFF:           t('settings.loc_off'),
    FRIENDS_ONLY:  t('settings.loc_friends'),
    EVERYWHERE:    t('settings.loc_everyone'),
    TRAINING_ONLY: t('settings.loc_workouts'),
  }

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      const d = snap.data() ?? {}
      const mode = d.locationSharingMode as LocationSharingMode | undefined
      if (mode) setLocationMode(mode)
      setIsCoach(d.isCoach ?? false)
      setMsgEmailNotif(d.messageEmailNotifications  !== false)
      setTrainingEmailNotif(d.trainingEmailNotifications !== false)
      setNewsEmailNotif(d.newsEmailNotifications    !== false)
      setPushNotifMessages( d.pushNotifMessages  !== false)
      setPushNotifTrainings(d.pushNotifTrainings !== false)
      setPushNotifCommunity(d.pushNotifCommunity !== false)
      setPushNotifFriends(  d.pushNotifFriends   !== false)
    })
    return unsub
  }, [user])

  async function setLocMode(mode: LocationSharingMode) {
    const prev = locationMode
    setLocationMode(mode)
    try {
      if (user) await updateDoc(doc(db, 'users', user.uid), { locationSharingMode: mode })
    } catch {
      setLocationMode(prev)
    }
  }

  function makeEmailToggle(
    field: 'messageEmailNotifications' | 'trainingEmailNotifications' | 'newsEmailNotifications',
    current: boolean,
    setter: (v: boolean) => void,
  ) {
    return async () => {
      const newVal = !current
      setter(newVal)
      try {
        if (user) await updateDoc(doc(db, 'users', user.uid), { [field]: newVal })
      } catch {
        setter(current)
      }
    }
  }

  function makePushToggle(
    field: 'pushNotifMessages' | 'pushNotifTrainings' | 'pushNotifCommunity' | 'pushNotifFriends',
    current: boolean,
    setter: (v: boolean) => void,
  ) {
    return async () => {
      const newVal = !current
      setter(newVal)
      try {
        if (user) await updateDoc(doc(db, 'users', user.uid), { [field]: newVal })
      } catch {
        setter(current)
      }
    }
  }

  async function handleLogout() {
    await signOut(auth)
    router.replace('/login')
  }

  async function handleBroadcast() {
    if (!bSubject.trim() || !bBody.trim()) return
    setBSending(true)
    setBError('')
    setBResult(null)
    setBConfirm(false)
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/email/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ subject: bSubject.trim(), body: bBody.trim() }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.reason ?? 'failed')
      setBResult({ sent: data.sent })
      setBSubject('')
      setBBody('')
    } catch {
      setBError(t('settings.broadcast_error'))
    } finally {
      setBSending(false)
    }
  }

  const pushLabel =
    pushStatus === 'granted'     ? t('settings.push_active') :
    pushStatus === 'denied'      ? t('settings.push_blocked') :
    pushStatus === 'unsupported' ? t('settings.push_unsupported') : t('settings.push_inactive')

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Logout dialog */}
      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <h2 className="text-lg font-bold text-white mb-2">{t('common.logout_title')}</h2>
            <p className="text-sm text-white/60 mb-6">{t('common.logout_text')}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogout(false)}
                className="flex-1 h-11 rounded-xl border border-white/20 text-sm font-semibold text-white/80">
                {t('common.cancel')}
              </button>
              <button onClick={handleLogout}
                className="flex-1 h-11 rounded-xl bg-red-500/80 text-white text-sm font-bold">
                {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast confirm dialog */}
      {bConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <h2 className="text-base font-bold text-white mb-2">{t('settings.broadcast_send')}</h2>
            <p className="text-sm text-white/60 mb-6">{t('settings.broadcast_confirm')}</p>
            <div className="flex gap-3">
              <button onClick={() => setBConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-white/20 text-sm font-semibold text-white/80">
                {t('common.cancel')}
              </button>
              <button onClick={handleBroadcast}
                className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold">
                {t('settings.broadcast_send')}
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
          <h1 className="text-lg font-black text-white">{t('settings.title')}</h1>
        </div>

        {/* Account */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_account')}</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <SettingsRow icon={<User size={17} />}  label={t('settings.personal_data')} href="/profile/edit" />
          <SettingsRow icon={<Lock size={17} />}  label={t('settings.privacy')}       href="/profile/privacy" />
        </div>

        {/* Push notifications */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_notif')}</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-brand-green"><Bell size={17} /></span>
            <span className="flex-1 text-sm font-medium text-white">{t('settings.push')}</span>
            {pushStatus === 'idle' ? (
              <button onClick={requestPermission}
                className="h-7 px-3 rounded-full bg-brand-green text-black text-xs font-bold">
                {t('settings.push_enable')}
              </button>
            ) : (
              <span className={`text-xs font-semibold ${pushStatus === 'granted' ? 'text-brand-green' : 'text-white/35'}`}>
                {pushLabel}
              </span>
            )}
          </div>
        </div>

        {/* Push notification categories */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_push_cats')}</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <EmailToggleRow
            icon={<MessageSquare size={17} />}
            label={t('settings.push_cat_messages')}
            desc={t('settings.push_cat_messages_desc')}
            value={pushNotifMessages}
            onToggle={makePushToggle('pushNotifMessages', pushNotifMessages, setPushNotifMessages)}
          />
          <EmailToggleRow
            icon={<Dumbbell size={17} />}
            label={t('settings.push_cat_trainings')}
            desc={t('settings.push_cat_trainings_desc')}
            value={pushNotifTrainings}
            onToggle={makePushToggle('pushNotifTrainings', pushNotifTrainings, setPushNotifTrainings)}
          />
          <EmailToggleRow
            icon={<Users size={17} />}
            label={t('settings.push_cat_community')}
            desc={t('settings.push_cat_community_desc')}
            value={pushNotifCommunity}
            onToggle={makePushToggle('pushNotifCommunity', pushNotifCommunity, setPushNotifCommunity)}
          />
          <EmailToggleRow
            icon={<UserPlus size={17} />}
            label={t('settings.push_cat_friends')}
            desc={t('settings.push_cat_friends_desc')}
            value={pushNotifFriends}
            onToggle={makePushToggle('pushNotifFriends', pushNotifFriends, setPushNotifFriends)}
          />
        </div>

        {/* Email notifications */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_email')}</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <EmailToggleRow
            icon={<MessageSquare size={17} />}
            label={t('settings.email_messages')}
            desc={t('settings.email_messages_desc')}
            value={msgEmailNotif}
            onToggle={makeEmailToggle('messageEmailNotifications', msgEmailNotif, setMsgEmailNotif)}
          />
          <EmailToggleRow
            icon={<Dumbbell size={17} />}
            label={t('settings.email_trainings')}
            desc={t('settings.email_trainings_desc')}
            value={trainingEmailNotif}
            onToggle={makeEmailToggle('trainingEmailNotifications', trainingEmailNotif, setTrainingEmailNotif)}
          />
          <EmailToggleRow
            icon={<Newspaper size={17} />}
            label={t('settings.email_news')}
            desc={t('settings.email_news_desc')}
            value={newsEmailNotif}
            onToggle={makeEmailToggle('newsEmailNotifications', newsEmailNotif, setNewsEmailNotif)}
          />
        </div>

        {/* Location sharing */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_location')}</p>
        <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="px-4 pt-3.5 pb-1 flex items-center gap-3">
            <span className="text-brand-green"><MapPin size={17} /></span>
            <span className="text-sm font-medium text-white">{t('settings.location_share')}</span>
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
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_pref')}</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-brand-green">
              <Palette size={17} />
            </span>
            <span className="flex-1 text-sm font-medium text-white">
              {t('settings.theme')}
            </span>
            <div className="flex gap-2">
              {([
                { key: 'light'  as const, color: '#F3F4F0' },
                { key: 'soft'   as const, color: '#D4D5D0' },
                { key: 'green'  as const, color: 'var(--accent)' },
                { key: 'dark'   as const, color: '#0D2E2B' },
                { key: 'blue'   as const, color: '#3B82F6' },
                { key: 'purple' as const, color: '#A855F7' },
              ]).map(({ key, color }) => (
                <button key={key} onClick={() => setTheme(key)}
                  className="w-7 h-7 rounded-full transition-all duration-200"
                  style={{
                    backgroundColor: color,
                    border: theme === key ? '2.5px solid var(--accent)' : '2px solid rgba(255,255,255,0.15)',
                    transform: theme === key ? 'scale(1.15)' : 'scale(1)',
                    boxShadow: theme === key ? '0 0 10px rgba(var(--accent-rgb), 0.3)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Language */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_lang')}</p>
        <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-brand-green"><Globe size={17} /></span>
            <span className="flex-1 text-sm font-medium text-white">
              {lang === 'RO' ? 'Română' : 'English'}
            </span>
            <div className="flex gap-1.5">
              {(['RO', 'EN'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${
                    lang === l
                      ? 'bg-brand-green text-black'
                      : 'border border-white/20 text-white/50'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Other */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_other')}</p>
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          {pwaInstallable && (
            <button
              onClick={handlePwaInstall}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
            >
              <span className="text-brand-green flex-shrink-0"><Download size={17} /></span>
              <span className="flex-1 text-sm font-semibold text-white">{t('settings.install_app')}</span>
              <ChevronRight size={15} className="text-white/25" />
            </button>
          )}
          <SettingsRow icon={<Info size={17} />}             label={t('settings.about')}    value="v1.0.0" href="/profile/about" />
          <SettingsRow icon={<MessageSquarePlus size={17} />} label={t('settings.feedback')}              href="/feedback" />
        </div>

        {/* Coach Hub */}
        {isCoach && (
          <>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_trainer')}</p>
            <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              <SettingsRow icon={<Shield size={17} />} label={t('settings.coach_hub')} href="/coach" />
            </div>
          </>
        )}

        {/* Admin Hub */}
        {isSuperAdmin && (
          <>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('settings.section_admin')}</p>
            <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              <SettingsRow icon={<Shield size={17} />} label={t('settings.admin_hub')} href="/admin" />
            </div>
          </>
        )}

        {/* ── Super-admin broadcast ─────────────────────────────────────────── */}
        {isSuperAdmin && (
          <>
            <p className="text-[10px] font-bold text-red-400/70 tracking-widest mb-2 px-1">{t('settings.section_broadcast')}</p>
            <div className="rounded-2xl p-4 mb-4 border border-red-500/20" style={{ backgroundColor: 'var(--app-surface)' }}>

              <p className="text-xs text-white/40 mb-3 leading-relaxed">{t('settings.broadcast_desc')}</p>

              {/* Success */}
              {bResult && (
                <div className="flex items-center gap-2 p-3 rounded-xl mb-3 border border-brand-green/30"
                  style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.06)' }}>
                  <CheckCircle size={15} className="text-brand-green flex-shrink-0" />
                  <p className="text-xs font-semibold text-brand-green">
                    {t('settings.broadcast_sent', { n: bResult.sent })}
                  </p>
                </div>
              )}

              {/* Error */}
              {bError && (
                <p className="text-xs text-red-400 mb-3 px-1">{bError}</p>
              )}

              {/* Subject */}
              <p className="text-[10px] font-bold text-white/35 tracking-widest mb-1.5 px-0.5">{t('settings.broadcast_subject')}</p>
              <input
                type="text"
                value={bSubject}
                onChange={e => setBSubject(e.target.value)}
                placeholder={t('settings.broadcast_subject_ph')}
                maxLength={150}
                className="w-full h-10 px-3 rounded-xl text-sm text-white placeholder-white/25 outline-none mb-3"
                style={{ backgroundColor: 'var(--app-bg)', border: '1px solid rgba(255,255,255,0.08)' }}
              />

              {/* Body */}
              <p className="text-[10px] font-bold text-white/35 tracking-widest mb-1.5 px-0.5">{t('settings.broadcast_body')}</p>
              <textarea
                value={bBody}
                onChange={e => setBBody(e.target.value)}
                placeholder={t('settings.broadcast_body_ph')}
                maxLength={5000}
                rows={5}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/25 outline-none resize-none leading-relaxed mb-3"
                style={{ backgroundColor: 'var(--app-bg)', border: '1px solid rgba(255,255,255,0.08)' }}
              />

              <button
                onClick={() => { setBResult(null); setBError(''); setBConfirm(true) }}
                disabled={bSending || !bSubject.trim() || !bBody.trim()}
                className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-40 border border-red-500/40 text-red-300"
                style={{ backgroundColor: '#EF444412' }}
              >
                {bSending
                  ? <span className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                  : <><Send size={14} /> {t('settings.broadcast_send')}</>
                }
              </button>
            </div>
          </>
        )}

        <button onClick={() => setShowLogout(true)}
          className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm text-white bg-red-500/20 border border-red-500/30">
          <LogOut size={16} /> {t('common.logout')}
        </button>
      </div>
    </div>
  )
}

// ── Settings nav row ───────────────────────────────────────────────────────────
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
