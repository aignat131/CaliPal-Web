'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  collection, query, orderBy, limit, onSnapshot, doc, getDoc, getDocs, updateDoc, deleteField,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import type {
  UserDoc, CommunityDoc, WeeklyChallenge, UserChallengeProgress,
  PlannedTraining, CommunityChallenge, UserCommunityChallengeProgress,
  WorkoutDoc,
} from '@/types'
import { Trophy, Star, X, ChevronLeft, ChevronRight, Check, HelpCircle, MapPin, Clock, Users, Shield, Play, BookOpen, MessageSquarePlus, Calendar } from 'lucide-react'
import { NotificationBell } from '@/components/layout/NotificationPanel'
import { buildDailyRecommendation, type DailyRecommendation } from '@/lib/ml/recommend'
import { useT } from '@/lib/context/LanguageContext'
import { parseTrainingDateTime, formatTrainingDate, compareTrainingDatesAsc } from '@/lib/utils/trainingDateTime'

export default function HomePage() {
  const { user, loading: authLoading, isSuperAdmin } = useAuth()
  const t = useT()
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [joinedCommunities, setJoinedCommunities] = useState<CommunityDoc[]>([])
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null)
  const [challengeProgress, setChallengeProgress] = useState<UserChallengeProgress | null>(null)
  const [commChallenge, setCommChallenge] = useState<CommunityChallenge | null>(null)
  const [commChallengeProgress, setCommChallengeProgress] = useState<UserCommunityChallengeProgress | null>(null)
  const [showStreakCalendar, setShowStreakCalendar] = useState(false)
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set())
  const [latestFavTraining, setLatestFavTraining] = useState<PlannedTraining | null>(null)
  const [recommendation, setRecommendation] = useState<DailyRecommendation | null>(null)
  // Ref for nested community challenge progress subscription (B1-4)
  const unsubCommProgressRef = useRef<(() => void) | null>(null)

  // Live user doc
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.exists()) setUserDoc({ uid: snap.id, ...snap.data() } as UserDoc)
    }, () => { /* token refresh or offline — keep last known state */ })
    return unsub
  }, [user])

  // Workout dates for streak calendar
  useEffect(() => {
    if (!user || !showStreakCalendar) return
    getDocs(query(collection(db, 'users', user.uid, 'workouts'), orderBy('createdAt', 'desc'), limit(400))).then(snap => {
      const dates = new Set<string>()
      snap.docs.forEach(d => {
        const ts = d.data().createdAt
        if (ts?.toDate) dates.add(ts.toDate().toDateString())
      })
      setWorkoutDates(dates)
    })
  }, [user, showStreakCalendar])

  // Daily recommendation — built from last 7 workouts
  useEffect(() => {
    if (!user || !userDoc) return
    getDocs(query(collection(db, 'users', user.uid, 'workouts'), orderBy('createdAt', 'desc'), limit(7))).then(snap => {
      const recent = snap.docs.map(d => d.data() as WorkoutDoc)
      const rec = buildDailyRecommendation(recent, userDoc)
      setRecommendation(rec)
    }).catch(() => {})
  }, [user, userDoc?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Latest training + community challenge from favorite community
  useEffect(() => {
    const favId = userDoc?.favoriteCommunityId
    if (!favId) { setLatestFavTraining(null); setCommChallenge(null); return }

    const unsubTraining = onSnapshot(
      query(collection(db, 'communities', favId, 'trainings'), orderBy('timeStart', 'desc'), limit(30)),
      snap => {
        if (snap.empty) { setLatestFavTraining(null); return }
        const now = new Date()
        const upcoming = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as PlannedTraining))
          .filter(t => !t.deletedAt)
          .filter(t => {
            const start = t.timeStart ? parseTrainingDateTime(t.timeStart, t.date) : null
            return start !== null && start >= now
          })
          .sort(compareTrainingDatesAsc)
        setLatestFavTraining(upcoming[0] ?? null)
      },
      () => setLatestFavTraining(null)
    )

    const unsubChallenge = onSnapshot(
      query(collection(db, 'communities', favId, 'challenges'), orderBy('endsAt', 'desc'), limit(1)),
      snap => {
        if (snap.empty) { setCommChallenge(null); return }
        const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as CommunityChallenge
        setCommChallenge(c)
        if (user) {
          if (unsubCommProgressRef.current) unsubCommProgressRef.current()
          unsubCommProgressRef.current = onSnapshot(
            doc(db, 'users', user.uid, 'community_challenge_progress', c.id),
            ps => setCommChallengeProgress(ps.exists() ? ps.data() as UserCommunityChallengeProgress : null)
          )
        }
      },
      () => setCommChallenge(null)
    )

    return () => { unsubTraining(); unsubChallenge(); unsubCommProgressRef.current?.() }
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
  const lastWorkoutDate = userDoc?.lastWorkoutDate ?? ''
  const _ld = (msAgo: number) => { const d = new Date(Date.now() - msAgo); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-') }
  const streakIsActive = lastWorkoutDate === _ld(0) || lastWorkoutDate === _ld(86400000)
  const streakJustBroke = lastWorkoutDate === _ld(172800000)
  const showStreak = streak > 0 && (streakIsActive || streakJustBroke)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('home.greeting_morning') : hour < 18 ? t('home.greeting_afternoon') : t('home.greeting_evening')

  if (!authLoading && !user) return <GuestHomePage />

  return (
    <div className="min-h-[calc(100vh-64px)] animate-page-enter" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Streak Calendar Modal */}
      {showStreakCalendar && user && (
        <StreakCalendar
          streak={streak}
          workoutDates={workoutDates}
          onClose={() => setShowStreakCalendar(false)}
        />
      )}

      <div className="max-w-lg mx-auto px-4 pt-8 pb-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-white">{t('home.title')}</h1>
          <div className="flex items-center gap-2">
            {showStreak && (
              <button
                onClick={() => setShowStreakCalendar(true)}
                className="flex items-center gap-1 px-2.5 h-8 rounded-full transition-colors"
                style={{
                  backgroundColor: streakIsActive ? '#FF6B2B18' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${streakIsActive ? '#FF6B2B30' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <span className={`text-base leading-none ${streakIsActive ? 'animate-pulse' : 'grayscale opacity-50'}`}>🔥</span>
                <span className="text-xs font-black" style={{ color: streakIsActive ? '#FF6B2B' : 'rgba(255,255,255,0.35)' }}>{streak}</span>
              </button>
            )}
            {isSuperAdmin && (
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

        {/* Greeting */}
        <div className="mb-3">
          <p className="text-white/50 text-sm">{greeting},</p>
          {authLoading || (!userDoc && !user?.displayName)
            ? <div className="h-7 w-32 rounded-lg bg-white/8 animate-pulse" />
            : <p className="text-2xl font-black text-white leading-tight">{firstName} 👋</p>
          }
        </div>


        {/* Latest training from favorite community */}
        {latestFavTraining && userDoc?.favoriteCommunityId && user && (
          <FavTrainingCard
            training={latestFavTraining}
            favId={userDoc.favoriteCommunityId}
            uid={user.uid}
            userName={displayName}
            userPhoto={userDoc?.photoUrl || user?.photoURL || null}
          />
        )}

        {/* Favorite community */}
        {userDoc?.favoriteCommunityId && (() => {
          const fav = joinedCommunities.find(c => c.id === userDoc.favoriteCommunityId)
          if (!fav) return null
          return (
            <div className="mb-5">
              <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">{t('home.fav_community')}</p>
              <Link href={`/community/${fav.id}`}>
                <div className="rounded-2xl p-4 flex items-center gap-3 border border-yellow-400/20"
                  style={{ backgroundColor: '#FFB80010' }}>
                  <div className="relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)' }}>
                    {fav.imageUrl
                      ? <Image src={fav.imageUrl} alt="" fill sizes="48px" className="object-cover rounded-xl" />
                      : <span className="text-xl font-black text-brand-green">{fav.name.charAt(0)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-white text-[15px] truncate">{fav.name}</p>
                      <Star size={12} fill="#FFB800" className="text-yellow-400 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{fav.memberCount} {t('common.members')}</p>
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
              <p className="text-[11px] font-bold text-white/40 tracking-widest">{t('home.my_communities')}</p>
              <Link href="/community" className="text-xs text-brand-green font-semibold">{t('common.see_all')}</Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {joinedCommunities.slice(0, 6).map(c => (
                <Link key={c.id} href={`/community/${c.id}`}>
                  <div className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16">
                    <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)', border: '1px solid rgba(var(--accent-rgb), 0.20)' }}>
                      {c.imageUrl
                        ? <Image src={c.imageUrl} alt="" fill sizes="48px" className="object-cover rounded-2xl" />
                        : <span className="text-lg font-black text-brand-green">{c.name.charAt(0)}</span>}
                    </div>
                    <p className="text-[10px] text-white/60 text-center leading-tight line-clamp-2">{c.name}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Daily recommendation */}
        {recommendation && userDoc?.assessmentCompleted !== false && (
          <RecommendationCard recommendation={recommendation} />
        )}

        {/* Challenges section (replaces recent activity) */}
        <div>
          <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">{t('home.challenges')}</p>
          <div className="flex flex-col gap-3">
            {challenge && (
              <Link href="/workout">
                <ChallengeCard
                  label={t('home.weekly_challenge')}
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
                  label={t('home.community_challenge')}
                  title={commChallenge.title}
                  exerciseName={commChallenge.exerciseName}
                  targetReps={commChallenge.targetReps}
                  coinsReward={commChallenge.coinsReward}
                  current={commChallengeProgress?.currentReps ?? 0}
                  completed={commChallengeProgress?.completed ?? false}


                />
              </Link>
            )}
            {!challenge && !commChallenge && (
              <div className="app-card p-6 flex flex-col items-center gap-2 text-center">
                <Trophy size={28} className="text-white/20" />
                <p className="text-sm text-white/40">{t('home.no_challenges')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Feedback CTA */}
        <Link href="/feedback" className="block mt-6">
          <div className="app-card flex items-center gap-3 cursor-pointer hover:border-brand-green/30 transition-colors">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid rgba(var(--accent-rgb), 0.15)' }}>
              <MessageSquarePlus size={18} className="text-brand-green" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-sm">{t('home.feedback_title')}</p>
              <p className="text-xs text-white/40 mt-0.5">{t('home.feedback_desc')}</p>
            </div>
            <ChevronRight size={16} className="text-white/25 flex-shrink-0" />
          </div>
        </Link>

      </div>
    </div>
  )
}

function ChallengeCard({
  label, title, exerciseName, targetReps, coinsReward, current, completed,
}: {
  label: string
  title: string
  exerciseName: string
  targetReps: number
  coinsReward: number
  current: number
  completed: boolean

}) {
  const t = useT()
  const pct = Math.min(100, Math.round((current / targetReps) * 100))
  return (
    <div className="app-card">
      <div className="flex items-center gap-2 mb-2">
        <Trophy size={14} className="text-yellow-400" />
        <p className="text-xs font-bold text-white/45 tracking-widest">{label}</p>
        {completed && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green/20 text-brand-green">{t('common.completed')}</span>}
      </div>
      <p className="font-black text-white text-sm mb-0.5">{title}</p>
      <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
        <span>{current} / {targetReps} {exerciseName}</span>
        <span>🪙 +{coinsReward}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: completed ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.55)' }} />
      </div>
    </div>
  )
}

function FavTrainingCard({ training, favId, uid, userName, userPhoto }: { training: PlannedTraining; favId: string; uid: string; userName: string; userPhoto: string | null }) {
  const t = useT()
  const [localRsvp, setLocalRsvp] = useState<'GOING' | 'MAYBE' | 'NOT_GOING' | null>(null)
  const myRsvp = localRsvp ?? (training.rsvps?.[uid] ?? null)

  const rsvpEntries = Object.entries(training.rsvps ?? {})
  const goingUids = rsvpEntries.filter(([, s]) => s === 'GOING').map(([id]) => id)
  const guestGoing = Object.entries(training.guestRsvps ?? {})
    .filter(([, g]) => g.status === 'GOING')
  const totalGoing = goingUids.length + guestGoing.length

  // Build going members from rsvpNames/rsvpPhotos (no need for full member list)
  const goingMembers = goingUids.map(id => ({
    uid: id,
    name: training.rsvpNames?.[id] ?? id.slice(0, 6),
    photoUrl: training.rsvpPhotos?.[id] ?? null,
  }))

  const PREVIEW = 3
  const previewMembers = goingMembers.slice(0, PREVIEW)

  async function setRsvp(value: 'GOING' | 'MAYBE' | 'NOT_GOING') {
    setLocalRsvp(value)
    try {
      const nameUpdate = value === 'GOING' && userName
        ? { [`rsvpNames.${uid}`]: userName }
        : { [`rsvpNames.${uid}`]: deleteField() }
      const photoUpdate = value === 'GOING' && userPhoto
        ? { [`rsvpPhotos.${uid}`]: userPhoto }
        : { [`rsvpPhotos.${uid}`]: deleteField() }
      await updateDoc(doc(db, 'communities', favId, 'trainings', training.id), {
        [`rsvps.${uid}`]: value,
        ...nameUpdate,
        ...photoUpdate,
      })
    } catch (e) {
      setLocalRsvp(null)
      console.error('[RSVP] update failed', e)
    }
  }

  const dateStr = (training.timeStart || training.date)
    ? formatTrainingDate(training.timeStart, training.date)
    : ''
  const timeStr = training.timeStart?.slice(-5) ?? ''

  return (
    <Link href={`/training/${favId}/${training.id}`} className="block">
    <div className="app-card mb-5">
      {/* Header: name + date badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="font-black text-white text-[15px] leading-tight flex-1 min-w-0">{training.name}</p>
        {dateStr && (
          <span className="flex items-center gap-1 text-[11px] text-white/45 font-semibold flex-shrink-0 whitespace-nowrap mt-0.5">
            <Calendar size={11} className="text-white/30" />
            {dateStr}
            {timeStr && <span className="text-white/30"> · {timeStr}</span>}
          </span>
        )}
      </div>

      {/* Author */}
      {training.authorName && (
        <p className="text-[10px] text-white/35 mb-2">de {training.authorName}</p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2.5">
        {training.timeEnd && (
          <span className="flex items-center gap-1 text-xs text-white/50">
            <Clock size={11} className="text-white/35" />
            {timeStr}{` – ${training.timeEnd.slice(-5)}`}
          </span>
        )}
        {training.location && (
          <span className="flex items-center gap-1 text-xs text-white/50">
            <MapPin size={11} className="text-white/35" />
            {training.location}
          </span>
        )}
      </div>

      {training.description ? (
        <p className="text-xs text-white/40 mb-3 line-clamp-2">{training.description}</p>
      ) : null}

      {/* Who's coming — overlapping avatars */}
      {totalGoing > 0 && (
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex items-center">
            {previewMembers.map((m, i) => (
              <div key={m.uid}
                className="rounded-full border-2 overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/20"
                style={{ width: 26, height: 26, borderColor: 'var(--app-surface)', marginLeft: i > 0 ? -8 : 0 }}>
                {m.photoUrl
                  ? <Image src={m.photoUrl} alt={m.name} width={26} height={26} className="object-cover" />
                  : <span className="text-white font-bold" style={{ fontSize: 10 }}>{m.name.charAt(0).toUpperCase()}</span>}
              </div>
            ))}
            {totalGoing > PREVIEW && (
              <div
                className="rounded-full border-2 flex items-center justify-center bg-white/15 flex-shrink-0"
                style={{ width: 26, height: 26, marginLeft: -8, borderColor: 'var(--app-surface)' }}>
                <span className="text-[9px] font-bold text-white/80">+{totalGoing - PREVIEW}</span>
              </div>
            )}
          </div>
          <span className="text-xs text-white/55 flex-1 min-w-0 truncate">
            {goingMembers.slice(0, 2).map(m => m.name.split(' ')[0]).join(', ')}
            {totalGoing > 2 ? ` și ${totalGoing - 2} alții merg` : ' merg'}
          </span>
        </div>
      )}
      {totalGoing === 0 && (
        <p className="text-xs text-white/25 mb-3">Nimeni nu a confirmat încă</p>
      )}

      {/* RSVP buttons */}
      <div className="flex gap-2" onClick={e => e.preventDefault()}>
        <button
          onPointerDown={() => setRsvp('GOING')}
          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors"
          style={myRsvp === 'GOING'
            ? { backgroundColor: 'var(--accent)', color: '#000' }
            : { backgroundColor: 'rgba(var(--accent-rgb), 0.09)', color: 'var(--accent)' }}
        >
          <Check size={13} /> {t('home.rsvp_going')}
        </button>
        <button
          onPointerDown={() => setRsvp('MAYBE')}
          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors"
          style={myRsvp === 'MAYBE'
            ? { backgroundColor: '#F59E0B', color: '#000' }
            : { backgroundColor: '#F59E0B18', color: '#F59E0B' }}
        >
          <HelpCircle size={13} /> {t('home.rsvp_maybe')}
        </button>
        <button
          onPointerDown={() => setRsvp('NOT_GOING')}
          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors"
          style={myRsvp === 'NOT_GOING'
            ? { backgroundColor: '#EF4444', color: '#fff' }
            : { backgroundColor: '#EF444418', color: '#EF4444' }}
        >
          <X size={13} /> {t('home.rsvp_not_going')}
        </button>
      </div>
    </div>
    </Link>
  )
}

// ── Streak Calendar ────────────────────────────────────────────────────────────

function StreakCalendar({ streak, workoutDates, onClose }: {
  streak: number
  workoutDates: Set<string>
  onClose: () => void
}) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)
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

  const calDays = t('home.calendar_days').split(',')

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-t-3xl p-5 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-base font-black text-white">{t('home.streak_title')}</p>
            <p className="text-sm font-bold" style={{ color: '#FF6B2B' }}>
              {streak === 1 ? t('home.streak_1') : t('home.streak_n', { n: streak })}
            </p>
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
          {calDays.map((d, i) => (
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
            <span className="text-xs text-white/50">{t('home.calendar_trained')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full border border-brand-green" />
            <span className="text-xs text-white/50">{t('home.calendar_today')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Recommendation Card ────────────────────────────────────────────────────────

function RecommendationCard({ recommendation }: { recommendation: DailyRecommendation }) {
  const t = useT()

  function startRecommendation() {
    const payload = {
      name: recommendation.title,
      exercises: recommendation.exercises.map(e => ({
        name: e.name,
        sets: e.suggestedSets,
        repsPerSet: e.suggestedValue,
      })),
    }
    sessionStorage.setItem('calipal_load_training', JSON.stringify(payload))
    window.location.href = '/workout'
  }

  return (
    <div className="mb-5">
      <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">{t('home.recommended_today')}</p>
      <div className="rounded-2xl p-4 border border-brand-green/20" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.03)' }}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0 pr-3">
            <p className="font-black text-white text-[15px] leading-tight">{recommendation.title}</p>
            <p className="text-xs text-white/45 mt-1 leading-relaxed">{recommendation.rationale}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Clock size={11} className="text-white/35" />
            <span className="text-xs text-white/40">~{recommendation.estimatedMinutes}min</span>
          </div>
        </div>

        {/* Exercise chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {recommendation.exercises.slice(0, 4).map(ex => (
            <span key={ex.name} className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.09)', color: 'var(--accent)' }}>
              {ex.name}
            </span>
          ))}
          {recommendation.exercises.length > 4 && (
            <span className="text-[11px] text-white/30 py-0.5">{t('home.more_exercises', { n: recommendation.exercises.length - 4 })}</span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={startRecommendation}
            className="flex-1 h-9 rounded-xl font-black text-black text-xs flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Play size={13} className="fill-black" />
            {t('home.start')}
          </button>
          <Link href="/training/programs">
            <button className="h-9 px-3 rounded-xl text-xs font-semibold border border-white/15 text-white/60 flex items-center gap-1.5">
              <BookOpen size={13} />
              {t('home.programs')}
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Guest Home Page ────────────────────────────────────────────────────────────

function GuestHomePage() {
  const t = useT()
  const [communities, setCommunities] = useState<CommunityDoc[]>([])

  useEffect(() => {
    getDocs(query(collection(db, 'communities'), orderBy('memberCount', 'desc'), limit(5)))
      .then(snap => setCommunities(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityDoc)))
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-[calc(100vh-64px)] animate-page-enter" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">{t('home.guest_title')}</h1>
          <p className="text-sm text-white/50 mt-1">{t('home.guest_subtitle')}</p>
        </div>

        {/* Map CTA */}
        <Link href="/map">
          <div className="rounded-2xl p-4 mb-4 flex items-center gap-4 border border-brand-green/20 cursor-pointer"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.04)' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.09)' }}>
              <MapPin size={22} className="text-brand-green" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-sm">{t('home.parks_map')}</p>
              <p className="text-xs text-white/50 mt-0.5">{t('home.parks_map_desc')}</p>
            </div>
            <ChevronRight size={18} className="text-white/30 flex-shrink-0" />
          </div>
        </Link>

        {/* Top communities */}
        {communities.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">{t('home.popular_communities')}</p>
            <div className="flex flex-col gap-2">
              {communities.map(c => (
                <Link key={c.id} href={`/community/${c.id}`}>
                  <div className="rounded-2xl p-3.5 flex items-center gap-3 border border-white/8 cursor-pointer"
                    style={{ backgroundColor: 'var(--app-surface)' }}>
                    {c.imageUrl
                      ? <Image src={c.imageUrl} alt="" width={40} height={40} className="rounded-xl object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/8">
                          <Users size={18} className="text-white/40" />
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{c.name}</p>
                      <p className="text-xs text-white/40">{c.memberCount ?? 0} {t('common.members')}</p>
                    </div>
                    <ChevronRight size={16} className="text-white/25 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Auth CTAs */}
        <div className="flex flex-col gap-3 mt-2">
          <Link href="/register" className="block">
            <button className="w-full h-12 rounded-2xl font-black text-black text-sm"
              style={{ backgroundColor: 'var(--accent)' }}>
              {t('home.create_account')}
            </button>
          </Link>
          <Link href="/login" className="block">
            <button className="w-full h-12 rounded-2xl font-bold text-white text-sm border border-white/15"
              style={{ backgroundColor: 'transparent' }}>
              {t('home.login')}
            </button>
          </Link>
        </div>

      </div>
    </div>
  )
}
