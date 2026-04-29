'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  collection, query, orderBy, onSnapshot, doc,
  updateDoc, setDoc, arrayUnion, increment, serverTimestamp,
  getDocs, where, getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import type { CommunityDoc, CommunityMember, PlannedTraining, CommunityChallenge, UserCommunityChallengeProgress } from '@/types'
import { ROLE_LABELS } from '@/types'
import { Plus, Users, MapPin, Star, Calendar, Trophy, Clock, Check, Search, Bell, X, ArrowRight } from 'lucide-react'

function formatDate(str: string | undefined): string {
  if (!str) return ''
  // Android format "dd/MM/yyyy HH:mm"
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) {
    const [, dd, mm, yyyy] = m
    try {
      return new Date(`${yyyy}-${mm}-${dd}`).toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' })
    } catch { return str }
  }
  try {
    return new Date(str).toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return str }
}

export default function CommunityPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { requestPermission } = usePushNotifications(user?.uid)
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
  const [citySearch, setCitySearch] = useState('')
  const [userDocLoaded, setUserDocLoaded] = useState(false)
  const redirectedRef = useRef(false)

  // Members preview popup (for non-members)
  const [previewCommunity, setPreviewCommunity] = useState<CommunityDoc | null>(null)

  // Join notification popup
  const [joinedCommunityName, setJoinedCommunityName] = useState<string | null>(null)

  // Evenimente state
  const [eventi, setEventi] = useState<(PlannedTraining & { communityId: string; communityName: string })[]>([])
  const [loadedEventi, setLoadedEventi] = useState(false)

  // Provocari state
  const [provChallenges, setProvChallenges] = useState<(CommunityChallenge & { communityName: string })[]>([])
  const [provProgress, setProvProgress] = useState<Record<string, UserCommunityChallengeProgress>>({})
  const [loadedProv, setLoadedProv] = useState(false)

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
      setUserDocLoaded(true)
    })
    return unsub
  }, [user])

  // Auto-redirect: only on INITIAL load — never after a join action
  // If user navigated back from [id] page, sessionStorage flag prevents re-redirect
  useEffect(() => {
    if (!userDocLoaded || redirectedRef.current) return
    redirectedRef.current = true // lock — only runs once ever

    const skip = sessionStorage.getItem('skip_community_redirect')
    if (skip) { sessionStorage.removeItem('skip_community_redirect'); return }

    if (favoriteCommunityId) { router.push(`/community/${favoriteCommunityId}`); return }
    if (joinedIds.size === 1) { router.push(`/community/${[...joinedIds][0]}`) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDocLoaded]) // intentionally only on first load

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
      const all = results.flat().sort((a, b) => (a.timeStart ?? a.date ?? '').localeCompare(b.timeStart ?? b.date ?? ''))
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
          } as CommunityChallenge & { communityName: string }))
        } catch {
          return []
        }
      })
    ).then(async results => {
      const all = results.flat()
      setProvChallenges(all)
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

  async function toggleFavorite(e: React.MouseEvent, communityId: string) {
    e.stopPropagation()
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
      setPreviewCommunity(null)
      setJoinedCommunityName(community.name)
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Members preview popup (non-members) */}
      {previewCommunity && (
        <MembersPreviewModal
          community={previewCommunity}
          joining={joiningId === previewCommunity.id}
          onJoin={() => joinCommunity(previewCommunity)}
          onClose={() => setPreviewCommunity(null)}
        />
      )}

      {/* Join notification popup */}
      {joinedCommunityName && (
        <JoinNotificationModal
          communityName={joinedCommunityName}
          onRequestNotifications={async () => {
            await requestPermission()
            setJoinedCommunityName(null)
          }}
          onDismiss={() => setJoinedCommunityName(null)}
        />
      )}

      <div className="max-w-lg mx-auto px-4 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-black text-white">Comunitate</h1>
          <div className="flex items-center gap-2">
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
            : (() => {
                const cityLower = citySearch.toLowerCase().trim()
                const allFiltered = cityLower
                  ? communities.filter(c => c.location?.toLowerCase().includes(cityLower))
                  : communities
                const myCommunities = allFiltered.filter(c => joinedIds.has(c.id))
                const discover = allFiltered.filter(c => !joinedIds.has(c.id)).slice(0, 5)

                return (
                  <div>
                    {/* City search */}
                    <div className="relative mb-4">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        value={citySearch}
                        onChange={e => setCitySearch(e.target.value)}
                        placeholder="Caută după oraș..."
                        className="w-full h-10 pl-9 pr-3 rounded-xl text-sm text-white placeholder:text-white/35 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors"
                      />
                    </div>

                    {/* My communities */}
                    {myCommunities.length > 0 && (
                      <div className="mb-5">
                        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2">COMUNITĂȚILE MELE</p>
                        <div className="flex flex-col gap-3">
                          {myCommunities.map(c => (
                            <MemberCommunityCard
                              key={c.id}
                              community={c}
                              isFavorite={favoriteCommunityId === c.id}
                              onToggleFavorite={e => toggleFavorite(e, c.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Discover section */}
                    {discover.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2">DESCOPERĂ</p>
                        <div className="flex flex-col gap-3">
                          {discover.map(c => (
                            <DiscoverCommunityCard
                              key={c.id}
                              community={c}
                              onPreview={() => setPreviewCommunity(c)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {allFiltered.length === 0 && (
                      <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <Search size={32} className="text-white/20" />
                        <p className="text-sm text-white/40">Nicio comunitate în "{citySearch}".</p>
                      </div>
                    )}
                  </div>
                )
              })()
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
            {!loadedProv ? (
              <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
            ) : provChallenges.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Trophy size={32} className="text-white/20" />
                <p className="text-sm text-white/40">Nicio provocare activă în comunitățile tale.</p>
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

// ── Member community card (clickable → navigate) ──────────────────────────────

function MemberCommunityCard({
  community, isFavorite, onToggleFavorite,
}: {
  community: CommunityDoc
  isFavorite: boolean
  onToggleFavorite: (e: React.MouseEvent) => void
}) {
  return (
    <Link href={`/community/${community.id}`}>
      <div className="rounded-2xl p-4 active:opacity-80 transition-opacity" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#1ED75F22' }}>
            {community.imageUrl
              ? <img src={community.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
              : <span className="text-xl font-black text-brand-green">{community.name.charAt(0)}</span>}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-bold text-white text-[15px] leading-tight">{community.name}</p>
              {community.verified && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#3B82F620', color: '#3B82F6' }}>✓</span>
              )}
            </div>
            {community.description && (
              <p className="text-xs text-white/50 mt-0.5 line-clamp-1">{community.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1">
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

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={onToggleFavorite}
              className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/15 hover:bg-white/8 transition-colors"
              title={isFavorite ? 'Elimină favorit' : 'Marchează favorit'}>
              <Star size={14} fill={isFavorite ? '#FFB800' : 'none'} className={isFavorite ? 'text-yellow-400' : 'text-white/40'} />
            </button>
            <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center">
              <ArrowRight size={14} className="text-white/50" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Discover community card (clickable → opens preview popup) ─────────────────

function DiscoverCommunityCard({
  community, onPreview,
}: {
  community: CommunityDoc
  onPreview: () => void
}) {
  return (
    <button onClick={onPreview} className="w-full text-left">
      <div className="rounded-2xl p-4 active:opacity-80 transition-opacity border border-white/5" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#1ED75F22' }}>
            {community.imageUrl
              ? <img src={community.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
              : <span className="text-xl font-black text-brand-green">{community.name.charAt(0)}</span>}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-bold text-white text-[15px] leading-tight">{community.name}</p>
              {community.verified && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#3B82F620', color: '#3B82F6' }}>✓</span>
              )}
            </div>
            {community.description && (
              <p className="text-xs text-white/50 mt-0.5 line-clamp-1">{community.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1">
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

          <div className="flex-shrink-0">
            <div className="h-8 px-3 rounded-lg text-xs font-bold flex items-center"
              style={{ backgroundColor: '#1ED75F18', color: '#1ED75F' }}>
              Intru
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Members Preview Modal (for non-members) ───────────────────────────────────

function MembersPreviewModal({
  community, joining, onJoin, onClose,
}: {
  community: CommunityDoc
  joining: boolean
  onJoin: () => void
  onClose: () => void
}) {
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)

  useEffect(() => {
    getDocs(collection(db, 'communities', community.id, 'members'))
      .then(snap => {
        const list = snap.docs.map(d => d.data() as CommunityMember)
        list.sort((a, b) => {
          const order = ['ADMIN', 'MODERATOR', 'TRAINER', 'MEMBER']
          return order.indexOf(a.role) - order.indexOf(b.role)
        })
        setMembers(list)
      })
      .catch(() => { /* permission denied — show empty */ })
      .finally(() => setLoadingMembers(false))
  }, [community.id])

  const ROLE_COLORS: Record<string, string> = {
    ADMIN: '#FFB800', MODERATOR: '#3B82F6', TRAINER: '#F97316', MEMBER: '#1ED75F',
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-3xl flex flex-col"
        style={{ backgroundColor: 'var(--app-surface)', maxHeight: '75vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Community header */}
        <div className="px-5 pt-2 pb-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#1ED75F22' }}>
              {community.imageUrl
                ? <img src={community.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                : <span className="text-xl font-black text-brand-green">{community.name.charAt(0)}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-black text-white text-sm truncate">{community.name}</p>
                {community.verified && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#3B82F620', color: '#3B82F6' }}>✓</span>
                )}
              </div>
              <p className="text-xs text-white/45 mt-0.5">{community.memberCount} membri · {community.location}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <X size={14} className="text-white/50" />
            </button>
          </div>
          {community.description && (
            <p className="text-xs text-white/50 mt-2 leading-relaxed">{community.description}</p>
          )}
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <p className="text-[10px] font-bold text-white/30 tracking-widest mb-2">MEMBRI</p>
          {loadingMembers ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-4">{community.memberCount} membri</p>
          ) : (
            <div className="flex flex-col gap-2">
              {members.map(m => {
                const roleColor = ROLE_COLORS[m.role] ?? '#1ED75F'
                return (
                  <div key={m.userId} className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${roleColor}22`, border: `1.5px solid ${roleColor}` }}>
                      {m.photoUrl
                        ? <img src={m.photoUrl} alt={m.displayName} className="w-full h-full object-cover" />
                        : <span className="text-xs font-black" style={{ color: roleColor }}>{m.displayName.charAt(0).toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{m.displayName}</p>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{ backgroundColor: `${roleColor}18`, color: roleColor }}>
                      {ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Join button */}
        <div className="px-5 py-4 border-t border-white/8">
          <button
            onClick={onJoin}
            disabled={joining}
            className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm disabled:opacity-50"
          >
            {joining ? '...' : 'Intru în comunitate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Join Notification Modal ───────────────────────────────────────────────────

function JoinNotificationModal({
  communityName, onRequestNotifications, onDismiss,
}: {
  communityName: string
  onRequestNotifications: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60" onClick={onDismiss}>
      <div
        className="w-full max-w-sm rounded-t-3xl p-6 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-end mb-1">
          <button onClick={onDismiss} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/50" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#1ED75F18', border: '1px solid #1ED75F30' }}>
            <Bell size={24} className="text-brand-green" />
          </div>
          <div>
            <p className="font-black text-white text-base">Ai intrat în {communityName}!</p>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed">
              Vrei să primești notificări despre antrenamente și noutăți din această comunitate?
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onRequestNotifications}
            className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm"
          >
            Da, activează notificările
          </button>
          <button
            onClick={onDismiss}
            className="w-full h-10 rounded-2xl text-white/45 text-sm font-semibold"
          >
            Nu, mulțumesc
          </button>
        </div>
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
          <span className="text-[10px] text-brand-green font-bold flex-shrink-0">{formatDate(event.timeStart ?? event.date)}</span>
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
