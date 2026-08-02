import {
  doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, runTransaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { createNotification } from '@/lib/firebase/notifications'

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
  | 'FIRST_BATTLE'
  | 'BATTLES_10'
  | 'BATTLE_WIN'

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
  FIRST_BATTLE: 20,
  BATTLES_10: 30,
  BATTLE_WIN: 15,
}

const TASK_NOTIF_LABELS: Partial<Record<CoinTask, string>> = {
  FIRST_WORKOUT: 'Primul antrenament completat!',
  STREAK_3: 'Streak de 3 zile!',
  STREAK_7: 'Streak de 7 zile!',
  STREAK_30: 'Streak de 30 de zile!',
  COMPLETE_ASSESSMENT: 'Evaluare completată!',
  JOIN_COMMUNITY: 'Te-ai alăturat unei comunități!',
  ADD_FRIEND: 'Ai adăugat un prieten!',
  WORKOUTS_10: '10 antrenamente totale!',
  WORKOUTS_50: '50 de antrenamente totale!',
  WORKOUTS_100: '100 de antrenamente totale!',
  SKILLS_5: '5 skill-uri deblocate!',
  SKILLS_10: '10 skill-uri deblocate!',
  FIRST_BATTLE: 'Prima luptă completată!',
  BATTLES_10: '10 lupte completate!',
}

/** Award coins for a task. One-time tasks are guarded by a `coin_tasks/{uid}_{task}` doc. */
export async function awardCoins(uid: string, task: CoinTask, amount?: number): Promise<number> {
  const coins = amount ?? COIN_AMOUNTS[task]
  if (coins <= 0) return 0

  const oneTimeTasks: CoinTask[] = [
    'FIRST_WORKOUT', 'STREAK_3', 'STREAK_7', 'STREAK_30',
    'COMPLETE_ASSESSMENT', 'JOIN_COMMUNITY', 'ADD_FRIEND',
    'WORKOUTS_10', 'WORKOUTS_50', 'WORKOUTS_100',
    'SKILLS_5', 'SKILLS_10',
    'FIRST_BATTLE', 'BATTLES_10',
  ]

  if (oneTimeTasks.includes(task)) {
    const guardRef = doc(db, 'coin_tasks', `${uid}_${task}`)
    const awarded = await runTransaction(db, async (tx) => {
      const snap = await tx.get(guardRef)
      if (snap.exists()) return false
      tx.set(guardRef, { uid, task, awardedAt: serverTimestamp() })
      tx.update(doc(db, 'users', uid), { coins: increment(coins) })
      return true
    })
    if (!awarded) return 0
  } else if (task === 'COMPLETE_WORKOUT' || task === 'BATTLE_WIN') {
    // Daily guard — only award once per day
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const dailyRef = doc(db, 'coin_tasks', `${uid}_${task}_${today}`)
    const snap = await getDoc(dailyRef)
    if (snap.exists()) return 0
    await setDoc(dailyRef, { uid, task, awardedAt: serverTimestamp() })
    await updateDoc(doc(db, 'users', uid), { coins: increment(coins) })
  } else {
    await updateDoc(doc(db, 'users', uid), { coins: increment(coins) })
  }

  // Send one-time in-app notification for task completion
  const label = TASK_NOTIF_LABELS[task]
  if (label) {
    createNotification(uid, 'TASK_COMPLETED', label, `+${coins} monede`, undefined, uid).catch(() => {})
  }

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

/**
 * Award 10 training attendance points to a community member per training.
 * No daily cap — each call awards 10 points (e.g. 2 trainings = 20 pts).
 */
export async function awardTrainingAttendancePoints(
  uid: string,
  communityId: string,
  { countAttendance = true }: { countAttendance?: boolean } = {},
): Promise<{ pointsAwarded: number }> {
  const memberRef = doc(db, 'communities', communityId, 'members', uid)

  await updateDoc(memberRef, {
    trainingPoints: increment(10),
    ...(countAttendance ? { totalTrainingsAttended: increment(1) } : {}),
  })

  return { pointsAwarded: 10 }
}

/** Check and award streak milestone coins. */
export async function checkStreakMilestones(uid: string, streak: number) {
  const promises: Promise<unknown>[] = []
  if (streak >= 3) promises.push(awardCoins(uid, 'STREAK_3'))
  if (streak >= 7) promises.push(awardCoins(uid, 'STREAK_7'))
  if (streak >= 30) promises.push(awardCoins(uid, 'STREAK_30'))
  await Promise.all(promises)
}

/** Check and award milestone coins after skills count changes. */
export async function checkSkillMilestones(uid: string, totalSkills: number) {
  const promises: Promise<unknown>[] = []
  if (totalSkills >= 5) promises.push(awardCoins(uid, 'SKILLS_5'))
  if (totalSkills >= 10) promises.push(awardCoins(uid, 'SKILLS_10'))
  await Promise.all(promises)
}

/** Check and award milestone coins after a battle completes. */
export async function checkBattleMilestones(uid: string, totalBattles: number) {
  const promises: Promise<unknown>[] = []
  if (totalBattles === 1) promises.push(awardCoins(uid, 'FIRST_BATTLE'))
  if (totalBattles >= 10) promises.push(awardCoins(uid, 'BATTLES_10'))
  await Promise.all(promises)
}
