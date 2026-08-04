'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  doc, collection, onSnapshot, updateDoc, deleteDoc,
  serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { isRepValid } from '@/lib/battle/anti-cheat'
import type { EventDoc, EventParticipantDoc } from './types'

const EVENT_ID_KEY = 'calipal_event_id'
const EVENT_REPS_KEY = 'calipal_event_reps'

/** Compute total points from reps map and exercise configs. */
function computeTotalPoints(
  reps: Record<string, number>,
  exercises: EventDoc['exercises'],
): number {
  let total = 0
  for (const ex of exercises) {
    total += (reps[ex.name] ?? 0) * ex.pointsPerRep
  }
  return total
}

export function useEvent(eventId: string) {
  const { user } = useAuth()
  const [event, setEvent] = useState<EventDoc | null>(null)
  const [participants, setParticipants] = useState<EventParticipantDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastRepTimeRefs = useRef<Record<string, number | null>>({})

  // ── Subscribe to event document ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'events', eventId), (snap) => {
      if (!snap.exists()) {
        setError('Evenimentul nu a fost găsit')
        setLoading(false)
        return
      }
      setEvent({ id: snap.id, ...snap.data() } as EventDoc)
      setLoading(false)
    }, () => {
      setError('Eroare la conectare')
      setLoading(false)
    })
    return unsub
  }, [eventId])

  // ── Subscribe to participants subcollection ──────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'events', eventId, 'participants'),
      (snap) => {
        setParticipants(snap.docs.map(d => ({ ...d.data() } as EventParticipantDoc)))
      },
    )
    return unsub
  }, [eventId])

  // ── localStorage crash recovery ──────────────────────────────────────────
  useEffect(() => {
    if (event?.status === 'ACTIVE') {
      localStorage.setItem(EVENT_ID_KEY, eventId)
    } else if (event?.status === 'FINISHED' || event?.status === 'CANCELLED') {
      localStorage.removeItem(EVENT_ID_KEY)
      localStorage.removeItem(EVENT_REPS_KEY)
    }
  }, [event?.status, eventId])

  // ── Connection tracking ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !event || event.status === 'FINISHED' || event.status === 'CANCELLED') return
    const participantRef = doc(db, 'events', eventId, 'participants', user.uid)

    const handleVisibility = () => {
      if (document.hidden) {
        updateDoc(participantRef, { isConnected: false }).catch(() => {})
      } else {
        updateDoc(participantRef, { isConnected: true }).catch(() => {})
      }
    }
    const handleUnload = () => {
      updateDoc(participantRef, { isConnected: false }).catch(() => {})
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [user, event?.status, eventId])

  // ── Derived state ────────────────────────────────────────────────────────
  const isHost = user?.uid === event?.hostUid
  const myParticipant = useMemo(
    () => participants.find(p => p.uid === user?.uid) ?? null,
    [participants, user?.uid],
  )
  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => b.totalPoints - a.totalPoints),
    [participants],
  )
  const winner = useMemo(() => {
    if (event?.status !== 'FINISHED') return null
    return sortedParticipants[0] ?? null
  }, [event?.status, sortedParticipants])

  // ── Actions ──────────────────────────────────────────────────────────────

  const joinEvent = useCallback(async (
    displayName: string,
    photoUrl: string,
    cosmetics?: { nameColor?: string; emojiBadge?: string; titleBadge?: string; profileFrame?: string },
  ) => {
    if (!user) return
    const participantRef = doc(db, 'events', eventId, 'participants', user.uid)
    await import('firebase/firestore').then(({ setDoc }) =>
      setDoc(participantRef, {
        uid: user.uid,
        displayName,
        photoUrl,
        joinedAt: serverTimestamp(),
        reps: {},
        totalPoints: 0,
        lastRepAt: null,
        isConnected: true,
        placement: null,
        coinsEarned: 0,
        ...(cosmetics?.nameColor ? { nameColor: cosmetics.nameColor } : {}),
        ...(cosmetics?.emojiBadge ? { emojiBadge: cosmetics.emojiBadge } : {}),
        ...(cosmetics?.titleBadge ? { titleBadge: cosmetics.titleBadge } : {}),
        ...(cosmetics?.profileFrame ? { profileFrame: cosmetics.profileFrame } : {}),
      }),
    )
    await updateDoc(doc(db, 'events', eventId), { participantCount: increment(1) })
  }, [user, eventId])

  const startEvent = useCallback(async () => {
    if (!isHost) return
    await updateDoc(doc(db, 'events', eventId), {
      status: 'COUNTDOWN',
      startedAt: serverTimestamp(),
    })
  }, [isHost, eventId])

  const activateEvent = useCallback(async () => {
    if (!isHost) return
    await updateDoc(doc(db, 'events', eventId), { status: 'ACTIVE' })
  }, [isHost, eventId])

  const finishEvent = useCallback(async () => {
    if (!isHost) return
    await updateDoc(doc(db, 'events', eventId), {
      status: 'FINISHED',
      finishedAt: serverTimestamp(),
    })
  }, [isHost, eventId])

  const cancelEvent = useCallback(async () => {
    if (!isHost) return
    await updateDoc(doc(db, 'events', eventId), { status: 'CANCELLED' })
  }, [isHost, eventId])

  const leaveEvent = useCallback(async () => {
    if (!user) return
    await deleteDoc(doc(db, 'events', eventId, 'participants', user.uid))
    await updateDoc(doc(db, 'events', eventId), { participantCount: increment(-1) })
  }, [user, eventId])

  const incrementExerciseReps = useCallback(async (exerciseName: string, newCount: number) => {
    if (!user || !event) return

    // Find exercise type for anti-cheat rate limiting
    const exerciseConfig = event.exercises.find(e => e.name === exerciseName)
    const exerciseType = exerciseConfig?.exerciseType ?? null
    const lastTime = lastRepTimeRefs.current[exerciseName] ?? null
    if (!isRepValid(exerciseType, lastTime)) return
    lastRepTimeRefs.current[exerciseName] = Date.now()

    // Compute new total points
    const currentReps = myParticipant?.reps ?? {}
    const updatedReps = { ...currentReps, [exerciseName]: newCount }
    const totalPoints = computeTotalPoints(updatedReps, event.exercises)

    // Save to localStorage for crash recovery
    localStorage.setItem(EVENT_REPS_KEY, JSON.stringify(updatedReps))

    await updateDoc(doc(db, 'events', eventId, 'participants', user.uid), {
      [`reps.${exerciseName}`]: newCount,
      totalPoints,
      lastRepAt: serverTimestamp(),
    })
  }, [user, eventId, event, myParticipant?.reps])

  const markFinished = useCallback(async (placement: number, coinsEarned: number) => {
    if (!user) return
    await updateDoc(doc(db, 'events', eventId, 'participants', user.uid), {
      placement,
      coinsEarned,
    })
  }, [user, eventId])

  return {
    event,
    participants,
    myParticipant,
    isHost,
    loading,
    error,
    sortedParticipants,
    winner,

    joinEvent,
    startEvent,
    activateEvent,
    finishEvent,
    cancelEvent,
    leaveEvent,
    incrementExerciseReps,
    markFinished,
  }
}

/** Check if we have an active event saved from a crash. */
export function getRecoveredEventId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(EVENT_ID_KEY)
}

export function getRecoveredEventReps(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(EVENT_REPS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function clearEventRecovery() {
  localStorage.removeItem(EVENT_ID_KEY)
  localStorage.removeItem(EVENT_REPS_KEY)
}
