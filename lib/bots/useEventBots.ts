'use client'

import { useEffect, useRef, useCallback } from 'react'
import { doc, updateDoc, setDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { getBotProfiles, isBotUid } from './bot-profiles'
import { getNextRepDelay } from './bot-behavior'
import type { BotDifficulty } from './bot-behavior'
import type { EventDoc, EventParticipantDoc, EventExerciseConfig } from '@/lib/event/types'

/** Compute total points from reps map and exercise configs. */
function computeTotalPoints(
  reps: Record<string, number>,
  exercises: EventExerciseConfig[],
): number {
  let total = 0
  for (const ex of exercises) {
    total += (reps[ex.name] ?? 0) * ex.pointsPerRep
  }
  return total
}

/** Pick a random exercise for a bot to do next, slightly favoring higher-point exercises. */
function pickExercise(exercises: EventExerciseConfig[]): EventExerciseConfig {
  // Weight by pointsPerRep (higher points = slightly more likely)
  const weights = exercises.map(ex => ex.pointsPerRep + 1)
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * totalWeight
  for (let i = 0; i < exercises.length; i++) {
    r -= weights[i]
    if (r <= 0) return exercises[i]
  }
  return exercises[0]
}

/**
 * Hook that simulates bot rep counting during an active event.
 * Only runs on the host's browser.
 */
export function useEventBots(
  eventId: string,
  event: EventDoc | null,
  isHost: boolean,
  participants: EventParticipantDoc[],
) {
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const repsRef = useRef<Map<string, Record<string, number>>>(new Map())
  const stoppedRef = useRef(false)
  const exercisesRef = useRef(event?.exercises ?? [])

  const clearAllTimers = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer)
    }
    timersRef.current.clear()
  }, [])

  // Keep exercises ref in sync
  useEffect(() => {
    if (event?.exercises) exercisesRef.current = event.exercises
  }, [event?.exercises])

  // Sync current bot reps from Firestore snapshot
  useEffect(() => {
    for (const p of participants) {
      if (isBotUid(p.uid)) {
        repsRef.current.set(p.uid, { ...(p.reps ?? {}) })
      }
    }
  }, [participants])

  // Main bot simulation loop
  useEffect(() => {
    if (!isHost || !event) return
    if (event.status !== 'ACTIVE') {
      clearAllTimers()
      return
    }

    const botCount = event.botCount ?? 0
    const difficulty = (event.botDifficulty ?? 'MEDIUM') as BotDifficulty
    const exercises = exercisesRef.current
    if (exercises.length === 0) return
    stoppedRef.current = false

    function scheduleBotRep(botUid: string) {
      if (stoppedRef.current) return

      const botReps = repsRef.current.get(botUid) ?? {}
      const totalReps = Object.values(botReps).reduce((s, v) => s + v, 0)

      // Pick which exercise this bot will do next
      const exercise = pickExercise(exercises)
      const exerciseType = exercise.exerciseType
      const delay = getNextRepDelay(exerciseType, difficulty, totalReps)

      const timer = setTimeout(async () => {
        if (stoppedRef.current) return

        const currentBotReps = repsRef.current.get(botUid) ?? {}
        const newExReps = (currentBotReps[exercise.name] ?? 0) + 1
        const updatedReps = { ...currentBotReps, [exercise.name]: newExReps }
        repsRef.current.set(botUid, updatedReps)

        const totalPoints = computeTotalPoints(updatedReps, exercises)

        try {
          await updateDoc(doc(db, 'events', eventId, 'participants', botUid), {
            [`reps.${exercise.name}`]: newExReps,
            totalPoints,
            lastRepAt: serverTimestamp(),
          })
        } catch {
          // Event may have ended
          return
        }

        scheduleBotRep(botUid)
      }, delay)

      timersRef.current.set(botUid, timer)
    }

    // Start simulation for each bot
    const botProfiles = getBotProfiles(botCount)
    for (const bot of botProfiles) {
      scheduleBotRep(bot.uid)
    }

    return () => {
      stoppedRef.current = true
      clearAllTimers()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, event?.status, event?.botCount, event?.botDifficulty, eventId, clearAllTimers])
}

/**
 * Add bot participants to an event lobby.
 * Called after the host creates the event and joins.
 */
export async function addBotsToEvent(
  eventId: string,
  botCount: number,
) {
  const bots = getBotProfiles(botCount)

  for (const bot of bots) {
    await setDoc(doc(db, 'events', eventId, 'participants', bot.uid), {
      uid: bot.uid,
      displayName: bot.displayName,
      photoUrl: bot.photoUrl,
      joinedAt: serverTimestamp(),
      reps: {},
      totalPoints: 0,
      lastRepAt: null,
      isConnected: true,
      placement: null,
      coinsEarned: 0,
    })
    await updateDoc(doc(db, 'events', eventId), {
      participantCount: increment(1),
    })
  }
}

/**
 * Remove all bot participants from an event.
 */
export async function removeBotsFromEvent(eventId: string, participants: EventParticipantDoc[]) {
  const bots = participants.filter(p => isBotUid(p.uid))
  for (const bot of bots) {
    await deleteDoc(doc(db, 'events', eventId, 'participants', bot.uid))
    await updateDoc(doc(db, 'events', eventId), {
      participantCount: increment(-1),
    })
  }
}
