'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  collection, query, orderBy, onSnapshot, doc,
  updateDoc, setDoc, arrayUnion, increment, serverTimestamp, getDocs, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { CommunityDoc } from '@/types'
import { Plus, Users, MapPin, Star } from 'lucide-react'

export default function CommunityPage() {
  const { user } = useAuth()
  const [communities, setCommunities] = useState<CommunityDoc[]>([])
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [tab, setTab] = useState(0)
  const [favoriteCommunityId, setFavoriteCommunityId] = useState<string | null>(null)

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

  async function toggleFavorite(communityId: string) {
    if (!user) return
    const newFav = favoriteCommunityId === communityId ? null : communityId
    await updateDoc(doc(db, 'users', user.uid), { favoriteCommunityId: newFav ?? '' })
  }

  async function joinCommunity(community: CommunityDoc) {
    if (!user || joiningId) return
    setJoiningId(community.id)
    try {
      // Add member doc
      await setDoc(doc(db, 'communities', community.id, 'members', user.uid), {
        userId: user.uid,
        displayName: user.displayName ?? '',
        role: 'MEMBER',
        level: 1,
        points: 0,
        photoUrl: user.photoURL ?? null,
        joinedAt: serverTimestamp(),
      })
      // Increment memberCount
      await updateDoc(doc(db, 'communities', community.id), { memberCount: increment(1) })
      // Add to user's joinedCommunityIds
      await updateDoc(doc(db, 'users', user.uid), {
        joinedCommunityIds: arrayUnion(community.id),
      })
    } finally {
      setJoiningId(null)
    }
  }

  const myCommunities = communities.filter(c => joinedIds.has(c.id))
  const allCommunities = communities

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-black text-white">Comunitate</h1>
          <Link href="/community/create">
            <button className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center">
              <Plus size={18} className="text-black" strokeWidth={2.5} />
            </button>
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-4">
          {['Comunități', 'Ale mele'].map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/45'}`}>
              {t}
            </button>
          ))}
        </div>

        {loading
          ? <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
          : (
            <div className="flex flex-col gap-3">
              {(tab === 0 ? allCommunities : myCommunities).map(c => (
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
              {(tab === 1 && myCommunities.length === 0) && (
                <p className="text-sm text-white/35 text-center py-8">Nu ești în nicio comunitate încă.</p>
              )}
            </div>
          )}
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
        {/* Icon */}
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
