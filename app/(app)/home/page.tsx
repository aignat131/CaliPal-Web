'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  collection, query, orderBy, limit, onSnapshot, doc, getDoc, getDocs, updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import type {
  UserDoc, CommunityDoc, WeeklyChallenge, UserChallengeProgress,
  PlannedTraining, CommunityChallenge, UserCommunityChallengeProgress,
} from '@/types'
import { Bell, Trophy, Star, X, ChevronLeft, ChevronRight, Check, HelpCircle, MapPin, Clock, Users, Shield } from 'lucide-react'
import { NotificationBell } from '@/components/layout/NotificationPanel'

const SUPERADMIN = 'aignat131@gmail.com'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const { status: pushStatus, requestPermission } = usePushNotifications(user?.uid)
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [joinedCommunities, setJoinedCommunities] = useState<CommunityDoc[]>([])
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null)
  const [challengeProgress, setChallengeProgress] = useState<UserChallengeProgress | null>(null)
  const [commChallenge, setCommChallenge] = useState<CommunityChallenge | null>(null)
  const [commChallengeProgress, setCommChallengeProgress] = useState<UserCommunityChallengeProgress | null>(null)
  const [dismissedPush, setDismissedPush] = useState(false)
  const [showStreakCalendar, setShowStreakCalendar] = useState(false)
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set())
  const [latestFavTraining, setLatestFavTraining] = useState<PlannedTraining | null>(null)

  // Live user doc
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.exists()) setUserDoc({ uid: snap.id, ...snap.data() } as UserDoc)
    })
    return unsub
  }, [user])

  // Workout dates for streak calendar
  useEffect(() => {
    if (!user || !showStreakCalendar) return
    getDocs(query(collection(db, 'users', user.uid, 'workouts'), orderBy('createdAt', 'desc'))).then(snap => {
      const dates = new Set<string>()
      snap.docs.forEach(d => {
        const ts = d.data().createdAt
        if (ts?.toDate) dates.add(ts.toDate().toDateString())
      })
      setWorkoutDates(dates)
    })
  }, [user, showStreakCalendar])

  // Latest training + community challenge from favorite community
  useEffect(() => {
    const favId = userDoc?.favoriteCommunityId
    if (!favId) { setLatestFavTraining(null); setCommChallenge(null); return }

    const unsubTraining = onSnapshot(
      query(collection(db, 'communities', favId, 'trainings'), orderBy('date', 'desc'), limit(1)),
      snap => {
        setLatestFavTraining(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as PlannedTraining)
      },
      () => setLatestFavTraining(null)
    )

    let unsubCommProgress: (() => void) | null = null
    const unsubChallenge = onSnapshot(
      query(collection(db, 'communities', favId, 'challenges'), orderBy('endsAt', 'desc'), limit(1)),
      snap => {
        if (snap.empty) { setCommChallenge(null); return }
        const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as CommunityChallenge
        setCommChallenge(c)
        if (user) {
          if (unsubCommProgress) unsubCommProgress()
          unsubCommProgress = onSnapshot(
            doc(db, 'users', user.uid, 'community_challenge_progress', c.id),
            ps => setCommChallengeProgress(ps.exists() ? ps.data() as UserCommunityChallengeProgress : null)
          )
        }
      },
      () => setCommChallenge(null)
    )

    return () => { unsubTraining(); unsubChallenge(); if (unsubCommProgress) unsubCommProgress() }
  }, [userDoc?.favoriteCommunityId, user])

  // Weekly challenge + live progress
  useEffect(() => {
    if (!user) return
    let unsubProgress: (() => void) | null = null
    const unsubChallenge = onSnapshot(
      query(collection(db, 'weekly_challenges'), orderBy('endsAt', 'desc'), limit(1)),
      snap => {
        if (!snap.empty) {
          const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as WeeklyChallenge
          setChallenge(c)
          // Live progress so the bar updates as the user finishes workouts
          if (unsubProgress) unsubProgress()
          unsubProgress = onSnapshot(
            doc(db, 'users', user.uid, 'challenge_progress', c.id),
            ps => {
              setChallengeProgress(ps.exists() ? (ps.data() as UserChallengeProgress) : null)
            }
          )
        }
      }
    )
    return () => { unsubChallenge(); if (unsubProgress) unsubProgress() }
  }, [user])

  // Joined communities
  useEffect(() => {
    if (!userDoc?.joinedCommunityIds?.length) return
    const ids = userDoc.joinedCommunityIds.slice(0, 10)
    Promise.all(
      ids.map(id =>
        getDoc(doc(db, 'communities', id)).then(snap =>
          snap.exists() ? ({ id: snap.id, ...snap.data() } as CommunityDoc) : null
        )
      )
    ).then(results => setJoinedCommunities(results.filter(Boolean) as CommunityDoc[]))
  }, [userDoc?.joinedCommunityIds])

  const storedName = userDoc?.displayName
  const displayName = (storedName && storedName !== 'Utilizator')
    ? storedName
    : (user?.displayName || storedName || 'Utilizator')
  const firstName = displayName.split(' ')[0]
  const streak = userDoc?.currentStreak ?? 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bună dimineața' : hour < 18 ? 'Bună ziua' : 'Bună seara'

  const showPushBanner = pushStatus === 'idle' && !dismissedPush

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Streak Calendar Modal */}
      {showStreakCalendar && user && (
        <StreakCalendar
          streak={streak}
          workoutDates={workoutDates}
          onClose={() => setShowStreakCalendar(false)}
        />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-12 border-b border-white/8"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        <p className="text-xl font-black text-white">Acasă</p>
        <div className="flex items-center gap-2">
          {/* Streak icon */}
          <button
            onClick={() => setShowStreakCalendar(true)}
            className="flex items-center gap-1 px-2.5 h-8 rounded-full transition-colors"
            style={{ backgroundColor: '#FF6B2B18', border: '1px solid #FF6B2B30' }}
          >
            <span className={`text-base leading-none ${streak > 0 ? 'animate-pulse' : ''}`}>🔥</span>
            {streak > 0 && <span className="text-xs font-black" style={{ color: '#FF6B2B' }}>{streak}</span>}
          </button>
          {user?.email === SUPERADMIN && (
            <Link href="/admin">
              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#FF000020', border: '1px solid #FF000040' }}>
                <Shield size={14} className="text-red-400" />
              </div>
            </Link>
          )}
          {user && <NotificationBell uid={user.uid} />}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-8">

        {/* Push notification banner */}
        {showPushBanner && (
          <div className="flex items-center gap-3 p-3 rounded-2xl mb-4 border border-brand-green/20"
            style={{ backgroundColor: '#1ED75F10' }}>
            <Bell size={18} className="text-brand-green flex-shrink-0" />
            <p className="text-xs text-white/70 flex-1">Activează notificările pentru a fi la curent cu activitatea comunității.</p>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setDismissedPush(true)} className="text-xs text-white/35">Nu</button>
              <button onClick={requestPermission} className="text-xs font-bold text-brand-green">Da</button>
            </div>
          </div>
        )}

        {/* Greeting */}
        <div className="mb-3">
          <p className="text-white/50 text-sm">{greeting},</p>
          {authLoading || (!userDoc && !user?.displayName)
            ? <div className="h-7 w-32 rounded-lg bg-white/8 animate-pulse" />
            : <h1 className="text-2xl font-black text-white leading-tight">{firstName} 👋</h1>
          }
        </div>

        {/* Onboarding card for new users with no communities */}
        {userDoc && !userDoc.joinedCommunityIds?.length && (
          <div className="rounded-2xl p-5 mb-4 border border-brand-green/30"
            style={{ background: 'linear-gradient(135deg, #1ED75F08 0%, #0D3D2808 100%)' }}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1ED75F18', border: '1px solid #1ED75F30' }}>
                <span className="text-2xl">🏋️</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-sm leading-tight">Bun venit în CaliPal!</p>
                <p className="text-xs text-white/55 mt-1 leading-relaxed">
                  Alătură-te unei comunități din orașul tău și antrenează-te împreună cu alți pasionați de calistenie.
                </p>
                <Link href="/community">
                  <button className="mt-3 h-9 px-4 rounded-xl bg-brand-green text-black text-xs font-black flex items-center gap-1.5">
                    <Users size={13} />
                    Explorează comunitățile
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Assessment banner for new users */}
        {userDoc && userDoc.assessmentCompleted === false && (
          <div className="rounded-2xl p-4 mb-4 border border-brand-green/30"
            style={{ backgroundColor: '#1ED75F08' }}>
            <p className="font-black text-white text-sm">Completează evaluarea inițială 🎯</p>
            <p className="text-xs text-white/60 mt-1">
              Descoperă-ți nivelul și deblochează skill-uri personalizate. Durează 2 minute.
            </p>
            <Link href="/profile/assessment">
              <button className="mt-3 h-9 px-5 rounded-xl bg-brand-green text-black text-sm font-bold">
                Începe evaluarea
              </button>
            </Link>
          </div>
        )}

        {/* Latest training from favorite community */}
        {latestFavTraining && userDoc?.favoriteCommunityId && user && (
          <FavTrainingCard
            training={latestFavTraining}
            favId={userDoc.favoriteCommunityId}
            uid={user.uid}
          />
        )}

        {/* Favorite community */}
        {userDoc?.favoriteCommunityId && (() => {
          const fav = joinedCommunities.find(c => c.id === userDoc.favoriteCommunityId)
          if (!fav) return null
          return (
            <div className="mb-5">
              <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">COMUNITATE FAVORITĂ</p>
              <Link href={`/community/${fav.id}`}>
                <div className="rounded-2xl p-4 flex items-center gap-3 border border-yellow-400/20"
                  style={{ backgroundColor: '#FFB80010' }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#1ED75F22' }}>
                    {fav.imageUrl
                      ? <img src={fav.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                      : <span className="text-xl font-black text-brand-green">{fav.name.charAt(0)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-white text-[15px] truncate">{fav.name}</p>
                      <Star size={12} fill="#FFB800" className="text-yellow-400 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{fav.memberCount} membri</p>
                  </div>
                </div>
              </Link>
            </div>
          )
        })()}

        {/* Joined communities */}
        {joinedCommunities.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-white/40 tracking-widest">COMUNITĂȚILE MELE</p>
              <Link href="/community" className="text-xs text-brand-green font-semibold">Vezi toate</Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {joinedCommunities.slice(0, 6).map(c => (
                <Link key={c.id} href={`/community/${c.id}`}>
                  <div className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: '#1ED75F22', border: '1px solid #1ED75F33' }}>
                      {c.imageUrl
                        ? <img src={c.imageUrl} alt="" className="w-full h-full object-cover rounded-2xl" />
                        : <span className="text-lg font-black text-brand-green">{c.name.charAt(0)}</span>}
                    </div>
                    <p className="text-[10px] text-white/60 text-center leading-tight line-clamp-2">{c.name}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Challenges section (replaces recent activity) */}
        <div>
          <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">PROVOCĂRI</p>
          <div className="flex flex-col gap-3">
            {challenge && (
              <Link href="/workout">
                <ChallengeCard
                  label="PROVOCARE SĂPTĂMÂNALĂ"
                  title={challenge.title}
                  exerciseName={challenge.exerciseName}
                  targetReps={challenge.targetReps}
                  coinsReward={challenge.coinsReward}
                  current={challengeProgress?.currentReps ?? 0}
                  completed={challengeProgress?.completed ?? false}
                />
              </Link>
            )}
            {commChallenge && userDoc?.favoriteCommunityId && (
              <Link href="/community">
                <ChallengeCard
                  label="PROVOCARE COMUNITATE"
                  title={commChallenge.title}
                  exerciseName={commChallenge.exerciseName}
                  targetReps={commChallenge.targetReps}
                  coinsReward={commChallenge.coinsReward}
                  current={commChallengeProgress?.currentReps ?? 0}
                  completed={commChallengeProgress?.completed ?? false}
                  accent="#F97316"
                />
              </Link>
            )}
            {!challenge && !commChallenge && (
              <div className="rounded-2xl p-6 flex flex-col items-center gap-2 text-center"
                style={{ backgroundColor: 'var(--app-surface)' }}>
                <Trophy size={28} className="text-white/20" />
                <p className="text-sm text-white/40">Nicio provocare activă momentan.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

function ChallengeCard({
  label, title, exerciseName, targetReps, coinsReward, current, completed, accent = '#3B82F6',
}: {
  label: string
  title: string
  exerciseName: string
  targetReps: number
  coinsReward: number
  current: number
  completed: boolean
  accent?: string
}) {
  const pct = Math.min(100, Math.round((current / targetReps) * 100))
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Trophy size={14} className="text-yellow-400" />
        <p className="text-xs font-bold text-white/45 tracking-widest">{label}</p>
        {completed && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green/20 text-brand-green">FINALIZAT ✓</span>}
      </div>
      <p className="font-black text-white text-sm mb-0.5">{title}</p>
      <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
        <span>{current} / {targetReps} {exerciseName}</span>
        <span>🪙 +{coinsReward}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: completed ? '#1ED75F' : accent }} />
      </div>
    </div>
  )
}

function FavTrainingCard({ training, favId, uid }: { training: PlannedTraining; favId: string; uid: string }) {
  const myRsvp = training.rsvps?.[uid] ?? null
  const goingCount = training.rsvps
    ? Object.values(training.rsvps).filter(v => v === 'GOING').length
    : 0

  async function setRsvp(value: 'GOING' | 'MAYBE' | 'NOT_GOING') {
    await updateDoc(doc(db, 'communities', favId, 'trainings', training.id), {
      [`rsvps.${uid}`]: value,
    })
  }

  return (
    <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-start justify-between mb-2">
        <p className="font-black text-white text-[15px] leading-tight flex-1 pr-2">{training.name}</p>
        <span className="text-[11px] text-white/40 flex-shrink-0">{training.date}</span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
        {(training.timeStart || training.timeEnd) && (
          <span className="flex items-center gap-1 text-xs text-white/50">
            <Clock size={11} className="text-white/35" />
            {training.timeStart}{training.timeEnd ? `–${training.timeEnd}` : ''}
          </span>
        )}
        {training.location && (
          <span className="flex items-center gap-1 text-xs text-white/50">
            <MapPin size={11} className="text-white/35" />
            {training.location}
          </span>
        )}
        {goingCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-white/50">
            <Users size={11} className="text-white/35" />
            {goingCount} {goingCount === 1 ? 'merge' : 'merg'}
          </span>
        )}
      </div>

      {training.description ? (
        <p className="text-xs text-white/40 mb-3 line-clamp-2">{training.description}</p>
      ) : null}

      <div className="flex gap-2">
        <button
          onPointerDown={() => setRsvp('GOING')}
          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors"
          style={myRsvp === 'GOING'
            ? { backgroundColor: '#1ED75F', color: '#000' }
            : { backgroundColor: '#1ED75F18', color: '#1ED75F' }}
        >
          <Check size={13} /> Merg
        </button>
        <button
          onPointerDown={() => setRsvp('MAYBE')}
          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors"
          style={myRsvp === 'MAYBE'
            ? { backgroundColor: '#F59E0B', color: '#000' }
            : { backgroundColor: '#F59E0B18', color: '#F59E0B' }}
        >
          <HelpCircle size={13} /> Poate
        </button>
        <button
          onPointerDown={() => setRsvp('NOT_GOING')}
          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors"
          style={myRsvp === 'NOT_GOING'
            ? { backgroundColor: '#EF4444', color: '#fff' }
            : { backgroundColor: '#EF444418', color: '#EF4444' }}
        >
          <X size={13} /> Nu merg
        </button>
      </div>
    </div>
  )
}

// ── Streak Calendar ────────────────────────────────────────────────────────────

function StreakCalendar({ streak, workoutDates, onClose }: {
  streak: number
  workoutDates: Set<string>
  onClose: () => void
}) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const monthName = viewDate.toLocaleDateString('ro', { month: 'long', year: 'numeric' })

  const firstDow = new Date(year, month, 1).getDay()
  const firstOffset = (firstDow + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)
    if (next <= today) setViewDate(next)
  }

  const isToday = (day: number) => new Date(year, month, day).toDateString() === today.toDateString()
  const isTrained = (day: number) => workoutDates.has(new Date(year, month, day).toDateString())
  const isFuture = (day: number) => new Date(year, month, day) > today

  const cells: (number | null)[] = [
    ...Array(firstOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const canGoNext = new Date(year, month + 1, 1) <= today

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-3xl p-5 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-base font-black text-white">Streak activ</p>
            <p className="text-sm font-bold" style={{ color: '#FF6B2B' }}>🔥 {streak} {streak === 1 ? 'zi' : 'zile'} consecutiv{streak === 1 ? 'ă' : 'e'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
            <X size={15} className="text-white/60" />
          </button>
        </div>

        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
            <ChevronLeft size={16} className="text-white/60" />
          </button>
          <p className="text-sm font-bold text-white capitalize">{monthName}</p>
          <button onClick={nextMonth} disabled={!canGoNext}
            className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center disabled:opacity-30">
            <ChevronRight size={16} className="text-white/60" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-white/30 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`blank-${i}`} />
            const trained = isTrained(day)
            const todayCell = isToday(day)
            const future = isFuture(day)
            return (
              <div key={day} className="flex flex-col items-center py-0.5">
                {trained
                  ? <span className="text-lg leading-none">🔥</span>
                  : <div className={`w-7 h-7 rounded-full flex items-center justify-center ${todayCell ? 'border border-brand-green' : ''}`}>
                      <span className={`text-xs font-semibold ${future ? 'text-white/15' : todayCell ? 'text-brand-green font-black' : 'text-white/40'}`}>{day}</span>
                    </div>
                }
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 mt-4 justify-center">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🔥</span>
            <span className="text-xs text-white/50">Antrenament efectuat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full border border-brand-green" />
            <span className="text-xs text-white/50">Azi</span>
          </div>
        </div>
      </div>
    </div>
  )
}
