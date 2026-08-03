'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, increment, serverTimestamp, getDoc, getDocs, deleteDoc, setDoc, runTransaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { WorkoutDoc, WorkoutExercise, WorkoutSet, WorkoutCircuit, WeeklyChallenge, UserChallengeProgress, CommunityChallenge, GripType, RepSession, UnifiedRepSession } from '@/types'
import { checkWorkoutMilestones, checkStreakMilestones, awardCoins } from '@/lib/gamification/coins'
import { updateWeeklyPushupLeaderboard } from '@/lib/gamification/leaderboard'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useWorkout } from '@/lib/context/WorkoutContext'
import { DEFAULT_EXERCISE_CATALOGUE, getCategory, type CatalogueEntry } from '@/lib/data/exercise-catalogue'
import { localDate, totalRepsInWorkout, formatDuration, getExerciseType, norm } from './_helpers'
import type { ExerciseType } from '@/lib/ml/form-coach'
import RepCounterModal, { REP_SESSION_KEY } from '@/components/workout/RepCounterModal'
import UnifiedRepCounterModal, { UNIFIED_SESSION_KEY } from '@/components/workout/UnifiedRepCounterModal'
import type { UnifiedResult } from '@/components/workout/UnifiedRepCounterModal'
import { WorkoutHomeTab } from './_components/WorkoutHomeTab'
import { ActiveWorkoutView } from './_components/ActiveWorkoutView'
import { PostWorkoutDetails } from './_components/PostWorkoutDetails'
import { WorkoutSummaryCard } from './_components/WorkoutSummaryCard'
import { QuickRepCounterView } from './_components/QuickRepCounterView'
import { SpidermanChallenge } from './_components/SpidermanChallenge'
import type { SpidermanResult } from './_components/SpidermanChallenge'

const AUTH_REDIRECT_KEY = 'calipal_auth_redirect'

type Screen = 'home' | 'active' | 'postdetails' | 'summary' | 'quickcount' | 'autocount' | 'spiderman'

const PENDING_WORKOUT_KEY = 'calipal_pending_workout'

interface PendingWorkoutData {
  exercises: WorkoutExercise[]
  seconds: number
  circuits: WorkoutCircuit[]
  startedAt: number
  savedAt: number
}

export default function WorkoutPage() {
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const [tab, setTab] = useState(0)

  const {
    isActive, isPaused, seconds, startedAt, exercises, note, doneKeys,
    startWorkout: ctxStart, stopWorkout: ctxStop, pauseWorkout, resumeWorkout,
    setExercises, setNote, toggleDoneKey,
    circuits, addCircuit, removeCircuit, startCircuitRound, completeCircuitRound, updateCircuitIndicesOnRemove,
    activeTimedSet, startTimedSet, clearTimedSet,
  } = useWorkout()

  const [screen, setScreen] = useState<Screen>('home')
  const [showResumePrompt, setShowResumePrompt] = useState(false)
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>(DEFAULT_EXERCISE_CATALOGUE)

  const [lastWorkout, setLastWorkout] = useState<WorkoutDoc | null>(null)
  const [coinsEarned, setCoinsEarned] = useState(0)
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null)
  const [capturedExercises, setCapturedExercises] = useState<WorkoutExercise[]>([])
  const [capturedSeconds, setCapturedSeconds] = useState(0)
  const [summaryPhotoFile, setSummaryPhotoFile] = useState<File | null>(null)
  const [autoOpenShare, setAutoOpenShare] = useState(false)
  const [capturedCircuits, setCapturedCircuits] = useState<WorkoutCircuit[]>([])

  // Quick exercise flow from home screen
  const [quickExercise, setQuickExercise] = useState<{ name: string; type: ExerciseType } | null>(null)
  const [quickSets, setQuickSets] = useState<WorkoutExercise[]>([])
  const [showQuickPostSet, setShowQuickPostSet] = useState(false)

  const [history, setHistory] = useState<WorkoutDoc[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null)
  const [challengeProgress, setChallengeProgress] = useState<UserChallengeProgress | null>(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)

  // Crash recovery — rep counter session
  const [recoveredSession, setRecoveredSession] = useState<RepSession | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REP_SESSION_KEY)
      if (!raw) return
      const session = JSON.parse(raw) as RepSession
      if (Date.now() - session.savedAt > 60 * 60 * 1000) {
        localStorage.removeItem(REP_SESSION_KEY)
        return
      }
      if (session.repCount > 0) setRecoveredSession(session)
    } catch { localStorage.removeItem(REP_SESSION_KEY) }
  }, [])

  // Crash recovery — unified rep counter session
  const [recoveredUnifiedSession, setRecoveredUnifiedSession] = useState<UnifiedRepSession | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UNIFIED_SESSION_KEY)
      if (!raw) return
      const session = JSON.parse(raw) as UnifiedRepSession
      if (Date.now() - session.savedAt > 60 * 60 * 1000) {
        localStorage.removeItem(UNIFIED_SESSION_KEY)
        return
      }
      if (session.exercises.length > 0) setRecoveredUnifiedSession(session)
    } catch { localStorage.removeItem(UNIFIED_SESSION_KEY) }
  }, [])

  // Crash recovery — pending workout (user exited on postdetails/summary screen)
  const [recoveredPending, setRecoveredPending] = useState<PendingWorkoutData | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_WORKOUT_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as PendingWorkoutData
      if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(PENDING_WORKOUT_KEY)
        return
      }
      if (data.exercises.length > 0) setRecoveredPending(data)
    } catch { localStorage.removeItem(PENDING_WORKOUT_KEY) }
  }, [])

  useEffect(() => {
    if (isActive && screen === 'home') setShowResumePrompt(true)
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleResumeWorkout() {
    setShowResumePrompt(false)
    setScreen('active')
  }

  function handleSaveAndDismiss() {
    setShowResumePrompt(false)
    captureWorkout()
  }

  function handleDiscardWorkout() {
    setShowResumePrompt(false)
    ctxStop()
  }

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'exercise_catalogue'),
      snap => {
        if (!snap.empty) {
          setCatalogue(snap.docs.map(d => d.data() as CatalogueEntry).sort((a, b) => a.name.localeCompare(b.name, 'ro')))
        }
      },
      () => { /* permission denied — use default */ }
    )
    return unsub
  }, [])

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
          fromProgram: true,
        }))
      if (mapped.length > 0) { ctxStart(mapped); setScreen('active') }
    } catch { /* ignore malformed data */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'workouts'), orderBy('createdAt', 'desc'), limit(20))
    const unsub = onSnapshot(q, snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }) as WorkoutDoc))
      setHistoryLoading(false)
    })
    return unsub
  }, [user])

  useEffect(() => {
    if (!user) return
    let unsubProgress: (() => void) | null = null
    const unsub = onSnapshot(
      query(collection(db, 'weekly_challenges'), orderBy('endsAt', 'desc'), limit(1)),
      snap => {
        if (unsubProgress) { unsubProgress(); unsubProgress = null }
        if (snap.docs.length > 0) {
          const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as WeeklyChallenge
          setChallenge(c)
          unsubProgress = onSnapshot(
            doc(db, 'users', user.uid, 'challenge_progress', c.id),
            ps => { setChallengeProgress(ps.exists() ? ps.data() as UserChallengeProgress : null) }
          )
        }
      }
    )
    return () => { unsub(); if (unsubProgress) unsubProgress() }
  }, [user])

  // ── Exercise mutations ──────────────────────────────────────────────────────

  function replaceExerciseSets(ei: number, sets: WorkoutSet[], grip?: GripType) {
    setExercises(exercises.map((ex, i) =>
      i === ei ? { ...ex, sets, ...(grip !== undefined && { grip }) } : ex
    ))
  }

  function addExercise(name: string, initialSet: WorkoutSet, grip?: GripType) {
    setExercises([...exercises, {
      name,
      category: getCategory(name, catalogue),
      sets: [initialSet],
      ...(grip && { grip }),
    }])
  }

  function removeExercise(idx: number) {
    setExercises(exercises.filter((_, i) => i !== idx))
    updateCircuitIndicesOnRemove(idx)
  }

  async function toggleFavorite(name: string) {
    if (!user) return
    const current: string[] = profile?.favoriteExercises ?? []
    const next = current.includes(name) ? current.filter(n => n !== name) : [name, ...current].slice(0, 8)
    await updateDoc(doc(db, 'users', user.uid), { favoriteExercises: next })
  }

  // ── Workout flow ────────────────────────────────────────────────────────────

  function startWorkout() { ctxStart([]); setScreen('active') }

  function startQuickCount() {
    if (isActive) return
    setScreen('quickcount')
  }

  function saveQuickCountAsWorkout(exercises: WorkoutExercise[], seconds: number) {
    const startedAtMs = Date.now() - seconds * 1000
    setCapturedExercises(exercises)
    setCapturedSeconds(seconds)
    setWorkoutStartedAt(startedAtMs)
    try {
      const pending: PendingWorkoutData = {
        exercises, seconds, circuits: [], startedAt: startedAtMs, savedAt: Date.now(),
      }
      localStorage.setItem(PENDING_WORKOUT_KEY, JSON.stringify(pending))
    } catch { /* */ }
    setScreen('postdetails')
  }

  // ── Quick exercise flow (from home screen chips) ───────────────────────────

  function handleQuickExercise(name: string, type: ExerciseType) {
    setQuickExercise({ name, type })
  }

  function handleQuickExerciseConfirm(reps: number, durationSeconds: number) {
    if (!quickExercise) return
    const set: WorkoutSet = { reps, recorded: true, ...(durationSeconds > 0 && { durationSeconds }) }

    // If a workout is active, add directly to it
    if (isActive) {
      const existingIdx = exercises.findIndex(ex => norm(ex.name) === norm(quickExercise.name))
      if (existingIdx >= 0) {
        const updated = [...exercises]
        updated[existingIdx] = { ...updated[existingIdx], sets: [...updated[existingIdx].sets, set] }
        setExercises(updated)
      } else {
        addExercise(quickExercise.name, set)
      }
      setQuickExercise(null)
      return
    }

    const entry: WorkoutExercise = {
      name: quickExercise.name,
      category: getCategory(quickExercise.name, catalogue),
      sets: [set],
    }
    setQuickSets(prev => {
      const existing = prev.find(e => e.name === entry.name)
      if (existing) {
        return prev.map(e => e.name === entry.name ? { ...e, sets: [...e.sets, ...entry.sets] } : e)
      }
      return [...prev, entry]
    })
    setQuickExercise(null)
    setShowQuickPostSet(true)
  }

  function handleQuickAnotherSet() {
    if (quickSets.length === 0) return
    const last = quickSets[quickSets.length - 1]
    const type = getExerciseType(last.name)
    if (type) {
      setShowQuickPostSet(false)
      setQuickExercise({ name: last.name, type })
    }
  }

  function quickSetsTotalDurationMs(sets: WorkoutExercise[]): number {
    return sets.flatMap(e => e.sets).reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) * 1000
  }

  function handleQuickSave() {
    setShowQuickPostSet(false)
    const totalSec = Math.round(quickSetsTotalDurationMs(quickSets) / 1000)
    const startedAtMs = Date.now() - totalSec * 1000
    setCapturedExercises(quickSets)
    setCapturedSeconds(totalSec)
    setWorkoutStartedAt(startedAtMs)
    try {
      const pending: PendingWorkoutData = {
        exercises: quickSets, seconds: totalSec, circuits: [], startedAt: startedAtMs, savedAt: Date.now(),
      }
      localStorage.setItem(PENDING_WORKOUT_KEY, JSON.stringify(pending))
    } catch { /* */ }
    setQuickSets([])
    setScreen('postdetails')
  }

  function handleQuickToWorkout() {
    setShowQuickPostSet(false)
    ctxStart(quickSets, quickSetsTotalDurationMs(quickSets))
    setQuickSets([])
    setScreen('active')
  }

  function handleQuickRecord(name: string, type: ExerciseType) {
    setQuickExercise({ name, type })
  }

  function handleQuickCancel() {
    setQuickExercise(null)
    setShowQuickPostSet(false)
    setQuickSets([])
  }

  // ── Auto-detect (unified) counter flow ────────────────────────────────────

  function startAutoCount() {
    setScreen('autocount')
  }

  function handleAutoCountConfirm(result: UnifiedResult) {
    const workoutExercises: WorkoutExercise[] = result.exercises.map(ex => ({
      name: ex.name,
      category: getCategory(ex.name, catalogue),
      sets: [{ reps: ex.reps, recorded: true, ...(result.durationSeconds > 0 && { durationSeconds: result.durationSeconds }) }],
    }))
    const startedAtMs = Date.now() - result.durationSeconds * 1000
    setCapturedExercises(workoutExercises)
    setCapturedSeconds(result.durationSeconds)
    setWorkoutStartedAt(startedAtMs)
    setCapturedCircuits([])
    try {
      const pending: PendingWorkoutData = {
        exercises: workoutExercises, seconds: result.durationSeconds,
        circuits: [], startedAt: startedAtMs, savedAt: Date.now(),
      }
      localStorage.setItem(PENDING_WORKOUT_KEY, JSON.stringify(pending))
    } catch { /* */ }
    setScreen('postdetails')
  }

  function captureWorkout() {
    if (exercises.length === 0) return
    // Build effective done keys: manual (non-program) sets count as done
    // except timed sets that haven't been completed yet
    const effectiveDoneKeys = new Set(doneKeys)
    exercises.forEach((ex, ei) => {
      if (!ex.fromProgram) {
        ex.sets.forEach((s, si) => {
          const isTimedIncomplete = (s.timedDurationSeconds ?? 0) > 0 && (s.reps ?? 0) === 0
          if (!isTimedIncomplete) effectiveDoneKeys.add(`${ei}-${si}`)
        })
      }
    })
    let snap: typeof exercises
    if (effectiveDoneKeys.size === 0) {
      snap = [...exercises]
    } else {
      snap = exercises
        .map((ex, ei) => ({ ...ex, sets: ex.sets.filter((_, si) => effectiveDoneKeys.has(`${ei}-${si}`)) }))
        .filter(ex => ex.sets.length > 0)
      if (snap.length === 0) snap = [...exercises]
    }
    const capturedCircuitsData = circuits.map(c => ({
      id: c.id,
      exerciseIndices: c.exerciseIndices,
      targetRounds: c.targetRounds,
      rounds: c.completedRounds,
    }))
    const capturedStartedAt = startedAt ?? Date.now() - seconds * 1000
    setCapturedExercises(snap)
    setCapturedSeconds(seconds)
    setCapturedCircuits(capturedCircuitsData)
    setWorkoutStartedAt(capturedStartedAt)
    // Persist pending data before clearing workout context so it survives app exit
    try {
      const pending: PendingWorkoutData = {
        exercises: snap, seconds, circuits: capturedCircuitsData,
        startedAt: capturedStartedAt, savedAt: Date.now(),
      }
      localStorage.setItem(PENDING_WORKOUT_KEY, JSON.stringify(pending))
    } catch { /* quota exceeded — proceed anyway */ }
    ctxStop()
    setScreen('postdetails')
  }

  function handleSpidermanComplete(result: SpidermanResult) {
    const capturedStartedAt = Date.now() - result.durationSeconds * 1000
    setCapturedExercises(result.exercises)
    setCapturedSeconds(result.durationSeconds)
    setCapturedCircuits([])
    setWorkoutStartedAt(capturedStartedAt)
    try {
      const pending: PendingWorkoutData = {
        exercises: result.exercises,
        seconds: result.durationSeconds,
        circuits: [],
        startedAt: capturedStartedAt,
        savedAt: Date.now(),
      }
      localStorage.setItem(PENDING_WORKOUT_KEY, JSON.stringify(pending))
    } catch { /* quota exceeded */ }
    setScreen('postdetails')
  }

  async function saveWorkout(photoFile: File | null, description: string) {
    if (!user) {
      // Guest user — prompt to create account; pending data is already in localStorage
      sessionStorage.setItem(AUTH_REDIRECT_KEY, '/workout')
      setShowAuthPrompt(true)
      return
    }
    setSummaryPhotoFile(photoFile)

    const finalExercises = capturedExercises
    const finalSeconds = capturedSeconds
    const finalNote = description
    setScreen('summary')

    const hasContent = finalExercises.some(ex => ex.sets.some(s => (s.reps ?? 0) > 0 || (s.durationSeconds ?? 0) > 0))
    if (!hasContent) return

    const totalReps = totalRepsInWorkout(finalExercises)
    let earned = 0

    const serializedExercises = finalExercises.map(ex => ({
      ...ex,
      sets: ex.sets.map(s => {
        const set: Record<string, number | boolean> = {}
        if (s.reps !== undefined) set.reps = s.reps
        if (s.durationSeconds !== undefined) set.durationSeconds = s.durationSeconds
        if (s.weightKg !== undefined) set.weightKg = s.weightKg
        if (s.bandKg !== undefined) set.bandKg = s.bandKg
        if (s.timedDurationSeconds !== undefined) set.timedDurationSeconds = s.timedDurationSeconds
        if (s.recorded) set.recorded = true
        if (Object.keys(set).length === 0) set.reps = 0
        return set
      }),
    }))

    const serializedCircuits: WorkoutCircuit[] = capturedCircuits
      .filter(c => c.rounds.length > 0)
      .map(c => ({
        id: c.id,
        exerciseIndices: c.exerciseIndices,
        targetRounds: c.targetRounds,
        rounds: c.rounds,
      }))

    try {
      await addDoc(collection(db, 'users', user.uid, 'workouts'), {
        userId: user.uid,
        exercises: serializedExercises,
        ...(serializedCircuits.length > 0 && { circuits: serializedCircuits }),
        durationSeconds: finalSeconds,
        totalReps,
        coinsEarned: 0,
        note: finalNote.trim(),
        createdAt: serverTimestamp(),
      })

      // Workout saved successfully — clear pending data
      localStorage.removeItem(PENDING_WORKOUT_KEY)

      // Award 10 coins for completing a workout
      const completeCoins = await awardCoins(user.uid, 'COMPLETE_WORKOUT')
      earned += completeCoins

      const userRef = doc(db, 'users', user.uid)
      const today = localDate(new Date())
      const yesterday = localDate(new Date(Date.now() - 86400000))
      let _newTotal = 0
      let newStreak = 0
      let joinedCommunityIds: string[] = []
      await runTransaction(db, async tx => {
        const userSnap = await tx.get(userRef)
        const userData = userSnap.data()
        _newTotal = (userData?.totalWorkouts ?? 0) + 1
        joinedCommunityIds = userData?.joinedCommunityIds ?? []
        const lastWorkoutDate: string | undefined = userData?.lastWorkoutDate
        const currentStreak = userData?.currentStreak ?? 0
        newStreak = lastWorkoutDate === yesterday ? currentStreak + 1 : lastWorkoutDate === today ? currentStreak : 1
        tx.update(userRef, { totalWorkouts: increment(1), currentStreak: newStreak, lastWorkoutDate: today })
      })

      // Award milestone coins for workout count and streak
      await checkWorkoutMilestones(user.uid, _newTotal)
      await checkStreakMilestones(user.uid, newStreak)

      // Update weekly push-up leaderboard
      const pushupReps = finalExercises.reduce((sum, ex) => {
        if (getExerciseType(ex.name) === 'pushup') {
          return sum + ex.sets.reduce((s, set) => s + (set.reps ?? 0), 0)
        }
        return sum
      }, 0)
      if (pushupReps > 0) {
        updateWeeklyPushupLeaderboard(
          user.uid,
          profile?.displayName ?? user.displayName ?? '',
          profile?.photoUrl ?? user.photoURL ?? '',
          pushupReps,
        ).catch(() => {})
      }

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
          if (completed && !wasCompleted) {
            await updateDoc(userRef, { coins: increment(challenge.coinsReward) })
            earned += challenge.coinsReward
          }
        }
      }

      try {
        const exerciseReps: Record<string, number> = {}
        for (const ex of finalExercises) {
          const reps = ex.sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
          exerciseReps[ex.name] = (exerciseReps[ex.name] ?? 0) + reps
        }
        await Promise.all(joinedCommunityIds.map(async cid => {
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
              challengeId: ch.id, communityId: cid, currentReps: newReps, completed,
              completedAt: completed && !ps.data()?.completed ? serverTimestamp() : (ps.exists() ? ps.data().completedAt ?? null : null),
            })
            if (completed && !ps.data()?.completed) {
              await updateDoc(userRef, { coins: increment(ch.coinsReward ?? 0) })
              earned += ch.coinsReward ?? 0
            }
          }))
        }))
      } catch { /* non-critical */ }

    } catch (e) {
      console.error(e)
    }

    setCoinsEarned(earned)
    setLastWorkout({
      id: '', userId: user.uid, exercises: finalExercises,
      ...(serializedCircuits.length > 0 && { circuits: serializedCircuits }),
      durationSeconds: finalSeconds, totalReps, coinsEarned: earned, note: finalNote, createdAt: null,
    })
  }

  async function saveWorkoutAndShare(photoFile: File | null, description: string) {
    setAutoOpenShare(true)
    await saveWorkout(photoFile, description)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-64px)] animate-page-enter" style={{ backgroundColor: 'var(--app-bg)' }}>
      <h1 className="sr-only">Workout</h1>

      {screen === 'postdetails' && (
        <PostWorkoutDetails
          exercises={capturedExercises}
          seconds={capturedSeconds}
          onSave={saveWorkout}
          onShare={saveWorkoutAndShare}
          hasJoinedCommunities={(profile?.joinedCommunityIds ?? []).length > 0}
        />
      )}

      {screen === 'summary' && lastWorkout && (
        <WorkoutSummaryCard
          workout={lastWorkout}
          coinsEarned={coinsEarned}
          onDone={() => { setScreen('home'); setTab(1); setAutoOpenShare(false) }}
          userId={user?.uid ?? ''}
          userDisplayName={profile?.displayName ?? user?.displayName ?? ''}
          userPhotoURL={profile?.photoUrl ?? user?.photoURL ?? null}
          joinedCommunityIds={profile?.joinedCommunityIds ?? []}
          favoriteCommunityId={profile?.favoriteCommunityId}
          startedAt={workoutStartedAt}
          photoFile={summaryPhotoFile}
          autoOpenShare={autoOpenShare}
          hasAssessment={!!profile?.basicStrength?.level}
          totalWorkouts={profile?.totalWorkouts ?? 0}
        />
      )}

      {screen === 'active' && (
        <ActiveWorkoutView
          exercises={exercises}
          seconds={seconds}
          note={note}
          catalogue={catalogue}
          isPaused={isPaused}
          doneKeys={doneKeys}
          onNoteChange={setNote}
          onReplaceExerciseSets={replaceExerciseSets}
          onAddExercise={(name, set, grip) => addExercise(name, set, grip)}
          onRemoveExercise={removeExercise}
          onFinish={() => captureWorkout()}
          onCancel={() => { ctxStop(); setScreen('home') }}
          onPause={pauseWorkout}
          onResume={resumeWorkout}
          onToggleSet={toggleDoneKey}
          favorites={profile?.favoriteExercises ?? []}
          onToggleFavorite={toggleFavorite}
          circuits={circuits}
          onAddCircuit={addCircuit}
          onRemoveCircuit={removeCircuit}
          onStartCircuitRound={startCircuitRound}
          onCompleteCircuitRound={completeCircuitRound}
          activeTimedSet={activeTimedSet}
          onStartTimedSet={startTimedSet}
          onClearTimedSet={clearTimedSet}
        />
      )}

      {screen === 'quickcount' && (
        <QuickRepCounterView
          catalogue={catalogue}
          onSaveAsWorkout={saveQuickCountAsWorkout}
          onContinueToWorkout={(exs) => {
            ctxStart(exs)
            setScreen('active')
          }}
          onCancel={() => setScreen('home')}
        />
      )}

      {screen === 'autocount' && (
        <UnifiedRepCounterModal
          onConfirm={handleAutoCountConfirm}
          onCancel={() => setScreen('home')}
        />
      )}

      {screen === 'spiderman' && (
        <SpidermanChallenge
          onComplete={handleSpidermanComplete}
          onCancel={() => setScreen('home')}
        />
      )}

      {screen === 'home' && (
        <WorkoutHomeTab
          tab={tab}
          onTabChange={setTab}
          history={history}
          historyLoading={historyLoading}
          challenge={challenge}
          challengeProgress={challengeProgress}
          profile={profile}
          onStartWorkout={startWorkout}
          onCountReps={startQuickCount}
          onDeleteWorkout={async (wid) => {
            if (!user) return
            await deleteDoc(doc(db, 'users', user.uid, 'workouts', wid))
          }}
          onQuickExercise={handleQuickExercise}
          onAutoCount={startAutoCount}
          onSpidermanChallenge={() => setScreen('spiderman')}
          isActive={isActive}
          lastExerciseName={exercises.length > 0 ? exercises[exercises.length - 1].name : null}
          onQuickRecord={handleQuickRecord}
        />
      )}

      {/* Quick exercise camera modal */}
      {quickExercise && (
        <RepCounterModal
          exerciseType={quickExercise.type}
          exerciseName={quickExercise.name}
          onConfirm={handleQuickExerciseConfirm}
          onCancel={() => setQuickExercise(null)}
        />
      )}

      {/* Quick exercise post-set sheet */}
      {showQuickPostSet && (
        <div className="fixed inset-0 z-[55] flex flex-col justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-t-3xl px-5 pt-5 pb-10" style={{ backgroundColor: 'var(--app-surface)' }}>
            {/* Summary */}
            <div className="mb-5">
              <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">REZUMAT</p>
              {quickSets.map((ex, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-semibold text-white">{ex.name}</span>
                  <span className="text-sm text-white/50">
                    {ex.sets.length} {ex.sets.length === 1 ? 'set' : 'seturi'} · {ex.sets.reduce((s, st) => s + (st.reps ?? 0), 0)} rep
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleQuickSave}
                className="w-full h-14 rounded-2xl bg-brand-green text-black font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                Salvează ca antrenament
              </button>
              <button
                onClick={handleQuickToWorkout}
                className="w-full h-14 rounded-2xl font-bold text-base text-white flex items-center justify-center active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Mergi la antrenament complet
              </button>
              <button
                onClick={handleQuickAnotherSet}
                className="w-full h-14 rounded-2xl font-bold text-base text-white flex items-center justify-center active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                Încă un set
              </button>
              <button
                onClick={handleQuickCancel}
                className="w-full py-3 text-sm font-semibold text-red-400 active:opacity-70 transition-opacity"
              >
                Renunță
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending workout recovery prompt — workout was captured but app closed before saving */}
      {recoveredPending && !recoveredSession && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-5 z-[100]">
          <div className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-green/15 flex items-center justify-center">
                <span className="text-lg">💾</span>
              </div>
              <div>
                <p className="font-black text-white text-base">Antrenament nesalvat</p>
                <p className="text-xs text-white/40 mt-0.5">Aplicația s-a închis înainte de salvare</p>
              </div>
            </div>
            <div className="rounded-2xl px-4 py-3 mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white/60">Exerciții</span>
                <span className="text-sm font-bold text-white">{recoveredPending.exercises.length}</span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white/60">Durată</span>
                <span className="text-sm font-bold text-white">{formatDuration(recoveredPending.seconds)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Repetări</span>
                <span className="text-sm font-bold text-white">{totalRepsInWorkout(recoveredPending.exercises)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setCapturedExercises(recoveredPending.exercises)
                  setCapturedSeconds(recoveredPending.seconds)
                  setCapturedCircuits(recoveredPending.circuits)
                  setWorkoutStartedAt(recoveredPending.startedAt)
                  setRecoveredPending(null)
                  setScreen('postdetails')
                }}
                className="w-full h-13 rounded-2xl bg-brand-green text-black font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                Salvează antrenamentul
              </button>
              <button
                onClick={() => {
                  setRecoveredPending(null)
                  localStorage.removeItem(PENDING_WORKOUT_KEY)
                }}
                className="w-full py-3 text-sm font-semibold text-red-400 active:opacity-70 transition-opacity"
              >
                Renunță
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crash recovery prompt */}
      {recoveredSession && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-5 z-[100]">
          <div className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-green/15 flex items-center justify-center">
                <span className="text-lg">📹</span>
              </div>
              <div>
                <p className="font-black text-white text-base">Sesiune recuperată</p>
                <p className="text-xs text-white/40 mt-0.5">Aplicația s-a închis în timpul numărării</p>
              </div>
            </div>
            <div className="rounded-2xl px-4 py-3 mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white/60">Exercițiu</span>
                <span className="text-sm font-bold text-white">{recoveredSession.exerciseName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Repetări</span>
                <span className="text-sm font-bold text-white">{recoveredSession.repCount}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  const dur = recoveredSession.firstRepTimestamp && recoveredSession.lastRepTimestamp
                    ? Math.max(0, Math.round((recoveredSession.lastRepTimestamp - recoveredSession.firstRepTimestamp) / 1000))
                    : 0
                  const entry: WorkoutExercise = {
                    name: recoveredSession.exerciseName,
                    category: getCategory(recoveredSession.exerciseName, catalogue),
                    sets: [{ reps: recoveredSession.repCount, recorded: true, ...(dur > 0 && { durationSeconds: dur }) }],
                  }
                  setQuickSets([entry])
                  setShowQuickPostSet(true)
                  setRecoveredSession(null)
                  localStorage.removeItem(REP_SESSION_KEY)
                }}
                className="w-full h-13 rounded-2xl bg-brand-green text-black font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                Recuperează {recoveredSession.repCount} repetări
              </button>
              <button
                onClick={() => {
                  setRecoveredSession(null)
                  localStorage.removeItem(REP_SESSION_KEY)
                }}
                className="w-full py-3 text-sm font-semibold text-red-400 active:opacity-70 transition-opacity"
              >
                Renunță
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crash recovery — unified auto-detect session */}
      {recoveredUnifiedSession && !recoveredSession && !recoveredPending && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-5 z-[100]">
          <div className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center">
                <span className="text-lg">📹</span>
              </div>
              <div>
                <p className="font-black text-white text-base">Sesiune recuperată</p>
                <p className="text-xs text-white/40 mt-0.5">Numărare automată întreruptă</p>
              </div>
            </div>
            <div className="rounded-2xl px-4 py-3 mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              {recoveredUnifiedSession.exercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-sm text-white/60">{ex.name}</span>
                  <span className="text-sm font-bold text-white">{ex.reps} rep</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  const dur = recoveredUnifiedSession.firstRepTimestamp && recoveredUnifiedSession.lastRepTimestamp
                    ? Math.max(0, Math.round((recoveredUnifiedSession.lastRepTimestamp - recoveredUnifiedSession.firstRepTimestamp) / 1000))
                    : 0
                  const workoutExercises: WorkoutExercise[] = recoveredUnifiedSession.exercises.map(ex => ({
                    name: ex.name,
                    category: getCategory(ex.name, catalogue),
                    sets: [{ reps: ex.reps, recorded: true, ...(dur > 0 && { durationSeconds: dur }) }],
                  }))
                  const startedAtMs = Date.now() - dur * 1000
                  setCapturedExercises(workoutExercises)
                  setCapturedSeconds(dur)
                  setWorkoutStartedAt(startedAtMs)
                  setCapturedCircuits([])
                  setRecoveredUnifiedSession(null)
                  localStorage.removeItem(UNIFIED_SESSION_KEY)
                  setScreen('postdetails')
                }}
                className="w-full h-13 rounded-2xl bg-brand-green text-black font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                Recuperează {recoveredUnifiedSession.exercises.reduce((s, e) => s + e.reps, 0)} repetări
              </button>
              <button
                onClick={() => {
                  setRecoveredUnifiedSession(null)
                  localStorage.removeItem(UNIFIED_SESSION_KEY)
                }}
                className="w-full py-3 text-sm font-semibold text-red-400 active:opacity-70 transition-opacity"
              >
                Renunță
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume workout prompt */}
      {showResumePrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-5 z-[100]">
          <div className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-green/15 flex items-center justify-center">
                <span className="text-lg">💪</span>
              </div>
              <div>
                <p className="font-black text-white text-base">Antrenament neterminat</p>
                <p className="text-xs text-white/40 mt-0.5">Ai un antrenament în desfășurare</p>
              </div>
            </div>

            <div className="rounded-2xl px-4 py-3 mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white/60">Exerciții</span>
                <span className="text-sm font-bold text-white">{exercises.length}</span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white/60">Durată</span>
                <span className="text-sm font-bold text-white">{formatDuration(seconds)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Repetări</span>
                <span className="text-sm font-bold text-white">{totalRepsInWorkout(exercises)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleResumeWorkout}
                className="w-full h-13 rounded-2xl bg-brand-green text-black font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                Continuă antrenamentul
              </button>
              <button
                onClick={handleSaveAndDismiss}
                className="w-full h-13 rounded-2xl font-bold text-sm text-white flex items-center justify-center active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Salvează progresul
              </button>
              <button
                onClick={handleDiscardWorkout}
                className="w-full py-3 text-sm font-semibold text-red-400 active:opacity-70 transition-opacity"
              >
                Renunță la antrenament
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth prompt — guest tried to save workout */}
      {showAuthPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-5 z-[100]">
          <div className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-green/15 flex items-center justify-center">
                <span className="text-lg">🔒</span>
              </div>
              <div>
                <p className="font-black text-white text-base">Creează un cont</p>
                <p className="text-xs text-white/40 mt-0.5">pentru a salva antrenamentul</p>
              </div>
            </div>

            <div className="rounded-2xl px-4 py-3 mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <p className="text-sm text-white/60 leading-relaxed">
                Antrenamentul tău este salvat local. Creează un cont sau loghează-te și vei putea salva imediat.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                href="/register"
                className="w-full h-13 rounded-2xl bg-brand-green text-black font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                Creează cont
              </Link>
              <Link
                href="/login"
                className="w-full h-13 rounded-2xl font-bold text-sm text-white flex items-center justify-center active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Am deja un cont
              </Link>
              <button
                onClick={() => setShowAuthPrompt(false)}
                className="w-full py-3 text-sm font-semibold text-white/40 active:opacity-70 transition-opacity"
              >
                Înapoi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
