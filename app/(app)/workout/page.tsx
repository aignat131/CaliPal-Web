'use client'

import { useEffect, useState } from 'react'
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, increment, serverTimestamp, getDoc, getDocs, deleteDoc, setDoc, runTransaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { WorkoutDoc, WorkoutExercise, WorkoutSet, WeeklyChallenge, UserChallengeProgress, CommunityChallenge } from '@/types'
import { awardCoins, checkWorkoutMilestones } from '@/lib/gamification/coins'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useWorkout } from '@/lib/context/WorkoutContext'
import { DEFAULT_EXERCISE_CATALOGUE, getCategory, type CatalogueEntry } from '@/lib/data/exercise-catalogue'
import { localDate, totalRepsInWorkout } from './_helpers'
import { WorkoutHomeTab } from './_components/WorkoutHomeTab'
import { ActiveWorkoutView } from './_components/ActiveWorkoutView'
import { PostWorkoutDetails } from './_components/PostWorkoutDetails'
import { WorkoutSummaryCard } from './_components/WorkoutSummaryCard'
import { QuickRepCounterView } from './_components/QuickRepCounterView'

type Screen = 'home' | 'active' | 'postdetails' | 'summary' | 'quickcount'

export default function WorkoutPage() {
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const [tab, setTab] = useState(0)

  const {
    isActive, seconds, startedAt, exercises, note,
    startWorkout: ctxStart, stopWorkout: ctxStop,
    setExercises, setNote,
  } = useWorkout()

  const [screen, setScreen] = useState<Screen>(() => isActive ? 'active' : 'home')
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>(DEFAULT_EXERCISE_CATALOGUE)

  const [lastWorkout, setLastWorkout] = useState<WorkoutDoc | null>(null)
  const [coinsEarned, setCoinsEarned] = useState(0)
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null)
  const [capturedExercises, setCapturedExercises] = useState<WorkoutExercise[]>([])
  const [capturedSeconds, setCapturedSeconds] = useState(0)
  const [summaryPhotoFile, setSummaryPhotoFile] = useState<File | null>(null)
  const [autoOpenShare, setAutoOpenShare] = useState(false)

  const [history, setHistory] = useState<WorkoutDoc[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null)
  const [challengeProgress, setChallengeProgress] = useState<UserChallengeProgress | null>(null)

  useEffect(() => {
    if (isActive && screen === 'home') setScreen('active')
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function replaceExerciseSets(ei: number, sets: WorkoutSet[]) {
    setExercises(exercises.map((ex, i) => i === ei ? { ...ex, sets } : ex))
  }

  function addExercise(name: string, initialSet: WorkoutSet) {
    setExercises([...exercises, { name, category: getCategory(name, catalogue), sets: [initialSet] }])
  }

  function removeExercise(idx: number) {
    setExercises(exercises.filter((_, i) => i !== idx))
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
    setCapturedExercises(exercises)
    setCapturedSeconds(seconds)
    setWorkoutStartedAt(Date.now() - seconds * 1000)
    setScreen('postdetails')
  }

  function captureWorkout(doneKeys: Set<string>) {
    if (exercises.length === 0) return
    let snap: typeof exercises
    if (doneKeys.size === 0) {
      snap = [...exercises]
    } else {
      snap = exercises
        .map((ex, ei) => ({ ...ex, sets: ex.sets.filter((_, si) => doneKeys.has(`${ei}-${si}`)) }))
        .filter(ex => ex.sets.length > 0)
      if (snap.length === 0) snap = [...exercises]
    }
    setCapturedExercises(snap)
    setCapturedSeconds(seconds)
    setWorkoutStartedAt(startedAt ?? Date.now() - seconds * 1000)
    ctxStop()
    setScreen('postdetails')
  }

  async function saveWorkout(photoFile: File | null, description: string) {
    if (!user) return
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
        const set: Record<string, number> = {}
        if (s.reps !== undefined) set.reps = s.reps
        if (s.durationSeconds !== undefined) set.durationSeconds = s.durationSeconds
        if (Object.keys(set).length === 0) set.reps = 0
        return set
      }),
    }))

    try {
      await addDoc(collection(db, 'users', user.uid, 'workouts'), {
        userId: user.uid,
        exercises: serializedExercises,
        durationSeconds: finalSeconds,
        totalReps,
        coinsEarned: 10,
        note: finalNote.trim(),
        createdAt: serverTimestamp(),
      })

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
        newStreak = lastWorkoutDate === yesterday ? currentStreak + 1 : lastWorkoutDate === today ? currentStreak : 1
        tx.update(userRef, { totalWorkouts: increment(1), currentStreak: newStreak, lastWorkoutDate: today })
      })

      earned += await awardCoins(user.uid, 'COMPLETE_WORKOUT')
      await checkWorkoutMilestones(user.uid, newTotal)

      if (newStreak === 3) earned += await awardCoins(user.uid, 'STREAK_3')
      if (newStreak === 7) earned += await awardCoins(user.uid, 'STREAK_7')
      if (newStreak === 30) earned += await awardCoins(user.uid, 'STREAK_30')

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
          }))
        }))
      } catch { /* non-critical */ }

    } catch (e) {
      console.error(e)
    }

    setCoinsEarned(earned)
    setLastWorkout({
      id: '', userId: user.uid, exercises: finalExercises,
      durationSeconds: finalSeconds, totalReps, coinsEarned: earned, note: finalNote, createdAt: null,
    })
  }

  async function saveWorkoutAndShare(photoFile: File | null, description: string) {
    setAutoOpenShare(true)
    await saveWorkout(photoFile, description)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

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
        />
      )}

      {screen === 'active' && (
        <ActiveWorkoutView
          exercises={exercises}
          seconds={seconds}
          note={note}
          catalogue={catalogue}
          onNoteChange={setNote}
          onReplaceExerciseSets={replaceExerciseSets}
          onAddExercise={(name, set) => addExercise(name, set)}
          onRemoveExercise={removeExercise}
          onFinish={(dk) => captureWorkout(dk)}
          onCancel={() => { ctxStop(); setScreen('home') }}
          favorites={profile?.favoriteExercises ?? []}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {screen === 'quickcount' && (
        <QuickRepCounterView
          catalogue={catalogue}
          onSaveAsWorkout={saveQuickCountAsWorkout}
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
        />
      )}
    </div>
  )
}
