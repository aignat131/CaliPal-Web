'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import {
  doc, collection, query, orderBy, limit,
  setDoc, deleteDoc, updateDoc, onSnapshot, serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { createNotification } from '@/lib/firebase/notifications'
import type { UserDoc, WorkoutDoc } from '@/types'
import { conversationId } from '@/types'
import { SKILLS, SKILL_LEVEL_COLORS } from '@/lib/data/skills'
import { ArrowLeft, MessageSquare, UserPlus, UserCheck, Clock, Dumbbell } from 'lucide-react'

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function formatDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date()
  return d.toLocaleDateString('ro', { day: '2-digit', month: 'short' })
}

type FriendStatus = 'none' | 'friends' | 'sent' | 'received'

export default function UserProfilePage() {
  const { user } = useAuth()
  const { displayName: myName, photoUrl: myPhoto } = useMyProfile()
  const router = useRouter()
  const params = useParams()
  const uid = params.uid as string

  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutDoc[]>([])
  const [unlockedSkillIds, setUnlockedSkillIds] = useState<Set<string>>(new Set())
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [friendLoading, setFriendLoading] = useState(false)
  const [friendError, setFriendError] = useState<string | null>(null)

  // Don't render own profile here — redirect to /profile
  useEffect(() => {
    if (user && uid === user.uid) {
      router.replace('/profile')
    }
  }, [user, uid, router])

  // Load target user's profile (real-time)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', uid), snap => {
      if (snap.exists()) setProfile({ uid: snap.id, ...snap.data() } as UserDoc)
      setLoading(false)
    })
    return unsub
  }, [uid])

  // Load recent workouts (real-time)
  useEffect(() => {
    const q = query(
      collection(db, 'users', uid, 'workouts'),
      orderBy('createdAt', 'desc'),
      limit(3)
    )
    const unsub = onSnapshot(q, snap => {
      setRecentWorkouts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as WorkoutDoc))
    })
    return unsub
  }, [uid])

  // Load unlocked skills (real-time)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users', uid, 'skills'), snap => {
      setUnlockedSkillIds(new Set(snap.docs.map(d => d.id)))
    })
    return unsub
  }, [uid])

  // Watch friend status in real-time
  useEffect(() => {
    if (!user) return
    const loaded = { friend: false, sent: false, received: false }
    const state = { isFriend: false, sentPending: false, receivedPending: false }

    function resolve() {
      if (!loaded.friend || !loaded.sent || !loaded.received) return
      if (state.isFriend) setFriendStatus('friends')
      else if (state.sentPending) setFriendStatus('sent')
      else if (state.receivedPending) setFriendStatus('received')
      else setFriendStatus('none')
    }

    const u1 = onSnapshot(doc(db, 'users', user.uid, 'friends', uid), snap => {
      state.isFriend = snap.exists()
      loaded.friend = true
      resolve()
    })
    const u2 = onSnapshot(doc(db, 'friend_requests', `${user.uid}_${uid}`), snap => {
      state.sentPending = snap.exists() && snap.data()?.status === 'PENDING'
      loaded.sent = true
      resolve()
    })
    const u3 = onSnapshot(doc(db, 'friend_requests', `${uid}_${user.uid}`), snap => {
      state.receivedPending = snap.exists() && snap.data()?.status === 'PENDING'
      loaded.received = true
      resolve()
    })

    return () => { u1(); u2(); u3() }
  }, [user, uid])

  async function sendFriendRequest() {
    if (!user || friendLoading) return
    setFriendLoading(true)
    setFriendError(null)
    try {
      const reqId = `${user.uid}_${uid}`
      await setDoc(doc(db, 'friend_requests', reqId), {
        id: reqId,
        fromUid: user.uid,
        fromName: myName,
        fromPhotoUrl: myPhoto,
        toUid: uid,
        toName: profile?.displayName ?? '',
        status: 'PENDING',
        sentAt: serverTimestamp(),
      })
      await createNotification(uid, 'FRIEND_REQUEST',
        'Cerere de prietenie',
        `${myName || 'Cineva'} ți-a trimis o cerere de prietenie.`,
        user.uid
      )
      setFriendStatus('sent')
    } catch (e: unknown) {
      setFriendError(e instanceof Error ? e.message : 'Eroare necunoscută')
    } finally {
      setFriendLoading(false)
    }
  }

  async function removeFriend() {
    if (!user || friendLoading) return
    setFriendLoading(true)
    await Promise.all([
      deleteDoc(doc(db, 'users', user.uid, 'friends', uid)),
      deleteDoc(doc(db, 'users', uid, 'friends', user.uid)),
    ])
    setFriendStatus('none')
    setFriendLoading(false)
  }

  async function acceptRequest() {
    if (!user || friendLoading) return
    setFriendLoading(true)
    const reqId = `${uid}_${user.uid}`
    try {
      await Promise.all([
        setDoc(doc(db, 'users', user.uid, 'friends', uid), {
          friendUid: uid,
          friendName: profile?.displayName ?? '',
          friendPhotoUrl: profile?.photoUrl ?? '',
          since: serverTimestamp(),
        }),
        setDoc(doc(db, 'users', uid, 'friends', user.uid), {
          friendUid: user.uid,
          friendName: user.displayName ?? '',
          friendPhotoUrl: user.photoURL ?? '',
          since: serverTimestamp(),
        }),
        deleteDoc(doc(db, 'friend_requests', reqId)),
        updateDoc(doc(db, 'users', user.uid), { friendCount: increment(1) }),
        updateDoc(doc(db, 'users', uid), { friendCount: increment(1) }),
        createNotification(uid, 'FRIEND_REQUEST_ACCEPTED',
          'Cerere acceptată! 🎉',
          `${myName || 'Cineva'} și-a acceptat cererea ta de prietenie.`,
          user.uid
        ),
      ])
    } catch (err) {
      console.error('acceptRequest failed', err)
    } finally {
      setFriendLoading(false)
    }
  }

  function goToChat() {
    if (!user) return
    const convId = conversationId(user.uid, uid)
    router.push(`/chat/${convId}?otherUserId=${uid}&otherName=${encodeURIComponent(profile?.displayName ?? 'Utilizator')}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6" style={{ backgroundColor: 'var(--app-bg)' }}>
        <p className="text-white/60 font-semibold">Utilizatorul nu a fost găsit.</p>
        <button onClick={() => router.back()} className="mt-4 text-brand-green text-sm font-bold">Înapoi</button>
      </div>
    )
  }

  const displayName = (profile.displayName && profile.displayName !== 'Utilizator')
    ? profile.displayName
    : (profile.email?.split('@')[0] || profile.displayName || 'Utilizator')
  const photoUrl = profile.photoUrl
  const initial = displayName.charAt(0).toUpperCase()
  const unlockedSkills = SKILLS.filter(s => unlockedSkillIds.has(s.id))

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <span className="font-black text-white text-base flex-1 truncate">{displayName}</span>
        </div>

        {/* Profile hero */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-20 h-20 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#1ED75F33', border: '2px solid #1ED75F44' }}>
            {photoUrl
              ? <Image src={photoUrl} alt={displayName} fill sizes="80px" className="object-cover" />
              : <span className="text-3xl font-black text-brand-green">{initial}</span>}
          </div>

          <div className="flex-1">
            <div className="flex justify-around mb-2">
              <Stat value={String(profile.totalWorkouts ?? 0)} label="Antrenamente" />
              <Stat value={String(profile.coins ?? 0)} label="Monede" />
              <Stat value={String(profile.friendCount ?? 0)} label="Prieteni" />
            </div>
            <div className="flex justify-end">
              <span className="px-3 py-1 rounded-full text-xs font-bold"
                style={{ backgroundColor: '#1ED75F22', color: '#1ED75F' }}>
                🔥 {profile.currentStreak ?? 0} zile
              </span>
            </div>
          </div>
        </div>

        {/* Name + badge + bio */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[17px] font-black text-white">{displayName}</span>
            {profile.isCoach && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                style={{ backgroundColor: '#1ED75F22', color: '#1ED75F' }}>
                ⭐ Master Coach
              </span>
            )}
          </div>
          {profile.bio ? (
            <p className="text-sm text-white/70 leading-relaxed">{profile.bio}</p>
          ) : null}
        </div>

        {/* Friend error */}
        {friendError && (
          <p className="text-xs text-red-400 mb-2 px-1">{friendError}</p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mb-5">
          {/* Friend button */}
          {friendStatus === 'friends' ? (
            <button
              onClick={removeFriend}
              disabled={friendLoading}
              className="flex-1 h-11 rounded-xl border border-brand-green/50 text-brand-green text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-green/10 transition-colors disabled:opacity-50"
            >
              <UserCheck size={16} /> Prieten
            </button>
          ) : friendStatus === 'sent' ? (
            <button
              disabled
              className="flex-1 h-11 rounded-xl border border-white/20 text-white/40 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Clock size={16} /> Cerere trimisă
            </button>
          ) : friendStatus === 'received' ? (
            <button
              onClick={acceptRequest}
              disabled={friendLoading}
              className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <UserPlus size={16} /> Acceptă cererea
            </button>
          ) : (
            <button
              onClick={sendFriendRequest}
              disabled={friendLoading}
              className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <UserPlus size={16} /> Adaugă prieten
            </button>
          )}

          {/* Chat button */}
          <button
            onClick={goToChat}
            className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/20 hover:bg-white/8 transition-colors"
          >
            <MessageSquare size={18} className="text-white/70" />
          </button>
        </div>

        {/* Recent workouts */}
        <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <p className="text-sm font-bold text-white mb-3">Antrenamente recente</p>
          {recentWorkouts.length === 0 ? (
            <div className="flex items-center gap-2 py-2">
              <Dumbbell size={20} className="text-white/20" />
              <p className="text-xs text-white/35">Niciun antrenament înregistrat.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentWorkouts.map(w => (
                <div key={w.id} className="flex items-center justify-between py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {w.exercises.map(e => e.name).join(', ')}
                    </p>
                    <p className="text-[10px] text-white/35 mt-0.5">
                      ⏱ {formatDuration(w.durationSeconds)} · 🔁 {w.totalReps} rep
                    </p>
                  </div>
                  <span className="text-[10px] text-white/35 ml-3 flex-shrink-0">{formatDate(w.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Skills */}
        {unlockedSkills.length > 0 && (
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">Skills deblocate</p>
              <span className="text-xs text-white/40">{unlockedSkills.length}/{SKILLS.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {unlockedSkills.slice(0, 8).map(s => (
                <span key={s.id}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: `${SKILL_LEVEL_COLORS[s.level]}22`,
                    color: SKILL_LEVEL_COLORS[s.level],
                    border: `1px solid ${SKILL_LEVEL_COLORS[s.level]}44`,
                  }}>
                  {s.icon} {s.name}
                </span>
              ))}
              {unlockedSkills.length > 8 && (
                <span className="h-7 px-2.5 rounded-full text-xs font-semibold text-white/40 border border-white/15 flex items-center">
                  +{unlockedSkills.length - 8} mai multe
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-base font-black text-white">{value}</span>
      <span className="text-[10px] text-white/40 mt-0.5">{label}</span>
    </div>
  )
}
