'use client'
'workout context to manage workout state across the app'
import { createContext, useContext, useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { WorkoutExercise } from '@/types'

const STORAGE_KEY = 'calipal_workout_started_at'

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
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null)

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [exercises, setExercisesState] = useState<WorkoutExercise[]>([])
  const [note, setNoteState] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    localStorage.setItem(STORAGE_KEY, String(now))
  }, [])

  const stopWorkout = useCallback(() => {
    setIsActive(false)
    setSeconds(0)
    setStartedAt(null)
    setExercisesState([])
    setNoteState('')
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return (
    <WorkoutContext.Provider value={{
      isActive, seconds, startedAt, exercises, note,
      startWorkout, stopWorkout,
      setExercises: setExercisesState,
      setNote: setNoteState,
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
