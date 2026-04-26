import {
  doc, updateDoc, increment, collection, addDoc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'

export type CoinTask =
  | 'FIRST_WORKOUT'
  | 'COMPLETE_WORKOUT'
  | 'STREAK_3'
  | 'STREAK_7'
  | 'STREAK_30'
  | 'COMPLETE_ASSESSMENT'
  | 'JOIN_COMMUNITY'
  | 'ADD_FRIEND'
  | 'WORKOUTS_10'
  | 'WORKOUTS_50'
  | 'WORKOUTS_100'
  | 'WEEKLY_CHALLENGE'
  | 'SKILL_UNLOCKED'
  | 'SKILLS_5'
  | 'SKILLS_10'

const COIN_AMOUNTS: Record<CoinTask, number> = {
  FIRST_WORKOUT: 20,
  COMPLETE_WORKOUT: 10,
  STREAK_3: 15,
  STREAK_7: 50,
  STREAK_30: 200,
  COMPLETE_ASSESSMENT: 25,
  JOIN_COMMUNITY: 5,
  ADD_FRIEND: 5,
  WORKOUTS_10: 30,
  WORKOUTS_50: 100,
  WORKOUTS_100: 250,
  WEEKLY_CHALLENGE: 0, // varies by challenge
  SKILL_UNLOCKED: 0, // varies by skill
  SKILLS_5: 30,
  SKILLS_10: 75,
}

/** Award coins for a task. One-time tasks are guarded by a `coin_tasks/{uid}_{task}` doc. */
export async function awardCoins(uid: string, task: CoinTask, amount?: number): Promise<number> {
  const coins = amount ?? COIN_AMOUNTS[task]
  if (coins <= 0) return 0

  const oneTimeTasks: CoinTask[] = [
    'FIRST_WORKOUT', 'STREAK_3', 'STREAK_7', 'STREAK_30',
    'COMPLETE_ASSESSMENT', 'WORKOUTS_10', 'WORKOUTS_50', 'WORKOUTS_100',
    'SKILLS_5', 'SKILLS_10',
  ]

  if (oneTimeTasks.includes(task)) {
    const guardRef = doc(db, 'coin_tasks', `${uid}_${task}`)
    const snap = await getDoc(guardRef)
    if (snap.exists()) return 0
    await setDoc(guardRef, { uid, task, awardedAt: serverTimestamp() })
  }

  await updateDoc(doc(db, 'users', uid), { coins: increment(coins) })
  return coins
}

/** Check and award milestone coins after a workout is saved. */
export async function checkWorkoutMilestones(uid: string, newTotal: number) {
  const promises: Promise<unknown>[] = []
  if (newTotal === 1) promises.push(awardCoins(uid, 'FIRST_WORKOUT'))
  if (newTotal >= 10) promises.push(awardCoins(uid, 'WORKOUTS_10'))
  if (newTotal >= 50) promises.push(awardCoins(uid, 'WORKOUTS_50'))
  if (newTotal >= 100) promises.push(awardCoins(uid, 'WORKOUTS_100'))
  await Promise.all(promises)
}

/** Check and award milestone coins after skills count changes. */
export async function checkSkillMilestones(uid: string, totalSkills: number) {
  const promises: Promise<unknown>[] = []
  if (totalSkills >= 5) promises.push(awardCoins(uid, 'SKILLS_5'))
  if (totalSkills >= 10) promises.push(awardCoins(uid, 'SKILLS_10'))
  await Promise.all(promises)
}
