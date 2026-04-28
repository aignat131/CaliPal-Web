'use client'

import { useEffect, useRef, useState } from 'react'
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, increment, serverTimestamp, getDoc, getDocs, deleteDoc, setDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { WorkoutDoc, WorkoutExercise, WorkoutSet, WeeklyChallenge, UserChallengeProgress, CommunityChallenge } from '@/types'
import { awardCoins, checkWorkoutMilestones } from '@/lib/coins'
import { Plus, Trash2, ChevronRight, Trophy, Flame, Check, X, Play, Square, Zap, Scissors, Star, Share2, Search } from 'lucide-react'
import Link from 'next/link'
import { useMyProfile } from '@/lib/hooks/useMyProfile'

// ── Exercise catalogue ────────────────────────────────────────────────────────

const EXERCISE_CATALOGUE: { category: string; exercises: string[] }[] = [
  {
    category: 'Trageri',
    exercises: ['Tracțiuni', 'Chin-up', 'Australian Pull-up', 'Chest-to-Bar', 'Muscle-Up', 'One-Arm Pull-up'],
  },
  {
    category: 'Împingeri',
    exercises: ['Flotări', 'Diamond Push-up', 'Pike Push-up', 'Handstand Push-up', 'One-Arm Push-up', 'Dips', 'Ring Dip'],
  },
  {
    category: 'Core',
    exercises: ['L-Sit', 'Dragon Flag', 'Hollow Body Hold', 'Arch Body Hold', 'Leg Raises', 'Plank'],
  },
  {
    category: 'Picioare',
    exercises: ['Squaturi', 'Lunges', 'Pistol Squat', 'Box Jump', 'Calf Raise'],
  },
  {
    category: 'Statice',
    exercises: ['Front Lever', 'Back Lever', 'Planche', 'Tuck Planche', 'Handstand Hold', 'Dead Hang'],
  },
  {
    category: 'Cardio',
    exercises: ['Burpees', 'Mountain Climbers', 'Jumping Jacks', 'Sprint 100m'],
  },
]

function getCategoryForExercise(name: string): string {
  for (const { category, exercises } of EXERCISE_CATALOGUE) {
    if (exercises.includes(name)) return category
  }
  return 'Altele'
}

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

// ── Main Page ─────────────────────────────────────────────────────────────────

type Screen = 'home' | 'picker' | 'active' | 'summary'

export default function WorkoutPage() {
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const [tab, setTab] = useState(0)

  // Workout state
  const [screen, setScreen] = useState<Screen>('home')
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [seconds, setSeconds] = useState(0)
  const [note, setNote] = useState('')
  const [lastWorkout, setLastWorkout] = useState<WorkoutDoc | null>(null)
  const [coinsEarned, setCoinsEarned] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // History
  const [history, setHistory] = useState<WorkoutDoc[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Coach form check request
  const [showFormCheckRequest, setShowFormCheckRequest] = useState(false)
  const [fcExercise, setFcExercise] = useState('Tracțiuni')
  const [fcNotes, setFcNotes] = useState('')
  const [fcSubmitting, setFcSubmitting] = useState(false)
  const [fcDone, setFcDone] = useState(false)

  // Challenge
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null)
  const [challengeProgress, setChallengeProgress] = useState<UserChallengeProgress | null>(null)


  // Pre-load community training if navigated from training card
  useEffect(() => {
    const saved = sessionStorage.getItem('calipal_load_training')
    if (!saved) return
    try {
      const { exercises: exs } = JSON.parse(saved) as {
        name: string
        exercises: { name: string; sets: number; repsPerSet: number }[]
      }
      sessionStorage.removeItem('calipal_load_training')
      const mapped: WorkoutExercise[] = exs
        .filter(e => e.name.trim())
        .map(e => ({
          name: e.name,
          category: getCategoryForExercise(e.name),
          sets: Array.from({ length: e.sets }, () => ({ reps: e.repsPerSet })),
        }))
      if (mapped.length > 0) {
        setExercises(mapped)
        setSeconds(0)
        setScreen('active')
      }
    } catch { /* ignore malformed data */ }
  }, [])

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

  // Load weekly challenge
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, 'weekly_challenges'), orderBy('endsAt', 'desc'), limit(1)),
      snap => {
        if (snap.docs.length > 0) {
          const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as WeeklyChallenge
          setChallenge(c)
          // Load progress
          getDoc(doc(db, 'users', user.uid, 'challenge_progress', c.id)).then(ps => {
            if (ps.exists()) setChallengeProgress(ps.data() as UserChallengeProgress)
          })
        }
      }
    )
    return unsub
  }, [user])

  // Timer
  useEffect(() => {
    if (screen === 'active') {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [screen])

  async function submitFormCheckRequest() {
    if (!user || fcSubmitting) return
    const coins = profile?.coins ?? 0
    if (coins < 30) return
    setFcSubmitting(true)
    try {
      await addDoc(collection(db, 'form_check_requests'), {
        userId: user.uid,
        userName: profile?.displayName || user.displayName || '',
        exerciseName: fcExercise,
        notes: fcNotes.trim(),
        status: 'PENDING',
        coinsSpent: 30,
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'users', user.uid), { coins: increment(-30) })
      setFcDone(true)
    } finally { setFcSubmitting(false) }
  }

  function startWorkout() {
    setExercises([])
    setSeconds(0)
    setNote('')
    setScreen('active')
  }

  function replaceExerciseSets(ei: number, sets: WorkoutSet[]) {
    setExercises(prev => prev.map((ex, i) => i === ei ? { ...ex, sets } : ex))
  }

  function addExercise(name: string, initialSet: WorkoutSet) {
    const category = getCategoryForExercise(name)
    setExercises(prev => [...prev, { name, category, sets: [initialSet] }])
  }

  function removeExercise(idx: number) {
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }

  function addSet(exerciseIdx: number) {
    setExercises(prev => prev.map((ex, i) =>
      i === exerciseIdx ? { ...ex, sets: [...ex.sets, { reps: 10 }] } : ex
    ))
  }

  function removeSet(exerciseIdx: number, setIdx: number) {
    setExercises(prev => prev.map((ex, i) =>
      i === exerciseIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex
    ))
  }

  function updateSet(exerciseIdx: number, setIdx: number, field: 'reps' | 'durationSeconds', value: number) {
    setExercises(prev => prev.map((ex, i) =>
      i === exerciseIdx
        ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: value } : s) }
        : ex
    ))
  }

  async function toggleFavorite(name: string) {
    if (!user) return
    const current: string[] = profile?.favoriteExercises ?? []
    const next = current.includes(name)
      ? current.filter(n => n !== name)
      : [name, ...current].slice(0, 8)
    await updateDoc(doc(db, 'users', user.uid), { favoriteExercises: next })
  }

  async function finishWorkout() {
    if (!user || exercises.length === 0) return
    setScreen('summary')
    if (timerRef.current) clearInterval(timerRef.current)

    const totalReps = totalRepsInWorkout(exercises)
    let earned = 0

    try {
      // Save workout
      await addDoc(collection(db, 'users', user.uid, 'workouts'), {
        userId: user.uid,
        exercises,
        durationSeconds: seconds,
        totalReps,
        coinsEarned: 10,
        note: note.trim(),
        createdAt: serverTimestamp(),
      })

      // Increment totalWorkouts + streak
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)
      const userData = userSnap.data()
      const newTotal = (userData?.totalWorkouts ?? 0) + 1

      // Check last workout date for streak
      const lastWorkoutDate: string | undefined = userData?.lastWorkoutDate
      const today = new Date().toDateString()
      const yesterday = new Date(Date.now() - 86400000).toDateString()
      const currentStreak = userData?.currentStreak ?? 0
      const newStreak = lastWorkoutDate === yesterday
        ? currentStreak + 1
        : lastWorkoutDate === today
          ? currentStreak
          : 1

      await updateDoc(userRef, {
        totalWorkouts: increment(1),
        currentStreak: newStreak,
        lastWorkoutDate: today,
      })

      // Coins
      earned += await awardCoins(user.uid, 'COMPLETE_WORKOUT')
      await checkWorkoutMilestones(user.uid, newTotal)

      // Streak milestones
      if (newStreak === 3) earned += await awardCoins(user.uid, 'STREAK_3')
      if (newStreak === 7) earned += await awardCoins(user.uid, 'STREAK_7')
      if (newStreak === 30) earned += await awardCoins(user.uid, 'STREAK_30')

      // Update community challenge progress
      try {
        const joinedIds: string[] = userData?.joinedCommunityIds ?? []
        const exerciseReps: Record<string, number> = {}
        for (const ex of exercises) {
          const reps = ex.sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
          exerciseReps[ex.name] = (exerciseReps[ex.name] ?? 0) + reps
        }
        await Promise.all(joinedIds.map(async cid => {
          const cSnap = await getDocs(collection(db, 'communities', cid, 'challenges'))
          await Promise.all(cSnap.docs.map(async cd => {
            const challenge = { id: cd.id, ...cd.data() } as CommunityChallenge
            const repsForEx = exerciseReps[challenge.exerciseName] ?? 0
            if (repsForEx === 0) return
            const progressRef = doc(db, 'users', user.uid, 'community_challenge_progress', challenge.id)
            const ps = await getDoc(progressRef)
            const current = ps.exists() ? (ps.data().currentReps ?? 0) : 0
            const newReps = current + repsForEx
            const completed = newReps >= challenge.targetReps
            await setDoc(progressRef, {
              challengeId: challenge.id,
              communityId: cid,
              currentReps: newReps,
              completed,
              completedAt: completed && !ps.data()?.completed ? serverTimestamp() : (ps.exists() ? ps.data().completedAt ?? null : null),
            })
          }))
        }))
      } catch { /* non-critical — community challenge progress update failed silently */ }

    } catch (e) {
      console.error(e)
    }

    setCoinsEarned(earned)
    setLastWorkout({
      id: '',
      userId: user.uid,
      exercises,
      durationSeconds: seconds,
      totalReps,
      coinsEarned: earned,
      note,
      createdAt: null,
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Form check request modal */}
      {showFormCheckRequest && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 pb-safe">
          <div className="w-full max-w-sm rounded-t-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            {fcDone ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="w-14 h-14 rounded-full bg-brand-green flex items-center justify-center mb-3">
                  <Check size={28} className="text-black" />
                </div>
                <p className="font-bold text-white text-base mb-1">Cerere trimisă!</p>
                <p className="text-sm text-white/50 mb-5">Un antrenor va analiza forma ta și va trimite feedback în curând.</p>
                <button onClick={() => setShowFormCheckRequest(false)}
                  className="w-full h-11 rounded-xl bg-brand-green text-black font-bold">OK</button>
              </div>
            ) : (
              <>
                <p className="text-base font-black text-white mb-1">Analiză formă — Master Coach</p>
                <p className="text-xs text-white/40 mb-4">Cost: 30 monede · Sold curent: {profile?.coins ?? 0} 🪙</p>

                <div className="mb-3">
                  <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1.5">EXERCIȚIU</p>
                  <div className="flex gap-2 flex-wrap">
                    {['Tracțiuni', 'Flotări', 'Squaturi'].map(ex => (
                      <button key={ex} onClick={() => setFcExercise(ex)}
                        className={`h-8 px-3 rounded-full text-xs font-bold transition-colors ${
                          fcExercise === ex ? 'bg-brand-green text-black' : 'border border-white/20 text-white/60'
                        }`}>{ex}</button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1.5">NOTE (opțional)</p>
                  <textarea
                    value={fcNotes}
                    onChange={e => setFcNotes(e.target.value)}
                    placeholder="Descrie ce vrei să îmbunătățești..."
                    rows={3}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/5 resize-none"
                  />
                </div>

                {(profile?.coins ?? 0) < 30 && (
                  <p className="text-xs text-red-400 mb-3">Monede insuficiente. Completează antrenamente pentru a câștiga monede.</p>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setShowFormCheckRequest(false)}
                    className="flex-1 h-11 rounded-xl border border-white/20 text-sm text-white/70">Anulează</button>
                  <button
                    onClick={submitFormCheckRequest}
                    disabled={fcSubmitting || (profile?.coins ?? 0) < 30}
                    className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40">
                    {fcSubmitting ? '...' : 'Confirmă (30 🪙)'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Summary overlay */}
      {screen === 'summary' && lastWorkout && (
        <WorkoutSummary
          workout={lastWorkout}
          coinsEarned={coinsEarned}
          onDone={() => { setScreen('home'); setTab(1) }}
          userId={user?.uid ?? ''}
          userDisplayName={profile?.displayName ?? user?.displayName ?? ''}
          joinedCommunityIds={profile?.joinedCommunityIds ?? []}
          favoriteCommunityId={profile?.favoriteCommunityId}
        />
      )}

      {/* Active workout */}
      {screen === 'active' && (
        <ActiveWorkout
          exercises={exercises}
          seconds={seconds}
          note={note}
          onNoteChange={setNote}
          onReplaceExerciseSets={replaceExerciseSets}
          onAddExercise={(name, set) => addExercise(name, set)}
          onFinish={finishWorkout}
          onCancel={() => { setScreen('home'); setSeconds(0) }}
          favorites={profile?.favoriteExercises ?? []}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {/* Main tabs (hidden during active/picker) */}
      {(screen === 'home') && (
        <div className="max-w-lg mx-auto px-4 pt-5 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-black text-white">Antrenament</h1>
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
                <div className="rounded-2xl p-4 mb-4 border border-yellow-400/20" style={{ backgroundColor: '#FFB80010' }}>
                  <div className="flex items-center gap-3 mb-2">
                    <Star size={18} className="text-yellow-400 flex-shrink-0" />
                    <p className="text-sm font-bold text-white">Master Coach</p>
                    <span className="ml-auto text-xs font-bold text-yellow-400">30 🪙</span>
                  </div>
                  <p className="text-xs text-white/55 mb-3 leading-relaxed">
                    Trimite un video cu un set și primește feedback personalizat de la un antrenor certificat.
                  </p>
                  <button
                    onClick={() => { setShowFormCheckRequest(true); setFcDone(false) }}
                    className="w-full h-9 rounded-xl text-xs font-bold border border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                    Solicită analiză
                  </button>
                </div>
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
  exercises, seconds, note, onNoteChange,
  onReplaceExerciseSets, onAddExercise, onFinish, onCancel,
  favorites, onToggleFavorite,
}: {
  exercises: WorkoutExercise[]
  seconds: number
  note: string
  onNoteChange: (v: string) => void
  onReplaceExerciseSets: (ei: number, sets: WorkoutSet[]) => void
  onAddExercise: (name: string, set: WorkoutSet) => void
  onFinish: () => void
  onCancel: () => void
  favorites: string[]
  onToggleFavorite: (name: string) => void
}) {
  const [showCancel, setShowCancel] = useState(false)

  // Edit existing exercise sets popup
  const [popupExIdx, setPopupExIdx] = useState<number | null>(null)
  const [popupSets, setPopupSets] = useState<WorkoutSet[]>([])

  // Search sheet
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Log new exercise popup (shown on top of search sheet)
  const [logExercise, setLogExercise] = useState<string | null>(null)
  const [logReps, setLogReps] = useState(10)
  const [logSecs, setLogSecs] = useState(0)

  const totalReps = totalRepsInWorkout(exercises)

  // Build filtered exercise list for search sheet
  const allExercises = EXERCISE_CATALOGUE.flatMap(cat =>
    cat.exercises.map(name => ({ name, category: cat.category }))
  )
  const filteredExercises = searchQuery.trim()
    ? allExercises.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allExercises

  // Group filtered results by category (or show flat when searching)
  const grouped: { category: string; exercises: { name: string; category: string }[] }[] = []
  if (searchQuery.trim()) {
    grouped.push({ category: '', exercises: filteredExercises })
  } else {
    EXERCISE_CATALOGUE.forEach(cat => {
      const exs = filteredExercises.filter(e => e.category === cat.category)
      if (exs.length > 0) grouped.push({ category: cat.category, exercises: exs })
    })
  }

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
    setLogExercise(name)
    setLogReps(10)
    setLogSecs(0)
  }

  function confirmLog() {
    if (!logExercise) return
    const set: WorkoutSet = {}
    if (logReps > 0) set.reps = logReps
    if (logSecs > 0) set.durationSeconds = logSecs
    if (!set.reps && !set.durationSeconds) set.reps = 0
    onAddExercise(logExercise, set)
    setLogExercise(null)
    setShowSearch(false)
    setSearchQuery('')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col relative" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Timer bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/8 flex-shrink-0">
        <button onClick={() => setShowCancel(true)} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
          <Square size={14} className="text-white/60" />
        </button>
        <div className="text-center">
          <p className="text-2xl font-black text-brand-green tabular-nums">{formatDuration(seconds)}</p>
          <p className="text-xs text-white/35">{totalReps} rep</p>
        </div>
        <button
          onClick={onFinish}
          className="h-9 px-4 rounded-full bg-brand-green text-black text-sm font-black"
        >
          Finalizează
        </button>
      </div>

      {/* Exercises */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {exercises.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-white/35 mb-2">Niciun exercițiu adăugat.</p>
            <p className="text-xs text-white/25">Caută un exercițiu pentru a începe.</p>
          </div>
        )}
        {exercises.map((ex, ei) => (
          <div key={`${ex.name}-${ei}`} className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div
              className="flex items-center justify-between mb-2 cursor-pointer select-none"
              onPointerDown={() => openExPopup(ei, ex.sets)}
            >
              <div>
                <p className="font-bold text-white text-sm">{ex.name}</p>
                <p className="text-xs text-white/40">{ex.category}</p>
              </div>
              <ChevronRight size={16} className="text-white/30" />
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

      {/* Cancel dialog */}
      {showCancel && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center px-6 z-10">
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

      {/* Edit existing exercise sets popup */}
      {popupExIdx !== null && (
        <div className="absolute inset-0 bg-black/70 flex items-end justify-center z-20">
          <div className="w-full max-w-sm rounded-t-3xl pb-8" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
              <div>
                <p className="font-black text-white text-base">{exercises[popupExIdx].name}</p>
                <p className="text-xs text-white/40">{exercises[popupExIdx].category}</p>
              </div>
              <button onClick={() => setPopupExIdx(null)} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                <X size={14} className="text-white/60" />
              </button>
            </div>
            <div className="flex items-center px-5 pt-3 pb-1 gap-3">
              <span className="w-8 text-[10px] font-bold text-white/30 text-center">SET</span>
              <span className="flex-1 text-[10px] font-bold text-white/30 text-center">REPETĂRI</span>
              <span className="w-24 text-[10px] font-bold text-white/30 text-center">SECUNDE</span>
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
                    <div className="flex-1 flex items-center justify-center gap-2">
                      <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, reps: Math.max(0, (s.reps ?? 0) - 1) } : s))}
                        className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:bg-white/12 active:scale-95 transition-all text-lg font-bold">−</button>
                      <span className="w-8 text-center text-xl font-black text-white tabular-nums">{reps}</span>
                      <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, reps: (s.reps ?? 0) + 1 } : s))}
                        className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center text-black hover:opacity-90 active:scale-95 transition-all text-lg font-bold">+</button>
                    </div>
                    <div className="w-24 flex items-center justify-center gap-1.5">
                      <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, durationSeconds: Math.max(0, (s.durationSeconds ?? 0) - 5) } : s))}
                        className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-white/50 hover:bg-white/12 text-sm font-bold">−</button>
                      <span className="w-8 text-center text-sm font-black text-white/80 tabular-nums">{secs}s</span>
                      <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, durationSeconds: (s.durationSeconds ?? 0) + 5 } : s))}
                        className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-white/50 hover:bg-white/12 text-sm font-bold">+</button>
                    </div>
                    <button onClick={() => setPopupSets(prev => prev.filter((_, i) => i !== si))}
                      disabled={popupSets.length <= 1}
                      className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors disabled:opacity-0">
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setPopupSets(prev => [...prev, { reps: prev[prev.length - 1]?.reps ?? 0 }])}
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
      )}

      {/* ── Search sheet ── */}
      {showSearch && (
        <div className="absolute inset-0 bg-black/60 flex items-end justify-center z-30">
          <div className="w-full max-w-sm rounded-t-3xl flex flex-col" style={{ backgroundColor: 'var(--app-surface)', maxHeight: '80vh' }}>
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

            {/* Exercise list */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {/* Favorites row (when not searching) */}
              {!searchQuery.trim() && favorites.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2">⭐ FAVORITE</p>
                  <div className="flex flex-col gap-1.5">
                    {favorites.map(name => (
                      <button key={name}
                        onClick={() => openLogPopup(name)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left bg-white/5 border border-white/8 text-white/80 hover:bg-white/10 active:scale-[0.98] transition-all">
                        <span>{name}</span>
                        <ChevronRight size={14} className="text-white/30" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {grouped.map(group => (
                <div key={group.category} className="mb-4">
                  {group.category && (
                    <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 uppercase">{group.category}</p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {group.exercises.map(({ name }) => (
                      <button key={name}
                        onClick={() => openLogPopup(name)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left bg-white/5 border border-white/8 text-white/80 hover:bg-white/10 active:scale-[0.98] transition-all">
                        <span>{name}</span>
                        <ChevronRight size={14} className="text-white/30" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Log exercise popup (reps/seconds) ── */}
      {logExercise !== null && (
        <div className="absolute inset-0 bg-black/70 flex items-end justify-center z-40">
          <div className="w-full max-w-sm rounded-t-3xl pb-8" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
              <div>
                <p className="font-black text-white text-base">{logExercise}</p>
                <p className="text-xs text-white/40">{getCategoryForExercise(logExercise)}</p>
              </div>
              <button onClick={() => setLogExercise(null)}
                className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                <X size={14} className="text-white/60" />
              </button>
            </div>

            <div className="px-5 pt-5 pb-2">
              {/* Reps */}
              <p className="text-[10px] font-bold text-white/40 tracking-widest mb-3 text-center">CÂT AI FĂCUT?</p>

              <div className="mb-5">
                <p className="text-xs text-white/50 text-center mb-2">Repetări</p>
                <div className="flex items-center justify-center gap-5">
                  <button
                    onClick={() => setLogReps(r => Math.max(0, r - 1))}
                    className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-2xl font-bold active:scale-95 transition-transform"
                  >−</button>
                  <span className="w-16 text-center text-4xl font-black text-white tabular-nums">{logReps}</span>
                  <button
                    onClick={() => setLogReps(r => r + 1)}
                    className="w-12 h-12 rounded-full bg-brand-green flex items-center justify-center text-black text-2xl font-bold active:scale-95 transition-transform"
                  >+</button>
                </div>
              </div>

              {/* Seconds */}
              <div className="mb-6">
                <p className="text-xs text-white/50 text-center mb-2">Secunde (opțional)</p>
                <div className="flex items-center justify-center gap-5">
                  <button
                    onClick={() => setLogSecs(s => Math.max(0, s - 5))}
                    className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-2xl font-bold active:scale-95 transition-transform"
                  >−</button>
                  <span className="w-16 text-center text-4xl font-black text-white/80 tabular-nums">{logSecs}<span className="text-xl text-white/40">s</span></span>
                  <button
                    onClick={() => setLogSecs(s => s + 5)}
                    className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-2xl font-bold active:scale-95 transition-transform"
                  >+</button>
                </div>
              </div>

              <button
                onClick={confirmLog}
                className="w-full h-13 rounded-2xl bg-brand-green text-black font-black text-base flex items-center justify-center gap-2"
                style={{ height: 52 }}
              >
                <Check size={18} /> Adaugă exercițiu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Workout Summary ────────────────────────────────────────────────────────────

function WorkoutSummary({
  workout, coinsEarned, onDone, userId, userDisplayName, joinedCommunityIds, favoriteCommunityId,
}: {
  workout: WorkoutDoc
  coinsEarned: number
  onDone: () => void
  userId: string
  userDisplayName: string
  joinedCommunityIds: string[]
  favoriteCommunityId?: string | null
}) {
  const [showShare, setShowShare] = useState(false)
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  const [selectedCommId, setSelectedCommId] = useState(favoriteCommunityId ?? '')
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)
  const [loadingComms, setLoadingComms] = useState(false)

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
      const memberSnap = await getDoc(doc(db, 'communities', selectedCommId, 'members', userId))
      const role = memberSnap.exists() ? memberSnap.data().role : 'MEMBER'
      const content = [
        '💪 Antrenament finalizat!',
        `⏱ ${formatDuration(workout.durationSeconds)} · 🔁 ${workout.totalReps} rep`,
        '',
        ...workout.exercises.map(e => `${e.name} · ${e.sets.length}×${e.sets[0]?.reps ?? 0} rep`),
      ].join('\n')
      await addDoc(collection(db, 'communities', selectedCommId, 'posts'), {
        authorId: userId,
        authorName: userDisplayName,
        authorRole: role,
        content,
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
      })
      setShared(true)
      setShowShare(false)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-full bg-brand-green flex items-center justify-center mx-auto mb-4">
          <Check size={40} className="text-black" strokeWidth={3} />
        </div>
        <h2 className="text-2xl font-black text-white mb-1">Bravo! 💪</h2>
        <p className="text-white/50 text-sm">Antrenament finalizat</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl p-5 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
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

        <div className="mt-4 border-t border-white/10 pt-4">
          {workout.exercises.map((ex, i) => (
            <div key={i} className="flex justify-between text-sm py-1">
              <span className="text-white/70">{ex.name}</span>
              <span className="text-white/50">{ex.sets.length} × {ex.sets[0]?.reps ?? 0} rep</span>
            </div>
          ))}
        </div>
      </div>

      {joinedCommunityIds.length > 0 && !shared && (
        <button
          onClick={openShare}
          className="w-full max-w-sm h-12 rounded-full font-bold border border-white/20 text-white/70 mb-3 flex items-center justify-center gap-2"
        >
          <Share2 size={16} /> Postează în comunitate
        </button>
      )}
      {shared && (
        <p className="text-xs text-brand-green text-center mb-3">✓ Postat în comunitate!</p>
      )}

      <button
        onClick={onDone}
        className="w-full max-w-sm h-13 rounded-full font-bold text-black bg-brand-green"
        style={{ height: 52 }}
      >
        Înapoi la antrenamente
      </button>

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
          className="h-full rounded-full transition-all"
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
