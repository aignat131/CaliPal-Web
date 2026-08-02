'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { isRepValid } from './anti-cheat'
import type { BattleDoc, BattlePlayerDoc, BattleExerciseType } from './types'

const BATTLE_ID_KEY = 'calipal_battle_id'
const BATTLE_REPS_KEY = 'calipal_battle_reps'

export function useBattle(battleId: string) {
  const { user } = useAuth()
  const [battle, setBattle] = useState<BattleDoc | null>(null)
  const [players, setPlayers] = useState<BattlePlayerDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastRepTimeRef = useRef<number | null>(null)

  // ── Subscribe to battle document ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'battles', battleId), (snap) => {
      if (!snap.exists()) {
        setError('Lupta nu a fost găsită')
        setLoading(false)
        return
      }
      setBattle({ id: snap.id, ...snap.data() } as BattleDoc)
      setLoading(false)
    }, () => {
      setError('Eroare la conectare')
      setLoading(false)
    })
    return unsub
  }, [battleId])

  // ── Subscribe to players subcollection ────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'battles', battleId, 'players'),
      (snap) => {
        setPlayers(snap.docs.map(d => ({ ...d.data() } as BattlePlayerDoc)))
      },
    )
    return unsub
  }, [battleId])

  // ── localStorage crash recovery ───────────────────────────────────────────
  useEffect(() => {
    if (battle?.status === 'ACTIVE') {
      localStorage.setItem(BATTLE_ID_KEY, battleId)
    } else if (battle?.status === 'FINISHED' || battle?.status === 'CANCELLED') {
      localStorage.removeItem(BATTLE_ID_KEY)
      localStorage.removeItem(BATTLE_REPS_KEY)
    }
  }, [battle?.status, battleId])

  // ── Connection tracking ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !battle || battle.status === 'FINISHED' || battle.status === 'CANCELLED') return
    const playerRef = doc(db, 'battles', battleId, 'players', user.uid)

    const handleVisibility = () => {
      if (document.hidden) {
        updateDoc(playerRef, { isConnected: false }).catch(() => {})
      } else {
        updateDoc(playerRef, { isConnected: true }).catch(() => {})
      }
    }
    const handleUnload = () => {
      updateDoc(playerRef, { isConnected: false }).catch(() => {})
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [user, battle?.status, battleId])

  // ── Derived state ─────────────────────────────────────────────────────────
  const isHost = user?.uid === battle?.hostUid
  const myPlayer = useMemo(
    () => players.find(p => p.uid === user?.uid) ?? null,
    [players, user?.uid],
  )
  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => b.reps - a.reps),
    [players],
  )
  const winner = useMemo(() => {
    if (battle?.status !== 'FINISHED') return null
    return sortedPlayers[0] ?? null
  }, [battle?.status, sortedPlayers])

  const readyCount = useMemo(() => players.filter(p => p.isReady).length, [players])

  // ── Actions ───────────────────────────────────────────────────────────────

  const joinBattle = useCallback(async (displayName: string, photoUrl: string) => {
    if (!user) return
    const playerRef = doc(db, 'battles', battleId, 'players', user.uid)
    await import('firebase/firestore').then(({ setDoc }) =>
      setDoc(playerRef, {
        uid: user.uid,
        displayName,
        photoUrl,
        isReady: false,
        repMethod: 'MANUAL',
        joinedAt: serverTimestamp(),
        reps: 0,
        lastRepAt: null,
        isConnected: true,
        placement: null,
        coinsEarned: 0,
        finished: false,
      }),
    )
    await updateDoc(doc(db, 'battles', battleId), { playerCount: increment(1) })
  }, [user, battleId])

  const toggleReady = useCallback(async () => {
    if (!user || !myPlayer) return
    await updateDoc(doc(db, 'battles', battleId, 'players', user.uid), {
      isReady: !myPlayer.isReady,
    })
  }, [user, myPlayer, battleId])

  const setRepMethod = useCallback(async (method: 'CAMERA' | 'MANUAL') => {
    if (!user) return
    await updateDoc(doc(db, 'battles', battleId, 'players', user.uid), {
      repMethod: method,
    })
  }, [user, battleId])

  const startBattle = useCallback(async () => {
    if (!isHost) return
    await updateDoc(doc(db, 'battles', battleId), {
      status: 'COUNTDOWN',
      startAt: serverTimestamp(),
    })
  }, [isHost, battleId])

  const activateBattle = useCallback(async () => {
    if (!isHost) return
    await updateDoc(doc(db, 'battles', battleId), { status: 'ACTIVE' })
  }, [isHost, battleId])

  const finishBattle = useCallback(async (winnerId?: string) => {
    if (!isHost) return
    await updateDoc(doc(db, 'battles', battleId), {
      status: 'FINISHED',
      finishedAt: serverTimestamp(),
      winnerId: winnerId ?? null,
    })
  }, [isHost, battleId])

  const cancelBattle = useCallback(async () => {
    if (!isHost) return
    await updateDoc(doc(db, 'battles', battleId), { status: 'CANCELLED' })
  }, [isHost, battleId])

  const leaveBattle = useCallback(async () => {
    if (!user) return
    await deleteDoc(doc(db, 'battles', battleId, 'players', user.uid))
    await updateDoc(doc(db, 'battles', battleId), { playerCount: increment(-1) })
  }, [user, battleId])

  const incrementReps = useCallback(async (newCount: number) => {
    if (!user) return
    const exerciseType = battle?.exerciseType as BattleExerciseType | null
    if (!isRepValid(exerciseType, lastRepTimeRef.current)) return
    lastRepTimeRef.current = Date.now()

    localStorage.setItem(BATTLE_REPS_KEY, String(newCount))
    await updateDoc(doc(db, 'battles', battleId, 'players', user.uid), {
      reps: newCount,
      lastRepAt: serverTimestamp(),
    })
  }, [user, battleId, battle?.exerciseType])

  const markFinished = useCallback(async (placement: number, coinsEarned: number) => {
    if (!user) return
    await updateDoc(doc(db, 'battles', battleId, 'players', user.uid), {
      finished: true,
      placement,
      coinsEarned,
    })
  }, [user, battleId])

  return {
    battle,
    players,
    myPlayer,
    isHost,
    loading,
    error,
    sortedPlayers,
    winner,
    readyCount,

    joinBattle,
    toggleReady,
    setRepMethod,
    startBattle,
    activateBattle,
    finishBattle,
    cancelBattle,
    leaveBattle,
    incrementReps,
    markFinished,
  }
}

/** Check if we have an active battle saved from a crash. */
export function getRecoveredBattleId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(BATTLE_ID_KEY)
}

export function getRecoveredBattleReps(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(BATTLE_REPS_KEY) ?? '0', 10)
}

export function clearBattleRecovery() {
  localStorage.removeItem(BATTLE_ID_KEY)
  localStorage.removeItem(BATTLE_REPS_KEY)
}
