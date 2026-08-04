'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  collection, doc, onSnapshot, query, orderBy, setDoc, updateDoc, deleteField,
  serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from './useAuth'
import { awardCoins } from '@/lib/gamification/coins'
import type { ProgramEnrollment } from '@/types'

export function useProgramEnrollment() {
  const { user } = useAuth()
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setEnrollments([]); setLoading(false); return }
    const q = query(
      collection(db, 'users', user.uid, 'program_enrollments'),
      orderBy('enrolledAt', 'desc'),
    )
    const unsub = onSnapshot(q, snap => {
      setEnrollments(snap.docs.map(d => ({ ...d.data(), programId: d.id }) as ProgramEnrollment))
      setLoading(false)
    }, () => { setLoading(false) })
    return unsub
  }, [user])

  const activeEnrollment = enrollments.find(e => e.status === 'active') ?? null

  const getEnrollment = useCallback(
    (programId: string) => enrollments.find(e => e.programId === programId) ?? null,
    [enrollments],
  )

  const enroll = useCallback(async (
    programId: string,
    programSource: 'hardcoded' | 'firestore',
    programName: string,
    totalWeeks: number,
    totalDays: number,
  ) => {
    if (!user) return
    const enrollment: Omit<ProgramEnrollment, 'programId'> = {
      programSource,
      programName,
      status: 'active',
      enrolledAt: serverTimestamp() as ProgramEnrollment['enrolledAt'],
      completedAt: null,
      currentWeek: 1,
      currentDay: 1,
      totalWeeks,
      totalDays,
      completedDays: 0,
      dayProgress: {},
      exerciseSwaps: {},
    }
    await setDoc(doc(db, 'users', user.uid, 'program_enrollments', programId), enrollment)
    await updateDoc(doc(db, 'users', user.uid), { activeProgramId: programId })
  }, [user])

  const abandon = useCallback(async (programId: string) => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'program_enrollments', programId), {
      status: 'abandoned',
    })
    await updateDoc(doc(db, 'users', user.uid), { activeProgramId: deleteField() })
  }, [user])

  const markDayComplete = useCallback(async (
    programId: string,
    week: number,
    day: number,
    workoutId: string,
  ) => {
    if (!user) return
    const key = `w${week}_d${day}`
    const enrollment = enrollments.find(e => e.programId === programId)
    if (!enrollment) return

    const alreadyDone = !!enrollment.dayProgress[key]
    const newCompletedDays = alreadyDone ? enrollment.completedDays : enrollment.completedDays + 1
    const isComplete = newCompletedDays >= enrollment.totalDays

    // Find next incomplete day position
    const { nextWeek, nextDay } = findNextDay(enrollment, week, day)

    const updates: Record<string, unknown> = {
      [`dayProgress.${key}`]: { completedAt: new Date().toISOString(), workoutId },
    }

    if (!alreadyDone) {
      updates.completedDays = increment(1)
    }

    if (isComplete) {
      updates.status = 'completed'
      updates.completedAt = serverTimestamp()
    } else {
      updates.currentWeek = nextWeek
      updates.currentDay = nextDay
    }

    await updateDoc(doc(db, 'users', user.uid, 'program_enrollments', programId), updates)

    if (isComplete) {
      await updateDoc(doc(db, 'users', user.uid), {
        activeProgramId: deleteField(),
        completedPrograms: increment(1),
      })
      await awardCoins(user.uid, 'COMPLETE_PROGRAM', undefined, programId)
    }
  }, [user, enrollments])

  const updateSwap = useCallback(async (
    programId: string,
    week: number,
    day: number,
    exerciseIndex: number,
    newName: string,
  ) => {
    if (!user) return
    const key = `w${week}_d${day}_e${exerciseIndex}`
    await updateDoc(doc(db, 'users', user.uid, 'program_enrollments', programId), {
      [`exerciseSwaps.${key}`]: newName,
    })
  }, [user])

  const removeSwap = useCallback(async (
    programId: string,
    week: number,
    day: number,
    exerciseIndex: number,
  ) => {
    if (!user) return
    const key = `w${week}_d${day}_e${exerciseIndex}`
    await updateDoc(doc(db, 'users', user.uid, 'program_enrollments', programId), {
      [`exerciseSwaps.${key}`]: deleteField(),
    })
  }, [user])

  const restartProgram = useCallback(async (programId: string) => {
    if (!user) return
    const enrollment = enrollments.find(e => e.programId === programId)
    if (!enrollment) return
    await updateDoc(doc(db, 'users', user.uid, 'program_enrollments', programId), {
      status: 'active',
      completedAt: null,
      currentWeek: 1,
      currentDay: 1,
      completedDays: 0,
      dayProgress: {},
      // Keep exerciseSwaps — user's preferred alternatives persist
    })
    await updateDoc(doc(db, 'users', user.uid), { activeProgramId: programId })
  }, [user, enrollments])

  return {
    enrollments,
    activeEnrollment,
    loading,
    getEnrollment,
    enroll,
    abandon,
    markDayComplete,
    updateSwap,
    removeSwap,
    restartProgram,
  }
}

/** Find the next incomplete day after the current one. */
function findNextDay(
  enrollment: ProgramEnrollment,
  currentWeek: number,
  currentDay: number,
): { nextWeek: number; nextDay: number } {
  // Simple advance: move to next day, wrapping weeks
  // Since we don't have the full program structure here, just advance linearly
  // The UI will handle showing the correct position based on the actual program data
  const totalWeeks = enrollment.totalWeeks
  let w = currentWeek
  let d = currentDay + 1

  // Simple heuristic: if day exceeds a reasonable bound, advance week
  // The actual day count per week varies, so we use a generous upper bound
  if (d > 7) {
    w++
    d = 1
  }
  if (w > totalWeeks) {
    w = totalWeeks
    d = currentDay
  }

  return { nextWeek: w, nextDay: d }
}
