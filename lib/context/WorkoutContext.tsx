'use client'
'workout context to manage workout state across the app'
import { createContext, useContext, useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { WorkoutExercise, CircuitRound } from '@/types'

const STORAGE_KEY = 'calipal_workout_started_at'
const CIRCUITS_STORAGE_KEY = 'calipal_workout_circuits'
const TIMED_SET_STORAGE_KEY = 'calipal_workout_timed_set'

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
  seconds: number
  startedAt: number | null
  exercises: WorkoutExercise[]
  note: string
  startWorkout: (exs?: WorkoutExercise[]) => void
  stopWorkout: () => void
  setExercises: (exs: WorkoutExercise[]) => void
  setNote: (note: string) => void
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
  const [seconds, setSeconds] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [exercises, setExercisesState] = useState<WorkoutExercise[]>([])
  const [note, setNoteState] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Circuit & timed set state
  const [circuits, setCircuits] = useState<ActiveCircuit[]>([])
  const [activeTimedSet, setActiveTimedSet] = useState<ActiveTimedSet | null>(null)

  // Restore timer from localStorage on mount — handles page reload while workout is active
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const ts = parseInt(stored, 10)
      if (!isNaN(ts)) {
        setStartedAt(ts)
        setIsActive(true)
        setSeconds(Math.floor((Date.now() - ts) / 1000))
      }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist circuits to localStorage whenever they change
  useEffect(() => {
    if (circuits.length > 0) {
      localStorage.setItem(CIRCUITS_STORAGE_KEY, JSON.stringify(circuits))
    } else {
      localStorage.removeItem(CIRCUITS_STORAGE_KEY)
    }
  }, [circuits])

  // Persist active timed set
  useEffect(() => {
    if (activeTimedSet) {
      localStorage.setItem(TIMED_SET_STORAGE_KEY, JSON.stringify(activeTimedSet))
    } else {
      localStorage.removeItem(TIMED_SET_STORAGE_KEY)
    }
  }, [activeTimedSet])

  // Timer: compute elapsed from startedAt on every tick instead of incrementing a counter.
  // This prevents drift when the phone screen turns off (JS timers freeze/throttle in background).
  useEffect(() => {
    if (isActive && startedAt !== null) {
      const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000))
      tick() // sync immediately when starting or resuming
      timerRef.current = setInterval(tick, 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isActive, startedAt])

  // Re-sync the second count whenever the screen wakes up or the tab becomes visible again
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && isActive && startedAt !== null) {
        setSeconds(Math.floor((Date.now() - startedAt) / 1000))
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isActive, startedAt])

  const startWorkout = useCallback((exs: WorkoutExercise[] = []) => {
    const now = Date.now()
    setExercisesState(exs)
    setNoteState('')
    setStartedAt(now)
    setIsActive(true)
    setSeconds(0)
    setCircuits([])
    setActiveTimedSet(null)
    localStorage.setItem(STORAGE_KEY, String(now))
    localStorage.removeItem(CIRCUITS_STORAGE_KEY)
    localStorage.removeItem(TIMED_SET_STORAGE_KEY)
  }, [])

  const stopWorkout = useCallback(() => {
    setIsActive(false)
    setSeconds(0)
    setStartedAt(null)
    setExercisesState([])
    setNoteState('')
    setCircuits([])
    setActiveTimedSet(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(CIRCUITS_STORAGE_KEY)
    localStorage.removeItem(TIMED_SET_STORAGE_KEY)
  }, [])

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
      isActive, seconds, startedAt, exercises, note,
      startWorkout, stopWorkout,
      setExercises: setExercisesState,
      setNote: setNoteState,
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
