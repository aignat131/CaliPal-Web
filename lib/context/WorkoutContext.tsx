'use client'

import { createContext, useContext, useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { WorkoutExercise } from '@/types'

interface WorkoutContextValue {
  isActive: boolean
  seconds: number
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
  const [exercises, setExercisesState] = useState<WorkoutExercise[]>([])
  const [note, setNoteState] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isActive])

  const startWorkout = useCallback((exs: WorkoutExercise[] = []) => {
    setExercisesState(exs)
    setNoteState('')
    setSeconds(0)
    setIsActive(true)
  }, [])

  const stopWorkout = useCallback(() => {
    setIsActive(false)
    setSeconds(0)
    setExercisesState([])
    setNoteState('')
  }, [])

  return (
    <WorkoutContext.Provider value={{
      isActive, seconds, exercises, note,
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
