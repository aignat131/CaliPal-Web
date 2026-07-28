'use client'
'workout context to manage workout state across the app'
import { createContext, useContext, useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { WorkoutExercise, CircuitRound } from '@/types'

const STORAGE_KEY = 'calipal_workout_started_at'
const CIRCUITS_STORAGE_KEY = 'calipal_workout_circuits'
const TIMED_SET_STORAGE_KEY = 'calipal_workout_timed_set'
const EXERCISES_STORAGE_KEY = 'calipal_workout_exercises'
const NOTE_STORAGE_KEY = 'calipal_workout_note'
const DONE_KEYS_STORAGE_KEY = 'calipal_workout_done_keys'
const PAUSED_ELAPSED_KEY = 'calipal_workout_paused_elapsed'
const LAST_ACTIVE_KEY = 'calipal_workout_last_active'

// ── Active circuit state (live during workout) ──────────────────────────────

export interface ActiveCircuit {
  id: string
  exerciseIndices: number[]
  targetRounds: number
  completedRounds: CircuitRound[]
  currentRoundStartedAt: number | null
}

// ── Active timed set state ──────────────────────────────────────────────────

export interface ActiveTimedSet {
  exerciseIndex: number
  setIndex: number
  targetDurationSeconds: number
  startedAt: number | null
}

interface WorkoutContextValue {
  isActive: boolean
  isPaused: boolean
  seconds: number
  startedAt: number | null
  exercises: WorkoutExercise[]
  note: string
  doneKeys: Set<string>
  startWorkout: (exs?: WorkoutExercise[], elapsedOffsetMs?: number) => void
  stopWorkout: () => void
  pauseWorkout: () => void
  resumeWorkout: () => void
  setExercises: (exs: WorkoutExercise[]) => void
  setNote: (note: string) => void
  toggleDoneKey: (ei: number, si: number) => void
  // Circuits
  circuits: ActiveCircuit[]
  addCircuit: (exerciseIndices: number[], targetRounds: number) => void
  removeCircuit: (circuitId: string) => void
  startCircuitRound: (circuitId: string) => void
  completeCircuitRound: (circuitId: string) => void
  updateCircuitIndicesOnRemove: (removedIndex: number) => void
  // Timed sets
  activeTimedSet: ActiveTimedSet | null
  startTimedSet: (exerciseIndex: number, setIndex: number, targetDurationSeconds: number) => void
  clearTimedSet: () => void
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null)

let circuitIdCounter = 0

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [exercises, setExercisesState] = useState<WorkoutExercise[]>([])
  const [note, setNoteState] = useState('')
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(false)

  // Circuit & timed set state
  const [circuits, setCircuits] = useState<ActiveCircuit[]>([])
  const [activeTimedSet, setActiveTimedSet] = useState<ActiveTimedSet | null>(null)

  // ── Wrapped setters that also persist to localStorage ─────────────────────

  const setExercises = useCallback((exs: WorkoutExercise[]) => {
    setExercisesState(exs)
    if (exs.length > 0) {
      localStorage.setItem(EXERCISES_STORAGE_KEY, JSON.stringify(exs))
    } else {
      localStorage.removeItem(EXERCISES_STORAGE_KEY)
    }
  }, [])

  const setNote = useCallback((n: string) => {
    setNoteState(n)
    if (n) {
      localStorage.setItem(NOTE_STORAGE_KEY, n)
    } else {
      localStorage.removeItem(NOTE_STORAGE_KEY)
    }
  }, [])

  const toggleDoneKey = useCallback((ei: number, si: number) => {
    setDoneKeys(prev => {
      const next = new Set(prev)
      const key = `${ei}-${si}`
      if (next.has(key)) next.delete(key); else next.add(key)
      localStorage.setItem(DONE_KEYS_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  // ── Restore everything from localStorage on mount ─────────────────────────

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) { mountedRef.current = true; return }

    const ts = parseInt(stored, 10)
    if (isNaN(ts)) { mountedRef.current = true; return }

    // Restore exercises
    const storedExercises = localStorage.getItem(EXERCISES_STORAGE_KEY)
    if (storedExercises) {
      try { setExercisesState(JSON.parse(storedExercises)) } catch { /* ignore */ }
    }
    // Restore note
    const storedNote = localStorage.getItem(NOTE_STORAGE_KEY)
    if (storedNote) setNoteState(storedNote)
    // Restore done keys
    const storedDoneKeys = localStorage.getItem(DONE_KEYS_STORAGE_KEY)
    if (storedDoneKeys) {
      try { setDoneKeys(new Set(JSON.parse(storedDoneKeys))) } catch { /* ignore */ }
    }
    // Restore circuits
    const storedCircuits = localStorage.getItem(CIRCUITS_STORAGE_KEY)
    if (storedCircuits) {
      try { setCircuits(JSON.parse(storedCircuits)) } catch { /* ignore */ }
    }
    // Restore active timed set
    const storedTimed = localStorage.getItem(TIMED_SET_STORAGE_KEY)
    if (storedTimed) {
      try { setActiveTimedSet(JSON.parse(storedTimed)) } catch { /* ignore */ }
    }

    const storedPaused = localStorage.getItem(PAUSED_ELAPSED_KEY)

    if (storedPaused) {
      // Was explicitly paused — restore paused state
      const elapsed = parseInt(storedPaused, 10)
      setStartedAt(ts)
      setIsActive(true)
      setIsPaused(true)
      setSeconds(isNaN(elapsed) ? 0 : elapsed)
    } else {
      // Check if the user has been away too long (>2 hours) — auto-pause to avoid absurd timer values
      const lastActiveStr = localStorage.getItem(LAST_ACTIVE_KEY)
      const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : Date.now()
      const gap = Date.now() - lastActive

      if (gap > 2 * 60 * 60 * 1000) {
        // Auto-pause: freeze elapsed at (lastActive - startedAt)
        const elapsed = Math.max(0, Math.floor((lastActive - ts) / 1000))
        setStartedAt(ts)
        setIsActive(true)
        setIsPaused(true)
        setSeconds(elapsed)
        localStorage.setItem(PAUSED_ELAPSED_KEY, String(elapsed))
      } else {
        // Timer keeps running from original startedAt — no auto-pause
        setStartedAt(ts)
        setIsActive(true)
        setSeconds(Math.floor((Date.now() - ts) / 1000))
      }
    }

    mountedRef.current = true
  }, [])

  // Persist circuits to localStorage whenever they change
  useEffect(() => {
    if (!mountedRef.current) return
    if (circuits.length > 0) {
      localStorage.setItem(CIRCUITS_STORAGE_KEY, JSON.stringify(circuits))
    } else {
      localStorage.removeItem(CIRCUITS_STORAGE_KEY)
    }
  }, [circuits])

  // Persist active timed set
  useEffect(() => {
    if (!mountedRef.current) return
    if (activeTimedSet) {
      localStorage.setItem(TIMED_SET_STORAGE_KEY, JSON.stringify(activeTimedSet))
    } else {
      localStorage.removeItem(TIMED_SET_STORAGE_KEY)
    }
  }, [activeTimedSet])

  // Timer: compute elapsed from startedAt on every tick instead of incrementing a counter.
  // This prevents drift when the phone screen turns off (JS timers freeze/throttle in background).
  // Timer does NOT run when paused.
  useEffect(() => {
    if (isActive && !isPaused && startedAt !== null) {
      const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000))
      tick() // sync immediately when starting or resuming
      timerRef.current = setInterval(tick, 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isActive, isPaused, startedAt])

  // Re-sync timer on visibility restore
  useEffect(() => {
    const handleVisibility = () => {
      if (!isActive || startedAt === null) return

      if (document.hidden) {
        localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
      } else if (!isPaused) {
        // User came back — re-sync timer (no auto-pause)
        setSeconds(Math.floor((Date.now() - startedAt) / 1000))
      }
    }

    // Also record lastActive on beforeunload (browser/tab close)
    const handleUnload = () => {
      if (isActive) {
        localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [isActive, isPaused, startedAt])

  const clearAllStorage = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(CIRCUITS_STORAGE_KEY)
    localStorage.removeItem(TIMED_SET_STORAGE_KEY)
    localStorage.removeItem(EXERCISES_STORAGE_KEY)
    localStorage.removeItem(NOTE_STORAGE_KEY)
    localStorage.removeItem(DONE_KEYS_STORAGE_KEY)
    localStorage.removeItem(PAUSED_ELAPSED_KEY)
    localStorage.removeItem(LAST_ACTIVE_KEY)
  }, [])

  const startWorkout = useCallback((exs: WorkoutExercise[] = [], elapsedOffsetMs = 0) => {
    const now = Date.now() - elapsedOffsetMs
    setExercisesState(exs)
    setNoteState('')
    setDoneKeys(new Set())
    setStartedAt(now)
    setIsActive(true)
    setIsPaused(false)
    setSeconds(Math.floor(elapsedOffsetMs / 1000))
    setCircuits([])
    setActiveTimedSet(null)
    clearAllStorage()
    localStorage.setItem(STORAGE_KEY, String(now))
    if (exs.length > 0) {
      localStorage.setItem(EXERCISES_STORAGE_KEY, JSON.stringify(exs))
    }
  }, [clearAllStorage])

  const stopWorkout = useCallback(() => {
    setIsActive(false)
    setIsPaused(false)
    setSeconds(0)
    setStartedAt(null)
    setExercisesState([])
    setNoteState('')
    setDoneKeys(new Set())
    setCircuits([])
    setActiveTimedSet(null)
    clearAllStorage()
  }, [clearAllStorage])

  const pauseWorkout = useCallback(() => {
    if (!isActive || isPaused) return
    setIsPaused(true)
    // Freeze seconds at current value
    const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : seconds
    setSeconds(elapsed)
    localStorage.setItem(PAUSED_ELAPSED_KEY, String(elapsed))
  }, [isActive, isPaused, startedAt, seconds])

  const resumeWorkout = useCallback(() => {
    if (!isActive || !isPaused) return
    // Adjust startedAt so the timer continues from the paused elapsed time
    const newStart = Date.now() - seconds * 1000
    setStartedAt(newStart)
    setIsPaused(false)
    localStorage.setItem(STORAGE_KEY, String(newStart))
    localStorage.removeItem(PAUSED_ELAPSED_KEY)
    localStorage.removeItem(LAST_ACTIVE_KEY)
  }, [isActive, isPaused, seconds])

  // ── Circuit methods ───────────────────────────────────────────────────────

  const addCircuit = useCallback((exerciseIndices: number[], targetRounds: number) => {
    const id = `circuit_${Date.now()}_${circuitIdCounter++}`
    setCircuits(prev => [...prev, {
      id,
      exerciseIndices,
      targetRounds,
      completedRounds: [],
      currentRoundStartedAt: null,
    }])
  }, [])

  const removeCircuit = useCallback((circuitId: string) => {
    setCircuits(prev => prev.filter(c => c.id !== circuitId))
  }, [])

  const startCircuitRound = useCallback((circuitId: string) => {
    setCircuits(prev => prev.map(c =>
      c.id === circuitId ? { ...c, currentRoundStartedAt: Date.now() } : c
    ))
  }, [])

  const completeCircuitRound = useCallback((circuitId: string) => {
    setCircuits(prev => prev.map(c => {
      if (c.id !== circuitId || c.currentRoundStartedAt === null) return c
      const elapsed = Math.floor((Date.now() - c.currentRoundStartedAt) / 1000)
      return {
        ...c,
        completedRounds: [...c.completedRounds, {
          roundNumber: c.completedRounds.length + 1,
          durationSeconds: elapsed,
        }],
        currentRoundStartedAt: null,
      }
    }))
  }, [])

  const updateCircuitIndicesOnRemove = useCallback((removedIndex: number) => {
    setCircuits(prev => prev
      .map(c => ({
        ...c,
        exerciseIndices: c.exerciseIndices
          .filter(i => i !== removedIndex)
          .map(i => i > removedIndex ? i - 1 : i),
      }))
      .filter(c => c.exerciseIndices.length >= 2)
    )
  }, [])

  // ── Timed set methods ─────────────────────────────────────────────────────

  const startTimedSet = useCallback((exerciseIndex: number, setIndex: number, targetDurationSeconds: number) => {
    setActiveTimedSet({
      exerciseIndex,
      setIndex,
      targetDurationSeconds,
      startedAt: Date.now(),
    })
  }, [])

  const clearTimedSet = useCallback(() => {
    setActiveTimedSet(null)
  }, [])

  return (
    <WorkoutContext.Provider value={{
      isActive, isPaused, seconds, startedAt, exercises, note, doneKeys,
      startWorkout, stopWorkout, pauseWorkout, resumeWorkout,
      setExercises, setNote, toggleDoneKey,
      circuits, addCircuit, removeCircuit, startCircuitRound, completeCircuitRound, updateCircuitIndicesOnRemove,
      activeTimedSet, startTimedSet, clearTimedSet,
    }}>
      {children}
    </WorkoutContext.Provider>
  )
}

export function useWorkout() {
  const ctx = useContext(WorkoutContext)
  if (!ctx) throw new Error('useWorkout must be used within WorkoutProvider')
  return ctx
}
