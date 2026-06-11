'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import {
  doc, collection, query, orderBy, limit,
  setDoc, deleteDoc, updateDoc, onSnapshot, serverTimestamp, increment, getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { createNotification } from '@/lib/firebase/notifications'
import type { UserDoc, WorkoutDoc } from '@/types'
import { conversationId } from '@/types'
import { ArrowLeft, MessageSquare, UserPlus, UserCheck, Clock, Dumbbell, X } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

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

function exercisePreview(ex: import('@/types').WorkoutExercise, nSetsLabel: (n: number) => string): string {
  const n = ex.sets.length
  if (n === 0) return ex.name
  const first = ex.sets[0]
  if (n === 1) {
    const v = first.reps != null ? `×${first.reps}` : first.durationSeconds != null ? `${first.durationSeconds}s` : ''
    return v ? `${ex.name} ${v}` : ex.name
  }
  const allSame = ex.sets.every(s => s.reps === first.reps && s.durationSeconds === first.durationSeconds)
  if (allSame) {
    const v = first.reps != null ? `${n}×${first.reps}` : first.durationSeconds != null ? `${n}×${first.durationSeconds}s` : nSetsLabel(n)
    return `${ex.name} ${v}`
  }
  const total = ex.sets.reduce((s, set) => s + (set.reps ?? 0), 0)
  return total > 0 ? `${ex.name} ${total} rep` : ex.name
}

type FriendStatus = 'none' | 'friends' | 'sent' | 'received'

export default function UserProfilePage() {
  const { user } = useAuth()
  const { displayName: myName, photoUrl: myPhoto } = useMyProfile()
  const router = useRouter()
  const params = useParams()
  const t = useT()
  const uid = params.uid as string

  const LEVEL_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    beginner:     { label: t('profile.badge_beginner'),     color: 'rgba(255,255,255,0.7)', bg: '#ffffff15' },
    intermediate: { label: t('profile.badge_intermediate'), color: '#60A5FA',               bg: '#3B82F622' },
    advanced:     { label: t('profile.badge_advanced'),     color: '#F97316',               bg: '#F9731622' },
    elite:        { label: t('profile.badge_elite'),        color: '#FFB800',               bg: '#FFB80022' },
  }

  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutDoc[]>([])
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [friendLoading, setFriendLoading] = useState(false)
  const [friendError, setFriendError] = useState<string | null>(null)
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDoc | null>(null)

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
    }, () => setLoading(false))
    return unsub
  }, [uid])

  // Load recent workouts (real-time)
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'users', uid, 'workouts'),
      orderBy('createdAt', 'desc'),
      limit(3)
    )
    const unsub = onSnapshot(q, snap => {
      setRecentWorkouts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as WorkoutDoc))
    }, () => { /* offline or auth issue — keep empty */ })
    return unsub
  }, [uid, user])

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
      const existing = await getDoc(doc(db, 'friend_requests', reqId))
      if (existing.exists()) {
        const sentAt: { toDate?: () => Date } | undefined = existing.data()?.sentAt
        const sentMs = sentAt?.toDate?.()?.getTime() ?? 0
        if (Date.now() - sentMs < 24 * 60 * 60 * 1000) {
          setFriendError(t('pub_profile.spam_guard'))
          setFriendLoading(false)
          return
        }
      }
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
      setFriendError(e instanceof Error ? e.message : t('common.unknown_error'))
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
    const fallback = t('common.user_fallback')
    router.push(`/chat/${convId}?otherUserId=${uid}&otherName=${encodeURIComponent(profile?.displayName ?? fallback)}`)
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
        <p className="text-white/60 font-semibold">{t('pub_profile.not_found')}</p>
        <button onClick={() => router.back()} className="mt-4 text-brand-green text-sm font-bold">{t('pub_profile.back')}</button>
      </div>
    )
  }

  const userFallback = t('common.user_fallback')
  const displayName = (profile.displayName && profile.displayName !== userFallback)
    ? profile.displayName
    : (profile.email?.split('@')[0] || profile.displayName || userFallback)
  const photoUrl = profile.photoUrl
  const initial = displayName.charAt(0).toUpperCase()

  const nSetsLabel = (n: number) => t('common.n_sets', { n: String(n) })

  // Skills from assessment
  const allMasteredSkills = Object.values(profile.skillsByCategory ?? {}).flatMap(cat => cat.have)
  const favoriteSkillIds = profile.favoriteSkillIds ?? []
  const displaySkills = favoriteSkillIds.length > 0
    ? allMasteredSkills.filter(s => favoriteSkillIds.includes(s.id)).slice(0, 5)
    : allMasteredSkills.slice(0, 5)

  // Badge based on assessment level
  const assessmentLevel = profile.basicStrength?.level
  const badge = profile.isCoach
    ? { label: '⭐ Master Coach', color: '#1ED75F', bg: '#1ED75F22' }
    : LEVEL_BADGE[assessmentLevel ?? 'beginner'] ?? LEVEL_BADGE.beginner

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
              <Stat value={String((profile.totalWorkouts ?? 0) + (profile.totalTrainings ?? 0))} label={t('pub_profile.workouts')} />
              <Stat value={String(profile.coins ?? 0)} label={t('pub_profile.coins')} />
              <Stat value={String(profile.friendCount ?? 0)} label={t('pub_profile.friends')} />
            </div>
            {(profile.currentStreak ?? 0) > 0 && (
              <div className="flex justify-end">
                <span className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{ backgroundColor: '#1ED75F22', color: '#1ED75F' }}>
                  {t('pub_profile.streak', { n: String(profile.currentStreak) })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Name + badge + bio */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[17px] font-black text-white">{displayName}</span>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium"
              style={{ backgroundColor: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
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
              <UserCheck size={16} /> {t('pub_profile.friend_label')}
            </button>
          ) : friendStatus === 'sent' ? (
            <button
              disabled
              className="flex-1 h-11 rounded-xl border border-white/20 text-white/40 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Clock size={16} /> {t('pub_profile.request_sent')}
            </button>
          ) : friendStatus === 'received' ? (
            <button
              onClick={acceptRequest}
              disabled={friendLoading}
              className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <UserPlus size={16} /> {t('pub_profile.accept_request')}
            </button>
          ) : (
            <button
              onClick={sendFriendRequest}
              disabled={friendLoading}
              className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <UserPlus size={16} /> {t('pub_profile.add_friend')}
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
          <p className="text-sm font-bold text-white mb-3">{t('pub_profile.recent_workouts')}</p>
          {recentWorkouts.length === 0 ? (
            <div className="flex items-center gap-2 py-2">
              <Dumbbell size={20} className="text-white/20" />
              <p className="text-xs text-white/35">{t('pub_profile.no_workouts')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentWorkouts.map(w => (
                <button key={w.id} onClick={() => setSelectedWorkout(w)}
                  className="w-full flex items-center justify-between py-1.5 text-left hover:bg-white/5 rounded-xl px-1 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {w.exercises.map(e => exercisePreview(e, nSetsLabel)).join(' · ')}
                    </p>
                    <p className="text-[10px] text-white/35 mt-0.5">
                      ⏱ {formatDuration(w.durationSeconds)} · 🔁 {w.totalReps} rep
                    </p>
                  </div>
                  <span className="text-[10px] text-white/35 ml-3 flex-shrink-0">{formatDate(w.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Workout detail modal */}
        {selectedWorkout && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
            onClick={() => setSelectedWorkout(null)}>
            <div className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8 max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: 'var(--app-surface)' }}
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-black text-white">
                  {t('pub_profile.workout_modal', { date: formatDate(selectedWorkout.createdAt) })}
                </p>
                <button onClick={() => setSelectedWorkout(null)}
                  className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
                  <X size={13} className="text-white/60" />
                </button>
              </div>
              <p className="text-[10px] text-white/40 mb-3">
                ⏱ {formatDuration(selectedWorkout.durationSeconds)} · 🔁 {selectedWorkout.totalReps} {t('pub_profile.rep_total')}
              </p>
              <div className="flex flex-col gap-3">
                {selectedWorkout.exercises.map((ex, i) => (
                  <div key={i} className="rounded-xl p-3 border border-white/8"
                    style={{ backgroundColor: 'var(--app-bg)' }}>
                    <p className="text-sm font-bold text-white mb-2">{ex.name}</p>
                    <div className="flex flex-col gap-1">
                      {ex.sets.map((s, si) => (
                        <div key={si} className="flex items-center gap-2 text-xs text-white/60">
                          <span className="w-12 text-white/30">{t('pub_profile.set_n', { n: String(si + 1) })}</span>
                          {s.reps != null && <span>{s.reps} rep</span>}
                          {s.durationSeconds != null && <span>{s.durationSeconds}s</span>}
                          {s.weightKg != null && <span className="text-brand-green">+{s.weightKg}kg</span>}
                          {s.bandKg != null && <span className="text-yellow-400">~{s.bandKg}kg bandă</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {selectedWorkout.note && (
                <p className="text-xs text-white/50 mt-3 leading-relaxed">{selectedWorkout.note}</p>
              )}
            </div>
          </div>
        )}

        {/* Skills */}
        {displaySkills.length > 0 && (
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">Skills</p>
              <span className="text-xs text-white/40">
                {t('pub_profile.mastered_count', { n: String(allMasteredSkills.length) })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {displaySkills.map(s => (
                <span key={s.id}
                  className="flex items-center h-7 px-2.5 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: '#1ED75F22', color: '#1ED75F', border: '1px solid #1ED75F44' }}>
                  {s.name}
                </span>
              ))}
              {allMasteredSkills.length > 5 && (
                <span className="h-7 px-2.5 rounded-full text-xs font-semibold text-white/40 border border-white/15 flex items-center">
                  {t('pub_profile.more_skills', { n: String(allMasteredSkills.length - 5) })}
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
