'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  collection, documentId, getDoc, getDocs, doc, limit, orderBy, query, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useLanguage, useT } from '@/lib/context/LanguageContext'
import { LIFTS, formatRecordValue, type LiftKey } from '@/lib/gamification/records'
import { ArrowLeft, BadgeCheck, Trophy, User } from 'lucide-react'

type Scope = 'all' | 'friends' | string // string = communityId

interface RecordRow {
  uid: string
  displayName: string
  photoUrl: string
  value: number
  verified: boolean
}

const MEDAL = ['#E3B24C', '#C3C9D1', '#C5824A']
const TOP_N = 50

async function fetchByIds(ids: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30)
    const snap = await getDocs(query(collection(db, 'user_records'), where(documentId(), 'in', chunk)))
    snap.docs.forEach(d => out.push(d.data()))
  }
  return out
}

function toRow(d: Record<string, unknown>, lift: LiftKey): RecordRow {
  return {
    uid: String(d.uid ?? ''),
    displayName: String(d.displayName ?? ''),
    photoUrl: String(d.photoUrl ?? ''),
    value: Number(d[lift] ?? 0),
    verified: d[`${lift}_v`] === true,
  }
}

export default function LeaderboardPage() {
  const router = useRouter()
  const t = useT()
  const { lang } = useLanguage()
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const [lift, setLift] = useState<LiftKey>('pullup')
  const [scope, setScope] = useState<Scope>('all')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [rows, setRows] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])

  const liftDef = LIFTS.find(l => l.key === lift)!
  const joinedKey = (profile?.joinedCommunityIds ?? []).join(',')

  // Names for the community scope chips
  useEffect(() => {
    const ids = joinedKey ? joinedKey.split(',') : []
    if (ids.length === 0) { setCommunities([]); return }
    Promise.all(ids.map(id => getDoc(doc(db, 'communities', id))))
      .then(snaps => setCommunities(snaps.filter(s => s.exists()).map(s => ({ id: s.id, name: String(s.data()?.name ?? '') }))))
      .catch(() => {})
  }, [joinedKey])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      let data: Record<string, unknown>[]
      if (scope === 'all') {
        const snap = await getDocs(query(
          collection(db, 'user_records'), where(lift, '>', 0), orderBy(lift, 'desc'), limit(TOP_N * 2),
        ))
        data = snap.docs.map(d => d.data())
      } else if (scope === 'friends') {
        const fr = await getDocs(collection(db, 'users', user.uid, 'friends'))
        data = await fetchByIds([user.uid, ...fr.docs.map(d => d.id)])
      } else {
        const mem = await getDocs(collection(db, 'communities', scope, 'members'))
        data = await fetchByIds(mem.docs.map(d => d.id))
      }
      const out = data.map(d => toRow(d, lift))
        .filter(r => r.value > 0 && (!verifiedOnly || r.verified))
        .sort((a, b) => b.value - a.value || Number(b.verified) - Number(a.verified))
        .slice(0, TOP_N)
      if (!cancelled) setRows(out)
    })()
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, lift, scope, verifiedOnly])

  const myIndex = useMemo(() => rows.findIndex(r => r.uid === user?.uid), [rows, user?.uid])

  const scopes: { id: Scope; label: string }[] = [
    { id: 'all', label: t('lb.scope_all') },
    { id: 'friends', label: t('lb.scope_friends') },
    ...communities.map(c => ({ id: c.id, label: c.name })),
  ]

  return (
    <div className="min-h-[calc(100vh-64px)] animate-page-enter" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => router.back()} aria-label={t('pub_profile.back')}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            <Trophy size={18} className="text-[#E3B24C]" /> {t('lb.title')}
          </h1>
        </div>
        <p className="text-xs text-white/40 mb-4 ml-12">{t('lb.subtitle')}</p>

        {/* Exercise */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {LIFTS.map(l => (
            <button key={l.key} onClick={() => setLift(l.key)}
              className={`h-9 px-3 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5 border transition-colors ${
                lift === l.key ? 'bg-brand-green text-black border-brand-green' : 'text-white/60 border-white/12 hover:bg-white/6'
              }`}>
              <span>{l.icon}</span>{l.name[lang]}
            </button>
          ))}
        </div>

        {/* Scope */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 mt-1 scrollbar-hide">
          {scopes.map(s => (
            <button key={s.id} onClick={() => setScope(s.id)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors max-w-[180px] truncate ${
                scope === s.id ? 'border-brand-green/60 text-brand-green bg-brand-green/10' : 'text-white/50 border-white/10'
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 mt-2 mb-4 text-xs text-white/55 cursor-pointer w-fit">
          <input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)}
            className="accent-[var(--accent)]" />
          <BadgeCheck size={13} className="text-brand-green" /> {t('lb.verified_only')}
        </label>

        {/* List */}
        <div className="app-card p-2">
          {loading ? (
            [0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5 animate-pulse">
                <div className="w-6 h-4 rounded bg-white/8" />
                <div className="w-9 h-9 rounded-full bg-white/8" />
                <div className="flex-1 h-3.5 rounded bg-white/8" />
                <div className="w-10 h-4 rounded bg-white/6" />
              </div>
            ))
          ) : rows.length === 0 ? (
            <div className="text-center py-8 px-4">
              <Trophy size={28} className="text-white/15 mx-auto mb-2" />
              <p className="text-sm text-white/45">{t('lb.empty')}</p>
              <Link href="/workout" className="inline-block mt-3 h-9 leading-9 px-4 rounded-full bg-brand-green text-black text-xs font-bold">
                {t('lb.cta')}
              </Link>
            </div>
          ) : (
            rows.map((r, i) => {
              const me = r.uid === user?.uid
              return (
                <Link key={r.uid} href={me ? '/profile?tab=badges' : `/profile/${r.uid}`}
                  className={`flex items-center gap-3 px-2 py-2 rounded-xl transition-colors ${me ? 'bg-brand-green/10' : 'hover:bg-white/5'}`}>
                  <span className="w-6 text-center text-sm font-black"
                    style={{ color: i < 3 ? MEDAL[i] : 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0"
                    style={i < 3 ? { boxShadow: `0 0 0 2px ${MEDAL[i]}` } : undefined}>
                    {r.photoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={r.photoUrl} alt="" className="w-full h-full object-cover" />
                      : <User size={16} className="text-white/40" />}
                  </div>
                  <span className={`flex-1 min-w-0 truncate text-sm ${me ? 'font-black text-white' : 'font-semibold text-white/85'}`}>
                    {r.displayName || t('common.user_fallback')}{me && ` (${t('home.leaderboard_you')})`}
                  </span>
                  {r.verified && <BadgeCheck size={14} className="text-brand-green flex-shrink-0" aria-label={t('records.verified')} />}
                  <span className="text-base font-black text-white tabular-nums">
                    {formatRecordValue(r.value, liftDef.metric)}
                    {liftDef.metric === 'reps' && <span className="text-[10px] font-bold text-white/40 ml-0.5">rep</span>}
                  </span>
                </Link>
              )
            })
          )}
        </div>

        {!loading && rows.length > 0 && myIndex === -1 && (
          <p className="text-xs text-white/35 text-center mt-3">{t('lb.not_ranked')}</p>
        )}
        <p className="text-[11px] text-white/25 text-center mt-4 leading-relaxed">{t('lb.rules')}</p>
      </div>
    </div>
  )
}
