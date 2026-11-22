'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { BadgeCheck, ChevronRight, User } from 'lucide-react'
import { db } from '@/lib/firebase/firestore'
import { useLanguage, useT } from '@/lib/context/LanguageContext'
import { MILESTONE_BY_ID, milestoneLabel } from '@/lib/milestones/tree'
import { LIFTS, formatRecordValue } from '@/lib/gamification/records'
import { loadActivity, toggleCheer, type ActivityDoc } from '@/lib/gamification/activity'

function timeAgo(ts: ActivityDoc['createdAt'], lang: 'RO' | 'EN'): string {
  const d = ts?.toDate?.()
  if (!d) return ''
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 60) return lang === 'RO' ? `acum ${Math.max(1, min)} min` : `${Math.max(1, min)}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return lang === 'RO' ? `acum ${h} h` : `${h}h ago`
  const days = Math.floor(h / 24)
  return lang === 'RO' ? `acum ${days} ${days === 1 ? 'zi' : 'zile'}` : `${days}d ago`
}

function describe(a: ActivityDoc, lang: 'RO' | 'EN', t: ReturnType<typeof useT>): { icon: string; text: string; color?: string } | null {
  if (a.kind === 'milestone' && a.milestoneId) {
    const e = MILESTONE_BY_ID.get(a.milestoneId)
    if (!e) return null
    return { icon: e.branch.icon, text: `a reușit ${milestoneLabel(e.milestone)}`, color: e.branch.color }
  }
  const lift = LIFTS.find(l => l.key === a.lift)
  if (a.kind === 'challenge' && lift) {
    const val = `${formatRecordValue(a.value ?? 0, lift.metric)}${lift.metric === 'reps' ? ' rep' : ''}`
    return { icon: '⚔️', text: t('act.challenge', { lift: lift.name[lang], v: val, name: a.otherName ?? '' }) }
  }
  // Older kinds (badges, records) are no longer shown.
  return null
}

/** Older kinds (badges, records) are no longer shown. */
function isShown(a: ActivityDoc): boolean {
  if (a.kind === 'milestone') return !!a.milestoneId && MILESTONE_BY_ID.has(a.milestoneId)
  return a.kind === 'challenge' && LIFTS.some(l => l.key === a.lift)
}

export function FriendsActivity({ uid }: { uid: string }) {
  const t = useT()
  const { lang } = useLanguage()
  const [items, setItems] = useState<ActivityDoc[] | null>(null)
  const [pendingChallenges, setPendingChallenges] = useState(0)

  useEffect(() => {
    let cancelled = false
    getDocs(collection(db, 'users', uid, 'friends'))
      .then(snap => loadActivity(snap.docs.map(d => d.id), 8))
      .then(list => { if (!cancelled) setItems(list.filter(isShown)) })
      .catch(() => { if (!cancelled) setItems([]) })
    getDocs(query(collection(db, 'challenges'), where('toUid', '==', uid), where('status', '==', 'PENDING')))
      .then(snap => {
        const now = Date.now()
        if (!cancelled) setPendingChallenges(snap.docs.filter(d => (d.data().deadline?.toMillis?.() ?? 0) > now).length)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [uid])

  async function cheer(a: ActivityDoc) {
    const on = !a.cheers?.[uid]
    setItems(prev => prev?.map(x => {
      if (x.id !== a.id) return x
      const cheers = { ...(x.cheers ?? {}) }
      if (on) cheers[uid] = true
      else delete cheers[uid]
      return { ...x, cheers }
    }) ?? null)
    toggleCheer(a.id, uid, on).catch(() => {})
  }

  return (
    <div className="mb-5">
      {/* Shortcuts */}
      <div className="mb-4">
        <Link href="/challenges" className="app-card !p-3 flex items-center gap-2 hover:border-white/20 transition-colors relative">
          <span className="text-lg">⚔️</span>
          <span className="text-sm font-bold text-white flex-1">{t('ch.page_title')}</span>
          {pendingChallenges > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#F97316] text-black text-[11px] font-black flex items-center justify-center">
              {pendingChallenges}
            </span>
          )}
        </Link>
      </div>

      {items && items.length > 0 && (
        <>
          <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">{t('act.title')}</p>
          <div className="app-card !p-1.5 flex flex-col">
            {items.map(a => {
              const d = describe(a, lang, t)
              if (!d) return null
              const n = Object.keys(a.cheers ?? {}).length
              const mine = !!a.cheers?.[uid]
              return (
                <div key={a.id} className="flex items-center gap-2.5 px-2 py-2">
                  <Link href={`/profile/${a.uid}`} className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                      {a.photo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={a.photo} alt="" className="w-full h-full object-cover" />
                        : <User size={16} className="text-white/40" />}
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px]"
                      style={{ backgroundColor: 'var(--app-surface)', boxShadow: d.color ? `0 0 0 1.5px ${d.color}` : undefined }}>
                      {d.icon}
                    </span>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white/85 leading-snug">
                      <span className="font-bold text-white">{a.name || t('common.user_fallback')}</span> {d.text}
                      {a.verified && <BadgeCheck size={12} className="inline text-brand-green ml-1 -mt-0.5" />}
                    </p>
                    <p className="text-[10.5px] text-white/35">{timeAgo(a.createdAt, lang)}</p>
                  </div>
                  <button onClick={() => cheer(a)} aria-pressed={mine} aria-label={t('act.cheer')}
                    className={`h-8 px-2.5 rounded-full text-xs font-bold flex items-center gap-1 border transition-colors flex-shrink-0 ${
                      mine ? 'border-brand-green/50 bg-brand-green/15 text-brand-green' : 'border-white/12 text-white/50 hover:bg-white/6'
                    }`}>
                    👏{n > 0 && <span>{n}</span>}
                  </button>
                </div>
              )
            })}
          </div>
          <Link href="/profile/friends" className="flex items-center justify-end gap-1 text-xs text-white/40 mt-1.5 hover:text-white/60">
            {t('act.find_friends')} <ChevronRight size={12} />
          </Link>
        </>
      )}
    </div>
  )
}
