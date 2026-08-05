'use client'

import { useEffect, useRef, useCallback } from 'react'
import { doc, updateDoc, setDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { getBotProfiles, isBotUid } from './bot-profiles'
import { getNextRepDelay } from './bot-behavior'
import type { BotDifficulty } from './bot-behavior'
import type { BattleDoc, BattlePlayerDoc } from '@/lib/battle/types'

/**
 * Hook that simulates bot rep counting during an active battle.
 * Only runs on the host's browser.
 */
export function useBattleBots(
  battleId: string,
  battle: BattleDoc | null,
  isHost: boolean,
  players: BattlePlayerDoc[],
) {
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const repsRef = useRef<Map<string, number>>(new Map())
  const stoppedRef = useRef(false)

  const clearAllTimers = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer)
    }
    timersRef.current.clear()
  }, [])

  // Sync current bot reps from Firestore snapshot
  useEffect(() => {
    for (const p of players) {
      if (isBotUid(p.uid)) {
        repsRef.current.set(p.uid, p.reps)
      }
    }
  }, [players])

  // Main bot simulation loop
  useEffect(() => {
    if (!isHost || !battle) return
    if (battle.status !== 'ACTIVE') {
      clearAllTimers()
      return
    }

    const botCount = battle.botCount ?? 0
    const difficulty = (battle.botDifficulty ?? 'MEDIUM') as BotDifficulty
    const exerciseType = battle.exerciseType
    const targetReps = battle.gameMode === 'RACE_TO_TARGET' ? battle.targetReps : null
    stoppedRef.current = false

    function scheduleBotRep(botUid: string) {
      if (stoppedRef.current) return

      const currentReps = repsRef.current.get(botUid) ?? 0

      // Stop if target reached (RACE_TO_TARGET mode)
      if (targetReps && currentReps >= targetReps) return

      const delay = getNextRepDelay(exerciseType, difficulty, currentReps)

      const timer = setTimeout(async () => {
        if (stoppedRef.current) return

        const newReps = (repsRef.current.get(botUid) ?? 0) + 1
        repsRef.current.set(botUid, newReps)

        try {
          await updateDoc(doc(db, 'battles', battleId, 'players', botUid), {
            reps: newReps,
            lastRepAt: serverTimestamp(),
          })
        } catch {
          // Battle may have ended
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
  }, [isHost, battle?.status, battle?.botCount, battle?.botDifficulty, battle?.exerciseType, battle?.gameMode, battle?.targetReps, battleId, clearAllTimers])
}

/**
 * Add bot players to a battle lobby.
 * Called after the host creates the battle and joins.
 */
export async function addBotsToBattle(
  battleId: string,
  botCount: number,
  difficulty: BotDifficulty,
) {
  const bots = getBotProfiles(botCount)

  for (const bot of bots) {
    await setDoc(doc(db, 'battles', battleId, 'players', bot.uid), {
      uid: bot.uid,
      displayName: bot.displayName,
      photoUrl: bot.photoUrl,
      isReady: true,
      repMethod: 'CAMERA',
      joinedAt: serverTimestamp(),
      reps: 0,
      lastRepAt: null,
      isConnected: true,
      placement: null,
      coinsEarned: 0,
      finished: false,
    })
    await updateDoc(doc(db, 'battles', battleId), {
      playerCount: increment(1),
    })
  }
}

/**
 * Remove all bot players from a battle.
 */
export async function removeBotsFromBattle(battleId: string, players: BattlePlayerDoc[]) {
  const bots = players.filter(p => isBotUid(p.uid))
  for (const bot of bots) {
    await deleteDoc(doc(db, 'battles', battleId, 'players', bot.uid))
    await updateDoc(doc(db, 'battles', battleId), {
      playerCount: increment(-1),
    })
  }
}
