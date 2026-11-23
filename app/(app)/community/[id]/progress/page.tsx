'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { MemberRole } from '@/types'
import { ROLE_LABELS } from '@/types'
import { can } from '@/lib/schedule/permissions'
import { callApi } from '@/lib/schedule/client'
import type { MemberProgressRow, ProgressOverviewResponse } from '@/lib/schedule/overview'
import { relativeTimeRo } from '@/lib/schedule/week'
import { RoleAvatar } from '../_components/Avatars'
import { ROLE_COLORS } from '../_components/shared'
import { AlertCircle, ArrowLeft, ChevronRight, Dumbbell, Lightbulb, Lock, RefreshCw, Search, Target } from 'lucide-react'

/**
 * Progresul membrilor — Fondator/Antrenor overview: one row per member with
 * their goals, extra exercises and coach tips. Each row opens the member file.
 */
export default function MembersProgressPage() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const communityId = params.id as string

  const [myRole, setMyRole] = useState<MemberRole | null | undefined>(undefined)
  const [communityName, setCommunityName] = useState('')

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'communities', communityId, 'members', user.uid),
      s => setMyRole(s.exists() ? ((s.data().role as MemberRole) ?? 'MEMBER') : null),
      () => setMyRole(null))
  }, [communityId, user])

  useEffect(() => onSnapshot(doc(db, 'communities', communityId),
    s => setCommunityName((s.data()?.name as string) ?? ''), () => undefined), [communityId])

  const allowed = can(myRole, 'viewMemberFile', isSuperAdmin)
  const loading = authLoading || (!!user && myRole === undefined)

  return (
    <div className="min-h-[calc(100dvh-64px)] animate-page-enter" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Înapoi" className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={17} className="text-white/70" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white truncate">Progresul membrilor</h1>
            {communityName && <p className="text-[11px] text-white/40 truncate">{communityName}</p>}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />)}</div>
        ) : !allowed || !user ? (
          <div className="text-center py-12">
            <Lock size={28} className="text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/50">Pagina e disponibilă doar pentru Fondator și Antrenori.</p>
          </div>
        ) : (
          <MembersOverview communityId={communityId} myUid={user.uid} />
        )}
      </div>
    </div>
  )
}

function MembersOverview({ communityId, myUid }: { communityId: string; myUid: string }) {
  const [rows, setRows] = useState<MemberProgressRow[] | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [onlyAttention, setOnlyAttention] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await callApi<ProgressOverviewResponse>(`/api/community/${communityId}/progress`)
    setLoading(false)
    if (!res.ok) { setError(true); return }
    setError(false)
    setRows(res.data.members)
  }, [communityId])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? [])
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .filter(r => !onlyAttention || r.needsAttention)
  }, [rows, query, onlyAttention])

  const attentionCount = rows?.filter(r => r.needsAttention).length ?? 0

  if (!rows && loading) {
    return <div className="flex flex-col gap-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />)}</div>
  }
  if (error && !rows) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-white/50 mb-3">Nu am putut încărca progresul membrilor.</p>
        <button onClick={() => void load()} className="h-9 px-4 rounded-xl border border-white/15 text-white text-xs font-bold">Reîncearcă</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2 px-3">
          <Search size={14} className="text-white/35" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Caută membru"
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/30 outline-none" />
        </label>
        <button onClick={() => void load()} aria-label="Reîncarcă"
          className="h-10 w-10 rounded-xl border border-white/10 text-white/60 flex items-center justify-center">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {attentionCount > 0 && (
        <button onClick={() => setOnlyAttention(v => !v)}
          className={`self-start h-8 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
            onlyAttention ? 'border-[#FFB800]/60 bg-[#FFB800]/10 text-[#FFB800]' : 'border-white/10 text-white/55'
          }`}>
          <AlertCircle size={12} /> Fără obiective sau exerciții ({attentionCount})
        </button>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-8">Niciun membru găsit.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(r => <MemberRow key={r.uid} row={r} communityId={communityId} isMe={r.uid === myUid} />)}
        </div>
      )}
    </div>
  )
}

function MemberRow({ row: r, communityId, isMe }: { row: MemberProgressRow; communityId: string; isMe: boolean }) {
  const pct = r.exercises.expectedThisWeek > 0 ? r.exercises.doneThisWeek / r.exercises.expectedThisWeek : 0
  const firstGoal = r.activeGoals[0]
  return (
    <Link href={`/community/${communityId}/member/${r.uid}`}
      className="rounded-2xl p-3 flex gap-3 active:bg-white/5" style={{ backgroundColor: 'var(--app-surface)' }}>
      <RoleAvatar photoUrl={r.photoUrl ?? ''} name={r.name} roleColor={ROLE_COLORS[r.role] ?? 'var(--accent)'} size={40} />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-white truncate">{r.name}{isMe && <span className="text-white/40 font-normal"> (tu)</span>}</p>
          {r.role !== 'MEMBER' && <span className="text-[10px] flex-shrink-0" style={{ color: ROLE_COLORS[r.role] }}>{ROLE_LABELS[r.role]}</span>}
        </div>

        <p className="text-[12px] text-white/60 truncate flex items-center gap-1">
          <Target size={11} className="text-brand-green flex-shrink-0" />
          {firstGoal ? (
            <>
              <span className="truncate">{firstGoal.skill}{firstGoal.target && <span className="text-white/40"> → {firstGoal.target}</span>}</span>
              {r.activeGoals.length > 1 && <span className="text-white/35 flex-shrink-0">+{r.activeGoals.length - 1}</span>}
            </>
          ) : <span className="text-[#FFB800]/80">Niciun obiectiv activ</span>}
          {r.achievedGoals > 0 && <span className="text-[#E3B24C] flex-shrink-0 ml-1">🏆 {r.achievedGoals}</span>}
        </p>

        <div className="flex items-center gap-2 text-[11px] text-white/45">
          <Dumbbell size={11} className="flex-shrink-0" />
          {r.exercises.count > 0 ? (
            <>
              <span className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                <span className="block h-full bg-brand-green rounded-full" style={{ width: `${Math.round(pct * 100)}%` }} />
              </span>
              <span>{r.exercises.doneThisWeek}/{r.exercises.expectedThisWeek} săpt.</span>
            </>
          ) : <span className="text-[#FFB800]/80">Fără exerciții extra</span>}
          {r.tips > 0 && (
            <span className="ml-auto flex items-center gap-1 text-white/40">
              <Lightbulb size={10} /> {r.tips} · {relativeTimeRo(r.lastTipMs)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-white/25 self-center flex-shrink-0" />
    </Link>
  )
}
