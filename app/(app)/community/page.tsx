'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  collection, query, orderBy, onSnapshot, doc,
  updateDoc, setDoc, arrayUnion, increment, serverTimestamp,
  getDocs, where, getDoc, addDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { CommunityDoc, PlannedTraining, CommunityChallenge, UserCommunityChallengeProgress } from '@/types'
import { Plus, Users, MapPin, Star, Calendar, Trophy, Clock, Check, X } from 'lucide-react'

const SUPERADMIN = 'aignat131@gmail.com'

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return iso }
}

export default function CommunityPage() {
  const { user } = useAuth()
  const [communities, setCommunities] = useState<CommunityDoc[]>([])
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [tab, setTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('comm_listing_tab')
      if (saved !== null) return parseInt(saved)
    }
    return 0
  })
  const [favoriteCommunityId, setFavoriteCommunityId] = useState<string | null>(null)

  // Evenimente state
  const [eventi, setEventi] = useState<(PlannedTraining & { communityId: string; communityName: string })[]>([])
  const [loadedEventi, setLoadedEventi] = useState(false)

  // Provocari state
  const [provChallenges, setProvChallenges] = useState<(CommunityChallenge & { communityName: string })[]>([])
  const [provProgress, setProvProgress] = useState<Record<string, UserCommunityChallengeProgress>>({})
  const [loadedProv, setLoadedProv] = useState(false)
  const [showAddChallenge, setShowAddChallenge] = useState(false)

  const isSuperAdmin = user?.email === SUPERADMIN

  function changeTab(t: number) {
    setTab(t)
    sessionStorage.setItem('comm_listing_tab', String(t))
  }

  useEffect(() => {
    const q = query(collection(db, 'communities'), orderBy('memberCount', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setCommunities(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityDoc))
      setLoading(false)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      const ids: string[] = snap.data()?.joinedCommunityIds ?? []
      setJoinedIds(new Set(ids))
      setFavoriteCommunityId(snap.data()?.favoriteCommunityId ?? null)
    })
    return unsub
  }, [user])

  // Load evenimente lazily when tab 1 is opened
  useEffect(() => {
    if (tab !== 1 || loadedEventi || joinedIds.size === 0) return
    setLoadedEventi(true)
    const today = new Date().toISOString().slice(0, 10)
    const communityMap = new Map(communities.map(c => [c.id, c.name]))

    Promise.all(
      [...joinedIds].map(async cid => {
        try {
          const snap = await getDocs(
            query(
              collection(db, 'communities', cid, 'trainings'),
              where('date', '>=', today),
              orderBy('date', 'asc')
            )
          )
          return snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            communityId: cid,
            communityName: communityMap.get(cid) ?? '',
          } as PlannedTraining & { communityId: string; communityName: string }))
        } catch {
          return []
        }
      })
    ).then(results => {
      const all = results.flat().sort((a, b) => a.date.localeCompare(b.date))
      setEventi(all)
    })
  }, [tab, loadedEventi, joinedIds, communities])

  // Load provocari lazily when tab 2 is opened
  useEffect(() => {
    if (tab !== 2 || loadedProv || !user) return
    setLoadedProv(true)
    const communityMap = new Map(communities.map(c => [c.id, c.name]))

    Promise.all(
      [...joinedIds].map(async cid => {
        try {
          const snap = await getDocs(
            query(collection(db, 'communities', cid, 'challenges'), orderBy('endsAt', 'desc'))
          )
          return snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            communityName: communityMap.get(cid) ?? '',
          } as CommunityChallenge & { communityName: string })
          )
        } catch {
          return []
        }
      })
    ).then(async results => {
      const all = results.flat()
      setProvChallenges(all)
      // Load progress for each challenge
      const progressEntries = await Promise.all(
        all.map(c =>
          getDoc(doc(db, 'users', user.uid, 'community_challenge_progress', c.id))
            .then(snap => snap.exists() ? [c.id, snap.data() as UserCommunityChallengeProgress] as const : null)
        )
      )
      const map: Record<string, UserCommunityChallengeProgress> = {}
      progressEntries.forEach(e => { if (e) map[e[0]] = e[1] })
      setProvProgress(map)
    })
  }, [tab, loadedProv, joinedIds, communities, user])

  async function toggleFavorite(communityId: string) {
    if (!user) return
    const newFav = favoriteCommunityId === communityId ? null : communityId
    await updateDoc(doc(db, 'users', user.uid), { favoriteCommunityId: newFav ?? '' })
  }

  async function joinCommunity(community: CommunityDoc) {
    if (!user || joiningId) return
    setJoiningId(community.id)
    try {
      await setDoc(doc(db, 'communities', community.id, 'members', user.uid), {
        userId: user.uid,
        displayName: user.displayName ?? '',
        role: 'MEMBER',
        level: 1,
        points: 0,
        photoUrl: user.photoURL ?? null,
        joinedAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'communities', community.id), { memberCount: increment(1) })
      await updateDoc(doc(db, 'users', user.uid), {
        joinedCommunityIds: arrayUnion(community.id),
      })
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-6">
        {/* DEBUG — remove after fix */}
        {user && (
          <p className="text-[10px] text-white/30 mb-2 break-all">
            email: {user.email ?? 'null'} | isAdmin: {String(isSuperAdmin)}
          </p>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-black text-white">Comunitate</h1>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button
                onClick={() => { changeTab(2); setShowAddChallenge(true) }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-yellow-400/40 text-yellow-400 text-xs font-bold hover:bg-yellow-400/10 transition-colors"
                title="Adaugă provocare (super admin)"
              >
                <Trophy size={13} /> Provocare
              </button>
            )}
            {tab === 0 && (
              <Link href="/community/create">
                <button className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center">
                  <Plus size={18} className="text-black" strokeWidth={2.5} />
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-4">
          {[
            { label: 'Comunitate', Icon: Users },
            { label: 'Evenimente', Icon: Calendar },
            { label: 'Provocari', Icon: Trophy },
          ].map(({ label, Icon }, i) => (
            <button key={i} onClick={() => changeTab(i)}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors flex flex-col items-center gap-0.5 ${
                tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/40'
              }`}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Comunitate tab ── */}
        {tab === 0 && (
          loading
            ? <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
            : (
              <div className="flex flex-col gap-3">
                {communities.map(c => (
                  <CommunityCard
                    key={c.id}
                    community={c}
                    isMember={joinedIds.has(c.id)}
                    joining={joiningId === c.id}
                    isFavorite={favoriteCommunityId === c.id}
                    onJoin={() => joinCommunity(c)}
                    onToggleFavorite={() => toggleFavorite(c.id)}
                  />
                ))}
              </div>
            )
        )}

        {/* ── Evenimente tab ── */}
        {tab === 1 && (
          <div>
            {!loadedEventi ? (
              <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
            ) : eventi.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Calendar size={32} className="text-white/20" />
                <p className="text-sm text-white/40">Niciun eveniment viitor în comunitățile tale.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {eventi.map(ev => (
                  <EventCard key={`${ev.communityId}-${ev.id}`} event={ev} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Provocari tab ── */}
        {tab === 2 && (
          <div>
            {showAddChallenge && isSuperAdmin && (
              <AddChallengeForm
                communities={communities.filter(c => joinedIds.has(c.id))}
                onClose={() => { setShowAddChallenge(false); setLoadedProv(false) }}
              />
            )}
            {!loadedProv ? (
              <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
            ) : provChallenges.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Trophy size={32} className="text-white/20" />
                <p className="text-sm text-white/40">Nicio provocare activă în comunitățile tale.</p>
                {isSuperAdmin && (
                  <button
                    onClick={() => setShowAddChallenge(true)}
                    className="mt-2 h-9 px-4 rounded-full bg-brand-green text-black text-xs font-bold"
                  >
                    Adaugă provocare
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {provChallenges.map(c => {
                  const prog = provProgress[c.id]
                  const current = prog?.currentReps ?? 0
                  const completed = prog?.completed ?? false
                  const pct = Math.min(100, Math.round((current / c.targetReps) * 100))
                  return (
                    <div key={c.id} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Trophy size={13} className="text-yellow-400" />
                        <p className="text-[10px] font-bold text-white/40 tracking-widest flex-1">{c.communityName.toUpperCase()}</p>
                        {completed && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green/20 text-brand-green">FINALIZAT ✓</span>}
                      </div>
                      <p className="font-black text-white text-sm mb-0.5">{c.title}</p>
                      <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
                        <span>{current} / {c.targetReps} {c.exerciseName}</span>
                        <span>🪙 +{c.coinsReward}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: completed ? '#1ED75F' : '#F97316' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EventCard({ event }: { event: PlannedTraining & { communityId: string; communityName: string } }) {
  const goingCount = event.rsvps ? Object.values(event.rsvps).filter(v => v === 'GOING').length : 0
  return (
    <Link href={`/community/${event.communityId}`}>
      <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="flex items-start justify-between mb-1.5">
          <p className="font-bold text-white text-[14px] leading-tight flex-1 pr-2">{event.name}</p>
          <span className="text-[10px] text-brand-green font-bold flex-shrink-0">{formatDate(event.date)}</span>
        </div>
        <p className="text-[11px] text-white/40 font-semibold mb-1.5">{event.communityName}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {(event.timeStart || event.timeEnd) && (
            <span className="flex items-center gap-1 text-xs text-white/45">
              <Clock size={10} className="text-white/30" />
              {event.timeStart}{event.timeEnd ? `–${event.timeEnd}` : ''}
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1 text-xs text-white/45">
              <MapPin size={10} className="text-white/30" />
              {event.location}
            </span>
          )}
          {goingCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-white/45">
              <Check size={10} className="text-brand-green/60" />
              {goingCount} {goingCount === 1 ? 'merge' : 'merg'}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function AddChallengeForm({
  communities,
  onClose,
}: {
  communities: CommunityDoc[]
  onClose: () => void
}) {
  const defaultEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const [selectedCommunity, setSelectedCommunity] = useState(communities[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [exerciseName, setExerciseName] = useState('')
  const [targetReps, setTargetReps] = useState('100')
  const [coinsReward, setCoinsReward] = useState('50')
  const [endsAt, setEndsAt] = useState(defaultEnd)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim() || !exerciseName.trim() || !selectedCommunity) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'communities', selectedCommunity, 'challenges'), {
        title: title.trim(),
        exerciseName: exerciseName.trim(),
        targetReps: parseInt(targetReps) || 100,
        coinsReward: parseInt(coinsReward) || 50,
        communityId: selectedCommunity,
        endsAt: Timestamp.fromDate(new Date(endsAt)),
        createdAt: serverTimestamp(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl p-4 mb-4 border border-brand-green/30" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-white">Adaugă provocare</p>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
          <X size={13} className="text-white/60" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <div>
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">COMUNITATE</p>
          <select
            value={selectedCommunity}
            onChange={e => setSelectedCommunity(e.target.value)}
            className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7"
            style={{ backgroundColor: 'var(--app-surface)' }}
          >
            {communities.map(c => (
              <option key={c.id} value={c.id} style={{ backgroundColor: '#0D2E2B' }}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">TITLU</p>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="ex. 100 Tracțiuni"
            className="w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7"
          />
        </div>

        <div>
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">EXERCIȚIU</p>
          <input
            value={exerciseName}
            onChange={e => setExerciseName(e.target.value)}
            placeholder="ex. Tracțiuni"
            className="w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">TARGET REPS</p>
            <input
              type="number"
              value={targetReps}
              onChange={e => setTargetReps(e.target.value)}
              className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7"
            />
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">MONEDE</p>
            <input
              type="number"
              value={coinsReward}
              onChange={e => setCoinsReward(e.target.value)}
              className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7"
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">DATA LIMITĂ</p>
          <input
            type="date"
            value={endsAt}
            onChange={e => setEndsAt(e.target.value)}
            className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7"
          />
        </div>

        <button
          onClick={save}
          disabled={saving || !title.trim() || !exerciseName.trim()}
          className="w-full h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-50 mt-1"
        >
          {saving ? '...' : 'Salvează'}
        </button>
      </div>
    </div>
  )
}

function CommunityCard({
  community, isMember, joining, isFavorite, onJoin, onToggleFavorite,
}: {
  community: CommunityDoc
  isMember: boolean
  joining: boolean
  isFavorite: boolean
  onJoin: () => void
  onToggleFavorite: () => void
}) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#1ED75F22' }}>
          {community.imageUrl
            ? <img src={community.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
            : <span className="text-xl font-black text-brand-green">{community.name.charAt(0)}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-[15px] leading-tight">{community.name}</p>
          {community.description && (
            <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{community.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-xs text-white/40">
              <Users size={11} />
              {community.memberCount} membri
            </span>
            {community.location && (
              <span className="flex items-center gap-1 text-xs text-white/40">
                <MapPin size={11} />
                {community.location}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {isMember && (
              <button onClick={onToggleFavorite}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/15 hover:bg-white/8 transition-colors"
                title={isFavorite ? 'Elimină favorit' : 'Marchează favorit'}>
                <Star size={14} fill={isFavorite ? '#FFB800' : 'none'} className={isFavorite ? 'text-yellow-400' : 'text-white/40'} />
              </button>
            )}
            <Link href={`/community/${community.id}`}>
              <button className="h-8 px-3 rounded-lg text-xs font-bold border border-white/20 text-white/70 hover:bg-white/8 transition-colors">
                {isMember ? 'Deschide' : 'Vizualizează'}
              </button>
            </Link>
          </div>
          {!isMember && (
            <button
              onClick={onJoin}
              disabled={joining}
              className="h-8 px-3 rounded-lg text-xs font-bold bg-brand-green text-black disabled:opacity-50"
            >
              {joining ? '...' : 'Intru'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
