'use client'

import { useEffect, useState, useRef } from 'react'
import type { Timestamp } from 'firebase/firestore'
import { COUNTDOWN_DURATION_MS } from './types'

interface UseBattleTimerReturn {
  timeRemaining: number     // seconds remaining (TIME_ATTACK)
  elapsed: number           // seconds elapsed since battle start
  isExpired: boolean
  countdownNumber: number | null  // 3, 2, 1, 0 (GO!) or null when not in countdown
}

/**
 * Manages the battle timer synced to Firestore serverTimestamp.
 * Timer only starts counting when cameraReady is true.
 */
export function useBattleTimer(
  status: string | undefined,
  startAt: Timestamp | null,
  timeLimitSeconds: number,
  cameraReady = true,
): UseBattleTimerReturn {
  const [elapsed, setElapsed] = useState(0)
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cameraReadyAtRef = useRef<number | null>(null)

  const battleStartMs = startAt ? startAt.toMillis() + COUNTDOWN_DURATION_MS : 0

  // Track when camera became ready
  useEffect(() => {
    if (cameraReady && !cameraReadyAtRef.current) {
      cameraReadyAtRef.current = Date.now()
    }
  }, [cameraReady])

  // Countdown phase (3-2-1-GO)
  useEffect(() => {
    if (status !== 'COUNTDOWN' || !startAt) {
      setCountdownNumber(null)
      return
    }

    const startMs = startAt.toMillis()

    function tick() {
      const now = Date.now()
      const elapsedMs = now - startMs
      if (elapsedMs < 1000) setCountdownNumber(3)
      else if (elapsedMs < 2000) setCountdownNumber(2)
      else if (elapsedMs < 3000) setCountdownNumber(1)
      else setCountdownNumber(0) // GO!
    }

    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [status, startAt])

  // Active phase timer — only counts when camera is ready
  useEffect(() => {
    if (status !== 'ACTIVE' || !battleStartMs || !cameraReady) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    // Timer starts from when camera became ready, not from battle start
    const effectiveStart = cameraReadyAtRef.current
      ? Math.max(battleStartMs, cameraReadyAtRef.current)
      : battleStartMs

    function tick() {
      const now = Date.now()
      const elapsedSec = Math.floor((now - effectiveStart) / 1000)
      setElapsed(Math.max(0, elapsedSec))
    }

    tick()
    intervalRef.current = setInterval(tick, 200)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [status, battleStartMs, cameraReady])

  const timeRemaining = Math.max(0, timeLimitSeconds - elapsed)
  const isExpired = status === 'ACTIVE' && cameraReady && timeRemaining <= 0

  return { timeRemaining, elapsed, isExpired, countdownNumber }
}
