'use client'

import { useEffect, useRef, useState } from 'react'
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, increment, serverTimestamp, getDoc, getDocs, deleteDoc, setDoc, runTransaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { WorkoutDoc, WorkoutExercise, WorkoutSet, WeeklyChallenge, UserChallengeProgress, CommunityChallenge } from '@/types'
import { awardCoins, checkWorkoutMilestones } from '@/lib/gamification/coins'
import { Plus, Trash2, ChevronRight, Trophy, Flame, Check, X, Play, Square, Zap, Scissors, Star, Share2, Search, ImagePlus } from 'lucide-react'
import Link from 'next/link'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useWorkout } from '@/lib/context/WorkoutContext'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { uploadWorkoutPhoto } from '@/lib/firebase/storage'
import { DEFAULT_EXERCISE_CATALOGUE, getMetric, getCategory, groupByCategoryByCatalogue, type CatalogueEntry } from '@/lib/data/exercise-catalogue'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function formatDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date()
  return d.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' })
}

function totalRepsInWorkout(exercises: WorkoutExercise[]): number {
  return exercises.flatMap(e => e.sets).reduce((sum, s) => sum + (s.reps ?? 0), 0)
}

/** "Tracțiuni · 3×10 rep" — compact one-liner for an exercise. */
function exerciseOneLiner(ex: WorkoutExercise): string {
  const n = ex.sets.length
  if (n === 0) return ex.name
  const first = ex.sets[0]
  if (first.durationSeconds != null) {
    const allSame = ex.sets.every(s => s.durationSeconds === first.durationSeconds)
    return allSame
      ? `${ex.name} · ${n}×${first.durationSeconds ?? 0}s`
      : `${ex.name} · ${ex.sets.map(s => `${s.durationSeconds ?? 0}s`).join(', ')}`
  }
  const allSame = ex.sets.every(s => s.reps === first.reps)
  return allSame
    ? `${ex.name} · ${n}×${first.reps ?? 0} rep`
    : `${ex.name} · ${ex.sets.map(s => `${s.reps ?? 0}`).join(', ')} rep`
}

/** Locale-safe "yyyy-MM-dd" from a Date — avoids toDateString() timezone issues. */
function localDate(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

/** Normalize string for diacritic-insensitive search. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Screen = 'home' | 'active' | 'postdetails' | 'summary'

export default function WorkoutPage() {
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const [tab, setTab] = useState(0)

  // Workout context (persists across navigation)
  const {
    isActive, seconds, startedAt, exercises, note,
    startWorkout: ctxStart, stopWorkout: ctxStop,
    setExercises, setNote,
  } = useWorkout()

  // Local screen state — synced with context on mount
  const [screen, setScreen] = useState<Screen>(() => isActive ? 'active' : 'home')

  // Exercise catalogue from Firestore (falls back to default)
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>(DEFAULT_EXERCISE_CATALOGUE)

  // Summary after finishing
  const [lastWorkout, setLastWorkout] = useState<WorkoutDoc | null>(null)
  const [coinsEarned, setCoinsEarned] = useState(0)
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null)

  // Captured workout state (held between postdetails and summary)
  const [capturedExercises, setCapturedExercises] = useState<WorkoutExercise[]>([])
  const [capturedSeconds, setCapturedSeconds] = useState(0)
  const [summaryPhotoFile, setSummaryPhotoFile] = useState<File | null>(null)
  const [autoOpenShare, setAutoOpenShare] = useState(false)

  // History
  const [history, setHistory] = useState<WorkoutDoc[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Challenge
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null)
  const [challengeProgress, setChallengeProgress] = useState<UserChallengeProgress | null>(null)

  // Keep screen in sync if user navigates back while workout is active
  useEffect(() => {
    if (isActive && screen === 'home') setScreen('active')
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load exercise catalogue from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'exercise_catalogue'),
      snap => {
        if (!snap.empty) {
          setCatalogue(
            snap.docs
              .map(d => d.data() as CatalogueEntry)
              .sort((a, b) => a.name.localeCompare(b.name, 'ro'))
          )
        }
        // If empty, keep DEFAULT_EXERCISE_CATALOGUE as fallback
      },
      () => { /* permission denied — fall back to default catalogue */ }
    )
    return unsub
  }, [])

  // Pre-load community training if navigated from training card
  useEffect(() => {
    const saved = sessionStorage.getItem('calipal_load_training')
    if (!saved) return
    sessionStorage.removeItem('calipal_load_training')
    try {
      const { exercises: exs } = JSON.parse(saved) as {
        name: string
        exercises: { name: string; sets: number; repsPerSet: number }[]
      }
      const mapped: WorkoutExercise[] = exs
        .filter(e => e.name.trim())
        .map(e => ({
          name: e.name,
          category: getCategory(e.name, catalogue),
          sets: Array.from({ length: e.sets }, () => ({ reps: e.repsPerSet })),
        }))
      if (mapped.length > 0) {
        ctxStart(mapped)
        setScreen('active')
      }
    } catch { /* ignore malformed data */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load workout history
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'users', user.uid, 'workouts'),
      orderBy('createdAt', 'desc'),
      limit(20)
    )
    const unsub = onSnapshot(q, snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }) as WorkoutDoc))
      setHistoryLoading(false)
    })
    return unsub
  }, [user])

  // Load weekly challenge + live progress
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, 'weekly_challenges'), orderBy('endsAt', 'desc'), limit(1)),
      snap => {
        if (snap.docs.length > 0) {
          const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as WeeklyChallenge
          setChallenge(c)
          // Live progress
          return onSnapshot(
            doc(db, 'users', user.uid, 'challenge_progress', c.id),
            ps => {
              if (ps.exists()) setChallengeProgress(ps.data() as UserChallengeProgress)
              else setChallengeProgress(null)
            }
          )
        }
      }
    )
    return unsub
  }, [user])

  // ── Exercise mutations (all go through context) ───────────────────────────

  function replaceExerciseSets(ei: number, sets: WorkoutSet[]) {
    setExercises(exercises.map((ex, i) => i === ei ? { ...ex, sets } : ex))
  }

  function addExercise(name: string, initialSet: WorkoutSet) {
    const category = getCategory(name, catalogue)
    setExercises([...exercises, { name, category, sets: [initialSet] }])
  }

  function removeExercise(idx: number) {
    setExercises(exercises.filter((_, i) => i !== idx))
  }

  async function toggleFavorite(name: string) {
    if (!user) return
    const current: string[] = profile?.favoriteExercises ?? []
    const next = current.includes(name)
      ? current.filter(n => n !== name)
      : [name, ...current].slice(0, 8)
    await updateDoc(doc(db, 'users', user.uid), { favoriteExercises: next })
  }

  // ── Workout flow ──────────────────────────────────────────────────────────

  function startWorkout() {
    ctxStart([])
    setScreen('active')
  }

  // Step 1: snapshot context state, stop timer, show postdetails
  function captureWorkout() {
    if (exercises.length === 0) return
    const snap = [...exercises]
    const secs = seconds
    const startAt = startedAt ?? Date.now() - seconds * 1000
    setCapturedExercises(snap)
    setCapturedSeconds(secs)
    setWorkoutStartedAt(startAt)
    ctxStop()
    setScreen('postdetails')
  }

  // Step 2: actually save to Firestore, called from PostWorkoutDetails
  async function saveWorkout(photoFile: File | null, description: string) {
    if (!user) return
    setSummaryPhotoFile(photoFile)

    const finalExercises = capturedExercises
    const finalSeconds = capturedSeconds
    const finalNote = description
    setScreen('summary')

    const totalReps = totalRepsInWorkout(finalExercises)
    let earned = 0

    // Firestore rejects `undefined` values — strip optional set fields that weren't set
    const serializedExercises = finalExercises.map(ex => ({
      ...ex,
      sets: ex.sets.map(s => {
        const set: Record<string, number> = {}
        if (s.reps !== undefined) set.reps = s.reps
        if (s.durationSeconds !== undefined) set.durationSeconds = s.durationSeconds
        return set
      }),
    }))

    try {
      // Save workout
      await addDoc(collection(db, 'users', user.uid, 'workouts'), {
        userId: user.uid,
        exercises: serializedExercises,
        durationSeconds: finalSeconds,
        totalReps,
        coinsEarned: 10,
        note: finalNote.trim(),
        createdAt: serverTimestamp(),
      })

      // Increment totalWorkouts + streak (atomic transaction to avoid race conditions)
      const userRef = doc(db, 'users', user.uid)
      const today = localDate(new Date())
      const yesterday = localDate(new Date(Date.now() - 86400000))
      let newTotal = 0
      let newStreak = 0
      let joinedCommunityIds: string[] = []
      await runTransaction(db, async tx => {
        const userSnap = await tx.get(userRef)
        const userData = userSnap.data()
        newTotal = (userData?.totalWorkouts ?? 0) + 1
        joinedCommunityIds = userData?.joinedCommunityIds ?? []
        const lastWorkoutDate: string | undefined = userData?.lastWorkoutDate
        const currentStreak = userData?.currentStreak ?? 0
        newStreak = lastWorkoutDate === yesterday
          ? currentStreak + 1
          : lastWorkoutDate === today
            ? currentStreak
            : 1
        tx.update(userRef, {
          totalWorkouts: increment(1),
          currentStreak: newStreak,
          lastWorkoutDate: today,
        })
      })

      // Base coins
      earned += await awardCoins(user.uid, 'COMPLETE_WORKOUT')
      await checkWorkoutMilestones(user.uid, newTotal)

      // Streak milestones
      if (newStreak === 3) earned += await awardCoins(user.uid, 'STREAK_3')
      if (newStreak === 7) earned += await awardCoins(user.uid, 'STREAK_7')
      if (newStreak === 30) earned += await awardCoins(user.uid, 'STREAK_30')

      // Update weekly challenge progress
      if (challenge) {
        const exerciseReps: Record<string, number> = {}
        for (const ex of finalExercises) {
          const reps = ex.sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
          if (reps > 0) exerciseReps[ex.name] = (exerciseReps[ex.name] ?? 0) + reps
        }
        const repsForChallenge = exerciseReps[challenge.exerciseName] ?? 0
        if (repsForChallenge > 0) {
          const progressRef = doc(db, 'users', user.uid, 'challenge_progress', challenge.id)
          const current = challengeProgress?.currentReps ?? 0
          const newReps = current + repsForChallenge
          const completed = newReps >= challenge.targetReps
          const wasCompleted = challengeProgress?.completed ?? false
          await setDoc(progressRef, {
            challengeId: challenge.id,
            currentReps: newReps,
            completed,
            completedAt: completed && !wasCompleted ? serverTimestamp() : (challengeProgress?.completedAt ?? null),
          })
          // Award challenge coins on first completion
          if (completed && !wasCompleted) {
            await updateDoc(userRef, { coins: increment(challenge.coinsReward) })
            earned += challenge.coinsReward
          }
        }
      }

      // Update community challenge progress
      try {
        const joinedIds: string[] = joinedCommunityIds
        const exerciseReps: Record<string, number> = {}
        for (const ex of finalExercises) {
          const reps = ex.sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
          exerciseReps[ex.name] = (exerciseReps[ex.name] ?? 0) + reps
        }
        await Promise.all(joinedIds.map(async cid => {
          const cSnap = await getDocs(collection(db, 'communities', cid, 'challenges'))
          await Promise.all(cSnap.docs.map(async cd => {
            const ch = { id: cd.id, ...cd.data() } as CommunityChallenge
            const repsForEx = exerciseReps[ch.exerciseName] ?? 0
            if (repsForEx === 0) return
            const progressRef = doc(db, 'users', user.uid, 'community_challenge_progress', ch.id)
            const ps = await getDoc(progressRef)
            const current = ps.exists() ? (ps.data().currentReps ?? 0) : 0
            const newReps = current + repsForEx
            const completed = newReps >= ch.targetReps
            await setDoc(progressRef, {
              challengeId: ch.id,
              communityId: cid,
              currentReps: newReps,
              completed,
              completedAt: completed && !ps.data()?.completed ? serverTimestamp() : (ps.exists() ? ps.data().completedAt ?? null : null),
            })
          }))
        }))
      } catch { /* non-critical */ }

    } catch (e) {
      console.error(e)
    }

    setCoinsEarned(earned)
    setLastWorkout({
      id: '',
      userId: user.uid,
      exercises: finalExercises,
      durationSeconds: finalSeconds,
      totalReps,
      coinsEarned: earned,
      note: finalNote,
      createdAt: null,
    })
  }

  async function saveWorkoutAndShare(photoFile: File | null, description: string) {
    setAutoOpenShare(true)
    await saveWorkout(photoFile, description)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Post-workout details (Strava-style: photo + description before summary) */}
      {screen === 'postdetails' && (
        <PostWorkoutDetails
          exercises={capturedExercises}
          seconds={capturedSeconds}
          onSave={saveWorkout}
          onShare={saveWorkoutAndShare}
          hasJoinedCommunities={(profile?.joinedCommunityIds ?? []).length > 0}
        />
      )}

      {/* Summary overlay */}
      {screen === 'summary' && lastWorkout && (
        <WorkoutSummary
          workout={lastWorkout}
          coinsEarned={coinsEarned}
          onDone={() => { setScreen('home'); setTab(1); setAutoOpenShare(false) }}
          userId={user?.uid ?? ''}
          userDisplayName={profile?.displayName ?? user?.displayName ?? ''}
          joinedCommunityIds={profile?.joinedCommunityIds ?? []}
          favoriteCommunityId={profile?.favoriteCommunityId}
          startedAt={workoutStartedAt}
          photoFile={summaryPhotoFile}
          autoOpenShare={autoOpenShare}
        />
      )}

      {/* Active workout */}
      {screen === 'active' && (
        <ActiveWorkout
          exercises={exercises}
          seconds={seconds}
          note={note}
          catalogue={catalogue}
          onNoteChange={setNote}
          onReplaceExerciseSets={replaceExerciseSets}
          onAddExercise={(name, set) => addExercise(name, set)}
          onRemoveExercise={removeExercise}
          onFinish={captureWorkout}
          onCancel={() => { ctxStop(); setScreen('home') }}
          favorites={profile?.favoriteExercises ?? []}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {/* Main tabs (hidden during active) */}
      {screen === 'home' && (
        <div className="max-w-lg mx-auto px-4 pt-8 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-black text-white">Antrenament</h1>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10 mb-4">
            {['Acasă', 'Istoric'].map((t, i) => (
              <button key={i} onClick={() => setTab(i)}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/45'}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 0 && (
            <div>
              {/* Start workout CTA */}
              <button
                onClick={startWorkout}
                className="w-full h-16 rounded-2xl mb-4 flex items-center justify-center gap-3 font-black text-lg text-black"
                style={{ backgroundColor: '#1ED75F' }}
              >
                <Play size={22} className="text-black fill-black" />
                Începe antrenamentul
              </button>

              {/* ML tools */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Link href="/workout/form-check">
                  <div className="rounded-2xl p-3.5 flex items-center gap-3 border border-brand-green/25"
                    style={{ backgroundColor: '#1ED75F0D' }}>
                    <Zap size={20} className="text-brand-green flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-white">Analiză formă</p>
                      <p className="text-xs text-white/40">AI în timp real</p>
                    </div>
                  </div>
                </Link>
                <Link href="/workout/autocut">
                  <div className="rounded-2xl p-3.5 flex items-center gap-3 border border-purple-500/25"
                    style={{ backgroundColor: '#8B5CF60D' }}>
                    <Scissors size={20} className="text-purple-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-white">AutoCut Rep</p>
                      <p className="text-xs text-white/40">Taie videoul auto</p>
                    </div>
                  </div>
                </Link>
              </div>

              {/* Master Coach card */}
              {!profile?.isCoach && (
                <Link href="/workout/master-coach">
                  <div className="rounded-2xl p-4 mb-4 border border-yellow-400/20 hover:border-yellow-400/40 transition-colors" style={{ backgroundColor: '#FFB80010' }}>
                    <div className="flex items-center gap-3 mb-2">
                      <Star size={18} className="text-yellow-400 flex-shrink-0" />
                      <p className="text-sm font-bold text-white">Master Coach</p>
                      <span className="ml-auto text-xs font-bold text-yellow-400">500 🪙</span>
                    </div>
                    <p className="text-xs text-white/55 leading-relaxed">
                      Trimite un video și primește feedback personalizat de la un antrenor certificat.
                    </p>
                  </div>
                </Link>
              )}

              {/* Weekly challenge */}
              {challenge && (
                <ChallengeCard
                  challenge={challenge}
                  progress={challengeProgress}
                />
              )}

              {/* Last workout preview */}
              {history[0] && (
                <div className="rounded-2xl p-4 mt-4" style={{ backgroundColor: 'var(--app-surface)' }}>
                  <p className="text-xs font-bold text-white/40 tracking-widest mb-2">ULTIMUL ANTRENAMENT</p>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">
                      {history[0].exercises.length} exerciții
                    </span>
                    <span className="text-xs text-white/40">{formatDate(history[0].createdAt)}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-xs text-white/60">⏱ {formatDuration(history[0].durationSeconds)}</span>
                    <span className="text-xs text-white/60">🔁 {history[0].totalReps} rep</span>
                    <span className="text-xs text-white/60">🪙 +{history[0].coinsEarned}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 1 && (
            <WorkoutHistory
              history={history}
              loading={historyLoading}
              onDelete={async (wid) => {
                if (!user) return
                await deleteDoc(doc(db, 'users', user.uid, 'workouts', wid))
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Active Workout ─────────────────────────────────────────────────────────────

function ActiveWorkout({
  exercises, seconds, note, catalogue, onNoteChange,
  onReplaceExerciseSets, onAddExercise, onRemoveExercise, onFinish, onCancel,
  favorites, onToggleFavorite: _onToggleFavorite,
}: {
  exercises: WorkoutExercise[]
  seconds: number
  note: string
  catalogue: CatalogueEntry[]
  onNoteChange: (v: string) => void
  onReplaceExerciseSets: (ei: number, sets: WorkoutSet[]) => void
  onAddExercise: (name: string, set: WorkoutSet) => void
  onRemoveExercise: (idx: number) => void
  onFinish: () => void
  onCancel: () => void
  favorites: string[]
  onToggleFavorite: (name: string) => void
}) {
  const [showCancel, setShowCancel] = useState(false)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)

  // Edit existing exercise sets popup
  const [popupExIdx, setPopupExIdx] = useState<number | null>(null)
  const [popupSets, setPopupSets] = useState<WorkoutSet[]>([])

  // Search sheet
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Log new exercise popup (shown on top of search sheet)
  const [logExercise, setLogExercise] = useState<string | null>(null)
  const [logReps, setLogReps] = useState(10)
  const [logSecs, setLogSecs] = useState(30)

  const totalReps = totalRepsInWorkout(exercises)

  const debouncedQuery = useDebounce(searchQuery, 150)

  // Build filtered exercise list — diacritic-insensitive
  const filteredCatalogue = debouncedQuery.trim()
    ? catalogue.filter(e => norm(e.name).includes(norm(debouncedQuery)))
    : catalogue

  const grouped = groupByCategoryByCatalogue(filteredCatalogue)

  function openExPopup(ei: number, sets: WorkoutSet[]) {
    setPopupExIdx(ei)
    setPopupSets(sets.map(s => ({ ...s })))
  }

  function savePopup() {
    if (popupExIdx !== null) {
      onReplaceExerciseSets(popupExIdx, popupSets)
      setPopupExIdx(null)
    }
  }

  function openLogPopup(name: string) {
    const metric = getMetric(name, catalogue)
    setLogExercise(name)
    setLogReps(metric === 'reps' ? 10 : 0)
    setLogSecs(metric === 'seconds' ? 30 : 0)
  }

  function confirmLog() {
    if (!logExercise) return
    const metric = getMetric(logExercise, catalogue)
    const set: WorkoutSet = metric === 'reps'
      ? { reps: logReps }
      : { durationSeconds: logSecs }
    onAddExercise(logExercise, set)
    setLogExercise(null)
    setShowSearch(false)
    setSearchQuery('')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Timer bar — centered on desktop */}
      <div className="flex-shrink-0 border-b border-white/8">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 pt-4 pb-3">
          <button onClick={() => setShowCancel(true)} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <Square size={14} className="text-white/60" />
          </button>
          <div className="text-center">
            <p className="text-2xl font-black text-brand-green tabular-nums">{formatDuration(seconds)}</p>
            <p className="text-xs text-white/35">{totalReps} rep</p>
          </div>
          <button
            onClick={() => setShowFinishConfirm(true)}
            disabled={exercises.length === 0}
            className="h-9 px-4 rounded-full bg-brand-green text-black text-sm font-black disabled:opacity-40"
          >
            Finalizează
          </button>
        </div>
      </div>

      {/* Exercises — centered on desktop */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {exercises.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm text-white/35 mb-2">Niciun exercițiu adăugat.</p>
              <p className="text-xs text-white/25">Caută un exercițiu pentru a începe.</p>
            </div>
          )}

          {exercises.map((ex, ei) => (
            <div key={`${ex.name}-${ei}`} className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-center gap-2 mb-2">
                {/* Clickable area to edit sets */}
                <div
                  className="flex-1 flex items-center justify-between cursor-pointer select-none min-w-0"
                  onPointerDown={() => openExPopup(ei, ex.sets)}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm">{ex.name}</p>
                    <p className="text-xs text-white/40">{ex.category}</p>
                  </div>
                  <ChevronRight size={16} className="text-white/30 flex-shrink-0 ml-2" />
                </div>
                {/* Delete button */}
                <button
                  onPointerDown={() => onRemoveExercise(ei)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <p className="text-xs text-white/50">
                {ex.sets.length} set{ex.sets.length !== 1 ? 'uri' : ''} · {
                  ex.sets.map(s =>
                    s.reps != null ? `${s.reps} rep` : s.durationSeconds != null ? `${s.durationSeconds}s` : '—'
                  ).join(', ')
                }
              </p>
            </div>
          ))}

          {/* Search exercise button */}
          <button
            onClick={() => setShowSearch(true)}
            className="w-full h-11 rounded-2xl border border-dashed border-white/20 text-sm text-white/40 flex items-center justify-center gap-2 mb-3 hover:border-brand-green/40 hover:text-brand-green transition-colors"
          >
            <Search size={15} /> Caută exercițiu
          </button>

          {/* Note */}
          <textarea
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="Notițe (opțional)..."
            rows={2}
            className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/10 bg-white/5 resize-none"
          />
        </div>
      </div>

      {/* ── Finish confirm dialog ── */}
      {showFinishConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="font-bold text-white text-base mb-1">Finalizezi antrenamentul?</p>
            <p className="text-sm text-white/50 mb-5">
              {exercises.length} exerciți{exercises.length === 1 ? 'u' : 'i'} · {formatDuration(seconds)} · {totalReps} rep
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowFinishConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-white/20 text-sm text-white/80">Continuă</button>
              <button onClick={() => { setShowFinishConfirm(false); onFinish() }}
                className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold">
                Da, finalizează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel dialog ── */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="font-bold text-white text-base mb-1">Abandonezi antrenamentul?</p>
            <p className="text-sm text-white/50 mb-5">Progresul nu va fi salvat.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancel(false)} className="flex-1 h-11 rounded-xl border border-white/20 text-sm text-white/80">Continuă</button>
              <button onClick={onCancel} className="flex-1 h-11 rounded-xl bg-red-500/80 text-white text-sm font-bold">Abandonează</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit existing exercise sets popup ── */}
      {popupExIdx !== null && (() => {
        const metric = getMetric(exercises[popupExIdx].name, catalogue)
        return (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-20">
            <div className="w-full max-w-lg rounded-t-3xl pb-8" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
                <div>
                  <p className="font-black text-white text-base">{exercises[popupExIdx].name}</p>
                  <p className="text-xs text-white/40">{exercises[popupExIdx].category} · {metric === 'reps' ? 'Repetări' : 'Secunde'}</p>
                </div>
                <button onClick={() => setPopupExIdx(null)} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                  <X size={14} className="text-white/60" />
                </button>
              </div>

              {/* Column headers */}
              <div className="flex items-center px-5 pt-3 pb-1 gap-3">
                <span className="w-8 text-[10px] font-bold text-white/30 text-center">SET</span>
                {metric === 'reps' && <span className="flex-1 text-[10px] font-bold text-white/30 text-center">REPETĂRI</span>}
                {metric === 'seconds' && <span className="flex-1 text-[10px] font-bold text-white/30 text-center">SECUNDE</span>}
                <span className="w-6" />
              </div>

              <div className="max-h-72 overflow-y-auto px-5">
                {popupSets.map((set, si) => {
                  const reps = set.reps ?? 0
                  const secs = set.durationSeconds ?? 0
                  return (
                    <div key={si} className="flex items-center gap-3 py-2.5 border-b border-white/6">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: '#1ED75F22', border: '1.5px solid #1ED75F55' }}>
                        <span className="text-xs font-black text-brand-green">{si + 1}</span>
                      </div>

                      {/* Reps stepper */}
                      {metric === 'reps' && (
                        <div className="flex-1 flex items-center justify-center gap-2">
                          <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, reps: Math.max(1, (s.reps ?? 0) - 1) } : s))}
                            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:bg-white/12 active:scale-95 transition-all text-lg font-bold">−</button>
                          <span className="w-10 text-center text-xl font-black text-white tabular-nums">{reps}</span>
                          <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, reps: (s.reps ?? 0) + 1 } : s))}
                            className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center text-black hover:opacity-90 active:scale-95 transition-all text-lg font-bold">+</button>
                        </div>
                      )}

                      {/* Seconds stepper */}
                      {metric === 'seconds' && (
                        <div className="flex-1 flex items-center justify-center gap-2">
                          <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, durationSeconds: Math.max(5, (s.durationSeconds ?? 0) - 5) } : s))}
                            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:bg-white/12 active:scale-95 transition-all text-lg font-bold">−</button>
                          <span className="w-12 text-center text-xl font-black text-white tabular-nums">{secs}s</span>
                          <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, durationSeconds: (s.durationSeconds ?? 0) + 5 } : s))}
                            className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center text-black hover:opacity-90 active:scale-95 transition-all text-lg font-bold">+</button>
                        </div>
                      )}

                      <button onClick={() => setPopupSets(prev => prev.filter((_, i) => i !== si))}
                        disabled={popupSets.length <= 1}
                        className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors disabled:opacity-0">
                        <X size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>

              <button
                onClick={() => setPopupSets(prev => {
                  const last = prev[prev.length - 1] ?? {}
                  return [...prev, { reps: last.reps, durationSeconds: last.durationSeconds }]
                })}
                className="flex items-center gap-1.5 text-xs text-brand-green font-semibold mx-5 mt-3">
                <Plus size={13} /> Adaugă set
              </button>
              <div className="px-5 mt-4">
                <button onClick={savePopup} className="w-full h-12 rounded-2xl bg-brand-green text-black text-sm font-black">
                  Salvează
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Search sheet (fixed to cover full viewport) ── */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-30">
          <div className="w-full max-w-lg rounded-t-3xl flex flex-col" style={{ backgroundColor: 'var(--app-surface)', maxHeight: '88vh' }}>
            {/* Handle + header */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
              <p className="text-base font-black text-white">Caută exercițiu</p>
              <button onClick={() => { setShowSearch(false); setSearchQuery('') }}
                className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                <X size={14} className="text-white/60" />
              </button>
            </div>

            {/* Search input */}
            <div className="px-5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2 h-10 rounded-xl px-3 border border-white/12 bg-white/7">
                <Search size={14} className="text-white/35 flex-shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ex. Tracțiuni, Flotări..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}><X size={13} className="text-white/35" /></button>
                )}
              </div>
            </div>

            {/* Exercise list — scrollable, goes above everything */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {/* Favorites row (when not searching) */}
              {!searchQuery.trim() && favorites.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2">⭐ FAVORITE</p>
                  <div className="flex flex-col gap-1.5">
                    {favorites.map(name => {
                      const metric = getMetric(name, catalogue)
                      return (
                        <button key={name}
                          onClick={() => openLogPopup(name)}
                          className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left bg-white/5 border border-white/8 text-white/80 hover:bg-white/10 active:scale-[0.98] transition-all">
                          <span>{name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/40">
                              {metric === 'reps' ? 'rep' : 'sec'}
                            </span>
                            <ChevronRight size={14} className="text-white/30" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {grouped.map(group => (
                <div key={group.category} className="mb-4">
                  {group.category && (
                    <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 uppercase">{group.category}</p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {group.exercises.map(({ name, metric }) => (
                      <button key={name}
                        onClick={() => openLogPopup(name)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left bg-white/5 border border-white/8 text-white/80 hover:bg-white/10 active:scale-[0.98] transition-all">
                        <span>{name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/40">
                            {metric === 'reps' ? 'rep' : 'sec'}
                          </span>
                          <ChevronRight size={14} className="text-white/30" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Log exercise popup (reps or seconds only) ── */}
      {logExercise !== null && (() => {
        const metric = getMetric(logExercise, catalogue)
        return (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-40">
            <div className="w-full max-w-lg rounded-t-3xl pb-8" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
                <div>
                  <p className="font-black text-white text-base">{logExercise}</p>
                  <p className="text-xs text-white/40">{getCategory(logExercise, catalogue)} · {metric === 'reps' ? 'Repetări' : 'Secunde'}</p>
                </div>
                <button onClick={() => setLogExercise(null)}
                  className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                  <X size={14} className="text-white/60" />
                </button>
              </div>

              <div className="px-5 pt-6 pb-2">
                <p className="text-[10px] font-bold text-white/40 tracking-widest mb-5 text-center">CÂT AI FĂCUT?</p>

                {/* Reps input */}
                {metric === 'reps' && (
                  <div className="mb-6">
                    <p className="text-xs text-white/50 text-center mb-3">Repetări</p>
                    <div className="flex items-center justify-center gap-6">
                      <button
                        onClick={() => setLogReps(r => Math.max(1, r - 1))}
                        className="w-14 h-14 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-3xl font-bold active:scale-95 transition-transform"
                      >−</button>
                      <span className="w-20 text-center text-5xl font-black text-white tabular-nums">{logReps}</span>
                      <button
                        onClick={() => setLogReps(r => r + 1)}
                        className="w-14 h-14 rounded-full bg-brand-green flex items-center justify-center text-black text-3xl font-bold active:scale-95 transition-transform"
                      >+</button>
                    </div>
                  </div>
                )}

                {/* Seconds input */}
                {metric === 'seconds' && (
                  <div className="mb-6">
                    <p className="text-xs text-white/50 text-center mb-3">Secunde</p>
                    <div className="flex items-center justify-center gap-6">
                      <button
                        onClick={() => setLogSecs(s => Math.max(5, s - 5))}
                        className="w-14 h-14 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-3xl font-bold active:scale-95 transition-transform"
                      >−</button>
                      <span className="w-20 text-center text-5xl font-black text-white tabular-nums">
                        {logSecs}<span className="text-2xl text-white/40">s</span>
                      </span>
                      <button
                        onClick={() => setLogSecs(s => s + 5)}
                        className="w-14 h-14 rounded-full bg-brand-green flex items-center justify-center text-black text-3xl font-bold active:scale-95 transition-transform"
                      >+</button>
                    </div>
                  </div>
                )}

                <button
                  onClick={confirmLog}
                  className="w-full rounded-2xl bg-brand-green text-black font-black text-base flex items-center justify-center gap-2"
                  style={{ height: 52 }}
                >
                  <Check size={18} /> Adaugă exercițiu
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Post-Workout Details (Strava-style) ──────────────────────────────────────

function PostWorkoutDetails({
  exercises,
  seconds,
  onSave,
  onShare,
  hasJoinedCommunities,
}: {
  exercises: WorkoutExercise[]
  seconds: number
  onSave: (photoFile: File | null, description: string) => void
  onShare: (photoFile: File | null, description: string) => void
  hasJoinedCommunities: boolean
}) {
  const [description, setDescription] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="flex-1 max-w-sm mx-auto w-full px-4 pt-10 pb-8 flex flex-col">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-full bg-brand-green flex items-center justify-center mx-auto mb-4">
            <Check size={40} className="text-black" strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-black text-white mb-1">Bravo! 💪</h2>
          <p className="text-sm text-white/50">
            {formatDuration(seconds)} · {totalRepsInWorkout(exercises)} rep · {exercises.length} exerciți{exercises.length === 1 ? 'u' : 'i'}
          </p>
        </div>

        {/* Photo picker */}
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        {photoPreview ? (
          <div className="relative rounded-2xl overflow-hidden mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="" className="w-full object-cover max-h-52" />
            <button
              onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
            >
              <X size={13} className="text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => photoInputRef.current?.click()}
            className="w-full h-28 rounded-2xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 text-white/35 mb-3 hover:border-brand-green/40 hover:text-brand-green/60 transition-colors"
          >
            <ImagePlus size={22} />
            <span className="text-sm">Adaugă o fotografie</span>
            <span className="text-xs opacity-60">opțional</span>
          </button>
        )}

        {/* Description */}
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Cum a fost antrenamentul? (opțional)"
          rows={3}
          className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/10 bg-white/5 resize-none mb-4"
        />

        {/* Actions */}
        <button
          onClick={() => onSave(photoFile, description)}
          className="w-full rounded-full font-black text-black bg-brand-green mb-3"
          style={{ height: 52 }}
        >
          Salvează antrenamentul
        </button>
        {hasJoinedCommunities && (
          <button
            onClick={() => onShare(photoFile, description)}
            className="w-full rounded-full font-bold border border-white/20 text-white/70 flex items-center justify-center gap-2"
            style={{ height: 48 }}
          >
            <Share2 size={16} /> Postează în comunitate
          </button>
        )}
      </div>
    </div>
  )
}

// ── Workout Summary ────────────────────────────────────────────────────────────

function WorkoutSummary({
  workout, coinsEarned, onDone, userId, userDisplayName, joinedCommunityIds, favoriteCommunityId, startedAt,
  photoFile, autoOpenShare,
}: {
  workout: WorkoutDoc
  coinsEarned: number
  onDone: () => void
  userId: string
  userDisplayName: string
  joinedCommunityIds: string[]
  favoriteCommunityId?: string | null
  startedAt: number | null
  photoFile?: File | null
  autoOpenShare?: boolean
}) {
  const description = workout.note
  const [showShare, setShowShare] = useState(false)
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  const [selectedCommId, setSelectedCommId] = useState(favoriteCommunityId ?? '')
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)
  const [loadingComms, setLoadingComms] = useState(false)
  const [, setUploadingPhoto] = useState(false)

  // Auto-open share sheet when coming from "Postează în comunitate"
  useEffect(() => {
    if (autoOpenShare) openShare()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function openShare() {
    if (shared) return
    setShowShare(true)
    if (communities.length > 0 || joinedCommunityIds.length === 0) return
    setLoadingComms(true)
    try {
      const docs = await Promise.all(
        joinedCommunityIds.slice(0, 10).map(id => getDoc(doc(db, 'communities', id)))
      )
      const loaded = docs.filter(d => d.exists()).map(d => ({ id: d.id, name: d.data()!.name as string }))
      setCommunities(loaded)
      if (!selectedCommId && loaded.length > 0) setSelectedCommId(loaded[0].id)
    } finally {
      setLoadingComms(false)
    }
  }

  async function handleShare() {
    if (!selectedCommId || sharing) return
    setSharing(true)
    try {
      // Upload photo if one was selected
      let photoUrl: string | null = null
      if (photoFile) {
        setUploadingPhoto(true)
        photoUrl = await uploadWorkoutPhoto(userId, Date.now(), photoFile)
        setUploadingPhoto(false)
      }

      const memberSnap = await getDoc(doc(db, 'communities', selectedCommId, 'members', userId))
      const role = memberSnap.exists() ? memberSnap.data().role : 'MEMBER'
      const descLine = description.trim() ? `\n${description.trim()}` : ''
      const content = [
        '💪 Antrenament finalizat!' + descLine,
        `⏱ ${formatDuration(workout.durationSeconds)} · 🔁 ${workout.totalReps} rep`,
        '',
        ...workout.exercises.map(e => exerciseOneLiner(e)),
      ].join('\n')
      await addDoc(collection(db, 'communities', selectedCommId, 'posts'), {
        authorId: userId,
        authorName: userDisplayName,
        authorRole: role,
        content,
        likesCount: 0,
        commentsCount: 0,
        ...(photoUrl && { photoUrl }),
        createdAt: serverTimestamp(),
      })
      setShared(true)
      setShowShare(false)
    } finally {
      setSharing(false)
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="flex-1 max-w-sm mx-auto w-full px-4 py-8 flex flex-col">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-full bg-brand-green flex items-center justify-center mx-auto mb-4">
            <Check size={40} className="text-black" strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-black text-white mb-1">Bravo! 💪</h2>
          <p className="text-white/50 text-sm">Antrenament finalizat</p>
        </div>

        {/* Stats row */}
        <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xl font-black text-white">{formatDuration(workout.durationSeconds)}</p>
              <p className="text-xs text-white/40 mt-0.5">Durată</p>
            </div>
            <div>
              <p className="text-xl font-black text-white">{workout.totalReps}</p>
              <p className="text-xs text-white/40 mt-0.5">Repetări</p>
            </div>
            <div>
              <p className="text-xl font-black text-brand-green">+{coinsEarned}</p>
              <p className="text-xs text-white/40 mt-0.5">Monede 🪙</p>
            </div>
          </div>
          {startedAt && (
            <div className="mt-3 pt-3 border-t border-white/8 flex items-center justify-center gap-1.5">
              <span className="text-xs text-white/35">
                🕐 {new Date(startedAt).toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(startedAt + workout.durationSeconds * 1000).toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>

        {/* Exercise list — compact N×M format */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          {workout.exercises.map((ex, ei) => (
            <div key={ei} className={`px-4 py-2.5 ${ei > 0 ? 'border-t border-white/8' : ''}`}>
              <p className="text-sm text-white/85">{exerciseOneLiner(ex)}</p>
            </div>
          ))}
        </div>

        {/* Description (read-only, from postdetails) */}
        {description.trim() ? (
          <p className="text-sm text-white/60 italic px-1 mb-3">&ldquo;{description.trim()}&rdquo;</p>
        ) : null}

        {/* Photo from postdetails */}
        {photoFile && (
          <div className="relative rounded-2xl overflow-hidden mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(photoFile)} alt="" className="w-full object-cover max-h-52" />
          </div>
        )}

        {/* Share */}
        {joinedCommunityIds.length > 0 && !shared && (
          <button
            onClick={openShare}
            className="w-full h-12 rounded-full font-bold border border-white/20 text-white/70 mb-3 flex items-center justify-center gap-2"
          >
            <Share2 size={16} /> Postează în comunitate
          </button>
        )}
        {shared && (
          <p className="text-xs text-brand-green text-center mb-3">✓ Postat în comunitate!</p>
        )}

        <button
          onClick={onDone}
          className="w-full rounded-full font-bold text-black bg-brand-green"
          style={{ height: 52 }}
        >
          Înapoi la antrenamente
        </button>
      </div>

      {showShare && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-t-3xl px-5 pt-4 pb-8" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-black text-white">Postează în comunitate</p>
              <button onClick={() => setShowShare(false)} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
                <X size={13} className="text-white/60" />
              </button>
            </div>
            {loadingComms ? (
              <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
            ) : communities.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-4">Nu ești în nicio comunitate activă.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-4">
                {communities.map(c => (
                  <button key={c.id}
                    onClick={() => setSelectedCommId(c.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                      selectedCommId === c.id ? 'border-brand-green/50 bg-brand-green/10' : 'border-white/10 bg-white/4'
                    }`}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: selectedCommId === c.id ? '#1ED75F' : '#ffffff30' }} />
                    <span className="text-sm font-bold text-white">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
            {!loadingComms && communities.length > 0 && (
              <button onClick={handleShare} disabled={sharing || !selectedCommId}
                className="w-full h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
                {sharing ? '...' : 'Postează'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Challenge Card ─────────────────────────────────────────────────────────────

function ChallengeCard({
  challenge, progress,
}: {
  challenge: WeeklyChallenge
  progress: UserChallengeProgress | null
}) {
  const current = progress?.currentReps ?? 0
  const pct = Math.min(100, Math.round((current / challenge.targetReps) * 100))
  const done = progress?.completed ?? false

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-yellow-400" />
          <p className="text-xs font-bold text-white/50 tracking-widest">PROVOCARE SĂPTĂMÂNALĂ</p>
        </div>
        {done && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green/20 text-brand-green">FINALIZAT ✓</span>}
      </div>
      <p className="font-black text-white text-base mb-0.5">{challenge.title}</p>
      <p className="text-xs text-white/50 mb-3">{challenge.description}</p>
      <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
        <span>{current} / {challenge.targetReps} {challenge.exerciseName}</span>
        <span>🪙 +{challenge.coinsReward}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: done ? '#1ED75F' : '#3B82F6' }}
        />
      </div>
    </div>
  )
}

// ── Workout History ────────────────────────────────────────────────────────────

function computePRs(history: WorkoutDoc[]): Record<string, number> {
  const prs: Record<string, number> = {}
  for (const w of history) {
    for (const ex of w.exercises) {
      const maxReps = Math.max(...ex.sets.map(s => s.reps ?? 0))
      if (maxReps > (prs[ex.name] ?? 0)) prs[ex.name] = maxReps
    }
  }
  return prs
}

function WorkoutHistory({ history, loading, onDelete }: {
  history: WorkoutDoc[]
  loading: boolean
  onDelete: (id: string) => Promise<void>
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="h-4 rounded-lg bg-white/8 animate-pulse mb-2 w-3/4" />
            <div className="h-3 rounded-lg bg-white/8 animate-pulse mb-3 w-1/3" />
            <div className="flex gap-4">
              <div className="h-3 rounded-lg bg-white/8 animate-pulse w-16" />
              <div className="h-3 rounded-lg bg-white/8 animate-pulse w-16" />
              <div className="h-3 rounded-lg bg-white/8 animate-pulse w-12" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (history.length === 0) {
    return (
      <div className="text-center py-16">
        <Flame size={48} className="text-white/15 mx-auto mb-4" />
        <p className="text-white/50 font-semibold text-sm mb-1">Niciun antrenament înregistrat</p>
        <p className="text-white/30 text-xs">Apasă &ldquo;Începe antrenamentul&rdquo; pentru primul tău workout!</p>
      </div>
    )
  }

  const allTimePRs = computePRs(history)

  async function handleDelete(id: string) {
    setDeletingId(id)
    try { await onDelete(id) } finally { setDeletingId(null) }
  }

  return (
    <div className="flex flex-col gap-2">
      {history.map((w, wi) => {
        const prsBefore = computePRs(history.slice(wi + 1))
        const newPRs = w.exercises
          .map(ex => {
            const best = Math.max(...ex.sets.map(s => s.reps ?? 0))
            const isPR = best > 0 && best >= (allTimePRs[ex.name] ?? 0) && best > (prsBefore[ex.name] ?? 0)
            return isPR ? { name: ex.name, reps: best } : null
          })
          .filter(Boolean) as { name: string; reps: number }[]

        return (
          <div key={w.id} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-sm font-bold text-white truncate">{w.exercises.map(e => e.name).join(', ')}</p>
                <span className="text-xs text-white/35">{formatDate(w.createdAt)}</span>
              </div>
              <button
                onClick={() => handleDelete(w.id)}
                disabled={deletingId === w.id}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
              >
                {deletingId === w.id
                  ? <div className="w-3 h-3 border border-white/30 border-t-transparent rounded-full animate-spin" />
                  : <Trash2 size={13} />}
              </button>
            </div>
            <div className="flex gap-4 mb-1.5">
              <span className="text-xs text-white/50">⏱ {formatDuration(w.durationSeconds)}</span>
              <span className="text-xs text-white/50">🔁 {w.totalReps} rep</span>
              <span className="text-xs text-white/50">🪙 +{w.coinsEarned}</span>
            </div>
            {newPRs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {newPRs.map(pr => (
                  <span key={pr.name}
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#FFB80020', color: '#FFB800', border: '1px solid #FFB80040' }}>
                    🏆 PR {pr.name} · {pr.reps} rep
                  </span>
                ))}
              </div>
            )}
            {w.note ? <p className="text-xs text-white/40 mt-1.5 italic">&ldquo;{w.note}&rdquo;</p> : null}
          </div>
        )
      })}
    </div>
  )
}
