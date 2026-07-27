'use client'

import { useEffect, useState } from 'react'
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, increment, serverTimestamp, getDoc, getDocs, deleteDoc, setDoc, runTransaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { WorkoutDoc, WorkoutExercise, WorkoutSet, WorkoutCircuit, WeeklyChallenge, UserChallengeProgress, CommunityChallenge, GripType } from '@/types'
import { checkWorkoutMilestones, checkStreakMilestones, awardCoins } from '@/lib/gamification/coins'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useWorkout } from '@/lib/context/WorkoutContext'
import { DEFAULT_EXERCISE_CATALOGUE, getCategory, type CatalogueEntry } from '@/lib/data/exercise-catalogue'
import { localDate, totalRepsInWorkout, formatDuration, getExerciseType } from './_helpers'
import type { ExerciseType } from '@/lib/ml/form-coach'
import RepCounterModal from '@/components/workout/RepCounterModal'
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
    setCapturedExercises(exercises)
    setCapturedSeconds(seconds)
    setWorkoutStartedAt(Date.now() - seconds * 1000)
    setScreen('postdetails')
  }

  // ── Quick exercise flow (from home screen chips) ───────────────────────────

  function handleQuickExercise(name: string, type: ExerciseType) {
    setQuickExercise({ name, type })
  }

  function handleQuickExerciseConfirm(reps: number) {
    if (!quickExercise) return
    const entry: WorkoutExercise = {
      name: quickExercise.name,
      category: getCategory(quickExercise.name, catalogue),
      sets: [{ reps }],
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

  function handleQuickSave() {
    setShowQuickPostSet(false)
    setCapturedExercises(quickSets)
    setCapturedSeconds(0)
    setWorkoutStartedAt(Date.now())
    setQuickSets([])
    setScreen('postdetails')
  }

  function handleQuickToWorkout() {
    setShowQuickPostSet(false)
    ctxStart(quickSets)
    setQuickSets([])
    setScreen('active')
  }

  function handleQuickCancel() {
    setQuickExercise(null)
    setShowQuickPostSet(false)
    setQuickSets([])
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
    setCapturedExercises(snap)
    setCapturedSeconds(seconds)
    setCapturedCircuits(circuits.map(c => ({
      id: c.id,
      exerciseIndices: c.exerciseIndices,
      targetRounds: c.targetRounds,
      rounds: c.completedRounds,
    })))
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
        if (s.weightKg !== undefined) set.weightKg = s.weightKg
        if (s.bandKg !== undefined) set.bandKg = s.bandKg
        if (s.timedDurationSeconds !== undefined) set.timedDurationSeconds = s.timedDurationSeconds
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
    </div>
  )
}
