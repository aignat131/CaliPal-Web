'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BadgeCheck, Check, Clock, Swords, User, X } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useLanguage, useT } from '@/lib/context/LanguageContext'
import { useToast } from '@/lib/context/ToastContext'
import { LIFTS, formatRecordValue } from '@/lib/gamification/records'
import {
  cancelChallenge, loadMyChallenges, respondToChallenge, viewStatus,
  type ChallengeView, type FriendChallenge,
} from '@/lib/gamification/challenges'

function Avatar({ photo }: { photo: string }) {
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
      {photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo} alt="" className="w-full h-full object-cover" />
        : <User size={17} className="text-white/40" />}
    </div>
  )
}

function timeLeft(deadline: Date, lang: 'RO' | 'EN'): string {
  const ms = deadline.getTime() - Date.now()
  const h = Math.max(0, Math.floor(ms / 3600000))
  if (h >= 48) return lang === 'RO' ? `${Math.floor(h / 24)} zile` : `${Math.floor(h / 24)} days`
  if (h >= 1) return `${h}h`
  return lang === 'RO' ? '<1h' : '<1h'
}

const STATUS_STYLE: Record<ChallengeView, string> = {
  PENDING: 'text-white/50', ACCEPTED: 'text-brand-green', COMPLETED: 'text-[#E3B24C]',
  DECLINED: 'text-white/35', CANCELLED: 'text-white/35', EXPIRED: 'text-red-400/80',
}

export default function ChallengesPage() {
  const router = useRouter()
  const t = useT()
  const { lang } = useLanguage()
  const { showToast } = useToast()
  const { user } = useAuth()
  const [items, setItems] = useState<FriendChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) return
    try { setItems(await loadMyChallenges(user.uid)) } catch { setItems([]) }
    setLoading(false)
  }, [user])
  useEffect(() => { reload() }, [reload])

  async function act(c: FriendChallenge, fn: () => Promise<void>) {
    setBusy(c.id)
    try { await fn(); await reload() } catch { showToast(t('common.unknown_error'), 'error') }
    setBusy(null)
  }

  const uid = user?.uid
  const incoming = items.filter(c => c.toUid === uid && viewStatus(c) === 'PENDING')
  const active = items.filter(c => viewStatus(c) === 'ACCEPTED')
  const sent = items.filter(c => c.fromUid === uid && viewStatus(c) === 'PENDING')
  const done = items.filter(c => !['PENDING', 'ACCEPTED'].includes(viewStatus(c)))

  function Card({ c, children }: { c: FriendChallenge; children?: React.ReactNode }) {
    const lift = LIFTS.find(l => l.key === c.lift)
    if (!lift) return null
    const mine = c.toUid === uid
    const other = mine ? { uid: c.fromUid, name: c.fromName, photo: c.fromPhoto } : { uid: c.toUid, name: c.toName, photo: c.toPhoto }
    const v = viewStatus(c)
    const unit = lift.metric === 'reps' ? ' rep' : ''
    return (
      <div className="app-card p-3.5">
        <div className="flex items-center gap-3">
          <Link href={`/profile/${other.uid}`}><Avatar photo={other.photo} /></Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {mine ? t('ch.from', { name: other.name }) : t('ch.to', { name: other.name })}
            </p>
            <p className="text-xs text-white/55">
              {lift.icon} {lift.name[lang]}: <span className="font-black text-white">{formatRecordValue(c.target, lift.metric)}{unit}</span> {t('ch.in_one_set')}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-[11px] font-bold ${STATUS_STYLE[v]}`}>{t(`ch.status_${v.toLowerCase()}`)}</p>
            {(v === 'PENDING' || v === 'ACCEPTED') && (
              <p className="text-[10px] text-white/35 flex items-center gap-1 justify-end mt-0.5">
                <Clock size={10} /> {timeLeft(c.deadline.toDate(), lang)}
              </p>
            )}
            {v === 'COMPLETED' && c.result != null && (
              <p className="text-[10px] text-white/55 flex items-center gap-1 justify-end mt-0.5">
                {formatRecordValue(c.result, lift.metric)}{unit}
                {c.verified && <BadgeCheck size={11} className="text-brand-green" />}
              </p>
            )}
          </div>
        </div>
        {c.message && <p className="text-xs text-white/50 italic mt-2 pl-[52px]">“{c.message}”</p>}
        {children && <div className="flex gap-2 mt-3 pl-[52px]">{children}</div>}
      </div>
    )
  }

  const Section = ({ title, list, render }: {
    title: string; list: FriendChallenge[]; render: (c: FriendChallenge) => React.ReactNode
  }) => list.length === 0 ? null : (
    <div className="mb-5">
      <p className="text-[11px] font-bold text-white/40 tracking-[1.5px] uppercase mb-2">{title} · {list.length}</p>
      <div className="flex flex-col gap-2">{list.map(render)}</div>
    </div>
  )

  return (
    <div className="min-h-[calc(100vh-64px)] animate-page-enter" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => router.back()} aria-label={t('pub_profile.back')}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            <Swords size={18} className="text-[#F97316]" /> {t('ch.page_title')}
          </h1>
        </div>
        <p className="text-xs text-white/40 mb-5 ml-12">{t('ch.page_sub')}</p>

        {loading ? (
          <div className="flex justify-center py-10">
            <span className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="app-card text-center py-10 px-6">
            <Swords size={30} className="text-white/15 mx-auto mb-3" />
            <p className="text-sm text-white/60 font-semibold">{t('ch.empty')}</p>
            <p className="text-xs text-white/35 mt-1">{t('ch.empty_hint')}</p>
            <Link href="/profile/friends" className="inline-block mt-4 h-9 leading-9 px-4 rounded-full bg-brand-green text-black text-xs font-bold">
              {t('ch.go_friends')}
            </Link>
          </div>
        ) : (
          <>
            <Section title={t('ch.sec_incoming')} list={incoming} render={c => (
              <Card key={c.id} c={c}>
                <button disabled={busy === c.id} onClick={() => act(c, () => respondToChallenge(c, true))}
                  className="flex-1 h-9 rounded-xl bg-brand-green text-black text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <Check size={14} /> {t('ch.accept')}
                </button>
                <button disabled={busy === c.id} onClick={() => act(c, () => respondToChallenge(c, false))}
                  className="flex-1 h-9 rounded-xl border border-white/15 text-white/60 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <X size={14} /> {t('ch.decline')}
                </button>
              </Card>
            )} />
            <Section title={t('ch.sec_active')} list={active} render={c => (
              <Card key={c.id} c={c}>
                {c.toUid === uid ? (
                  <Link href="/workout" className="flex-1 h-9 rounded-xl bg-brand-green/15 text-brand-green text-xs font-black flex items-center justify-center">
                    {t('ch.go_workout')}
                  </Link>
                ) : (
                  <button disabled={busy === c.id} onClick={() => act(c, () => cancelChallenge(c))}
                    className="h-9 px-3 rounded-xl border border-white/12 text-white/45 text-xs font-semibold disabled:opacity-40">
                    {t('ch.cancel')}
                  </button>
                )}
              </Card>
            )} />
            <Section title={t('ch.sec_sent')} list={sent} render={c => (
              <Card key={c.id} c={c}>
                <button disabled={busy === c.id} onClick={() => act(c, () => cancelChallenge(c))}
                  className="h-9 px-3 rounded-xl border border-white/12 text-white/45 text-xs font-semibold disabled:opacity-40">
                  {t('ch.cancel')}
                </button>
              </Card>
            )} />
            <Section title={t('ch.sec_done')} list={done} render={c => <Card key={c.id} c={c} />} />
          </>
        )}
      </div>
    </div>
  )
}
