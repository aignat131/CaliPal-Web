'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, setDoc, deleteDoc, getDocs, increment, serverTimestamp, limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { createNotification } from '@/lib/firebase/notifications'
import { awardCoins } from '@/lib/gamification/coins'
import type { FriendRequest, FriendEntry } from '@/types'
import { ArrowLeft, Check, X, UserMinus, Search } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

export default function FriendsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const t = useT()
  const [tab, setTab] = useState(0)
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [friends, setFriends] = useState<FriendEntry[]>([])
  const [loadingUids, setLoadingUids] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<{ uid: string; name: string; photoUrl: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'friend_requests'),
      where('toUid', '==', user.uid),
      where('status', '==', 'PENDING')
    )
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }) as FriendRequest))
    })
    return unsub
  }, [user])

  useEffect(() => {
    if (!user) return
    const q = collection(db, 'users', user.uid, 'friends')
    const unsub = onSnapshot(q, snap => {
      setFriends(snap.docs.map(d => d.data() as FriendEntry))
    })
    return unsub
  }, [user])

  async function acceptRequest(req: FriendRequest) {
    if (!user) return
    setLoadingUids(s => new Set(s).add(req.fromUid))
    try {
      await updateDoc(doc(db, 'friend_requests', req.id), { status: 'ACCEPTED' })
      await setDoc(doc(db, 'users', user.uid, 'friends', req.fromUid), {
        friendUid: req.fromUid,
        friendName: req.fromName,
        friendPhotoUrl: req.fromPhotoUrl ?? '',
        since: serverTimestamp(),
      })
      await setDoc(doc(db, 'users', req.fromUid, 'friends', user.uid), {
        friendUid: user.uid,
        friendName: user.displayName ?? '',
        friendPhotoUrl: user.photoURL ?? '',
        since: serverTimestamp(),
      })
      await updateDoc(doc(db, 'users', user.uid), { friendCount: increment(1) })
      await updateDoc(doc(db, 'users', req.fromUid), { friendCount: increment(1) })
      await createNotification(req.fromUid, 'FRIEND_REQUEST_ACCEPTED',
        'Cerere acceptată! 🎉',
        `${user.displayName || 'Cineva'} ți-a acceptat cererea de prietenie.`,
        user.uid
      )
    } catch (err) {
      console.error('acceptRequest failed', err)
    } finally {
      setLoadingUids(s => { const n = new Set(s); n.delete(req.fromUid); return n })
    }
  }

  async function declineRequest(req: FriendRequest) {
    await updateDoc(doc(db, 'friend_requests', req.id), { status: 'DECLINED' })
  }

  async function removeFriend(entry: FriendEntry) {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'friends', entry.friendUid))
    await deleteDoc(doc(db, 'users', entry.friendUid, 'friends', user.uid))
    await updateDoc(doc(db, 'users', user.uid), { friendCount: increment(-1) })
    await updateDoc(doc(db, 'users', entry.friendUid), { friendCount: increment(-1) })
  }

  async function searchUser() {
    const term = searchQuery.trim()
    if (!term || !user) return
    setSearching(true)
    setSearchError('')
    setSearchResult(null)
    try {
      const isEmail = term.includes('@')
      let snap
      if (isEmail) {
        snap = await getDocs(query(collection(db, 'users'), where('email', '==', term.toLowerCase())))
      } else {
        // Prefix search on displayName (case-sensitive)
        snap = await getDocs(query(
          collection(db, 'users'),
          where('displayName', '>=', term),
          where('displayName', '<=', term + '\uf8ff'),
          limit(5)
        ))
        // Also try capitalized variant if user typed lowercase
        if (snap.empty && term[0] !== term[0].toUpperCase()) {
          const capitalized = term[0].toUpperCase() + term.slice(1)
          snap = await getDocs(query(
            collection(db, 'users'),
            where('displayName', '>=', capitalized),
            where('displayName', '<=', capitalized + '\uf8ff'),
            limit(5)
          ))
        }
      }
      if (snap.empty) { setSearchError(t('friends.not_found')); return }
      const found = snap.docs.find(d => d.id !== user.uid) ?? snap.docs[0]
      if (found.id === user.uid) { setSearchError(t('friends.thats_you')); return }
      setSearchResult({ uid: found.id, name: found.data().displayName, photoUrl: found.data().photoUrl ?? '' })
    } finally {
      setSearching(false)
    }
  }

  async function sendRequest(toUid: string, toName: string) {
    if (!user) return
    const reqId = `${user.uid}_${toUid}`
    await setDoc(doc(db, 'friend_requests', reqId), {
      id: reqId,
      fromUid: user.uid,
      fromName: user.displayName ?? '',
      fromPhotoUrl: user.photoURL ?? '',
      toUid,
      toName,
      status: 'PENDING',
      sentAt: serverTimestamp(),
    })
    await createNotification(toUid, 'FRIEND_REQUEST',
      'Cerere de prietenie',
      `${user.displayName || 'Cineva'} ți-a trimis o cerere de prietenie.`,
      user.uid
    )
    awardCoins(user.uid, 'ADD_FRIEND').catch(() => {})
    setSearchResult(null)
    setSearchQuery('')
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">{t('friends.title')}</h1>
        </div>

        {/* Search */}
        <div className="mb-5 rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <p className="text-[11px] font-bold text-white/40 tracking-[1.5px] mb-2">{t('friends.search_label')}</p>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchUser()}
              placeholder={t('friends.search_placeholder')}
              type="text"
              className="flex-1 h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
            />
            <button
              onClick={searchUser}
              disabled={searching}
              className="w-10 h-10 rounded-xl bg-brand-green flex items-center justify-center disabled:opacity-50"
            >
              <Search size={15} className="text-black" />
            </button>
          </div>
          {searchError && <p className="text-xs text-red-400 mt-2">{searchError}</p>}
          {searchResult && (
            <div className="flex items-center justify-between mt-3 p-3 rounded-xl bg-white/5">
              <div className="flex items-center gap-2">
                <Avatar name={searchResult.name} photoUrl={searchResult.photoUrl} size={36} />
                <span className="text-sm font-semibold text-white">{searchResult.name}</span>
              </div>
              <button
                onClick={() => sendRequest(searchResult.uid, searchResult.name)}
                className="px-3 h-8 rounded-lg text-xs font-bold text-black bg-brand-green"
              >
                {t('friends.add')}
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-4 tab-bar">
          {[
            t('friends.requests_tab', { n: String(requests.length) }),
            t('friends.friends_tab', { n: String(friends.length) }),
          ].map((label, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/45'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <div className="flex flex-col gap-2">
            {requests.length === 0
              ? <p className="text-sm text-white/35 text-center py-6">{t('friends.no_requests')}</p>
              : requests.map(req => (
                <div key={req.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ backgroundColor: 'var(--app-surface)' }}>
                  <Avatar name={req.fromName} photoUrl={req.fromPhotoUrl} size={40} />
                  <span className="flex-1 text-sm font-semibold text-white">{req.fromName}</span>
                  <button
                    onClick={() => acceptRequest(req)}
                    disabled={loadingUids.has(req.fromUid)}
                    className="w-8 h-8 rounded-full bg-brand-green/20 border border-brand-green flex items-center justify-center disabled:opacity-40"
                  >
                    <Check size={14} className="text-brand-green" />
                  </button>
                  <button
                    onClick={() => declineRequest(req)}
                    className="w-8 h-8 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center"
                  >
                    <X size={14} className="text-red-400" />
                  </button>
                </div>
              ))}
          </div>
        )}

        {tab === 1 && (
          <div className="flex flex-col gap-2">
            {friends.length === 0
              ? <p className="text-sm text-white/35 text-center py-6">{t('friends.no_friends')}</p>
              : friends.map(f => (
                <div key={f.friendUid} className="flex items-center gap-3 p-3 rounded-2xl" style={{ backgroundColor: 'var(--app-surface)' }}>
                  <button onClick={() => router.push(`/profile/${f.friendUid}`)}>
                    <Avatar name={f.friendName} photoUrl={f.friendPhotoUrl} size={40} />
                  </button>
                  <button onClick={() => router.push(`/profile/${f.friendUid}`)} className="flex-1 text-left">
                    <span className="text-sm font-semibold text-white hover:text-brand-green transition-colors">{f.friendName}</span>
                  </button>
                  <button
                    onClick={() => removeFriend(f)}
                    className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                  >
                    <UserMinus size={14} className="text-red-400" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Avatar({ name, photoUrl, size }: { name: string; photoUrl: string; size: number }) {
  return (
    <div className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: '#1ED75F33' }}>
      {photoUrl
        ? <Image src={photoUrl} alt={name} width={size} height={size} className="object-cover" />
        : <span className="font-black text-brand-green" style={{ fontSize: size * 0.4 }}>{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}
