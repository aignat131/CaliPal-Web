import {
  doc, updateDoc, increment, getDoc, setDoc, serverTimestamp, runTransaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'

function localDate(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

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
    'COMPLETE_ASSESSMENT', 'JOIN_COMMUNITY', 'ADD_FRIEND',
    'WORKOUTS_10', 'WORKOUTS_50', 'WORKOUTS_100',
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

/**
 * Award 10 training attendance points to a community member.
 * Enforces a per-community daily cap (max 10 pts/day).
 * Tracks a streak of consecutive attendance days with milestone bonuses.
 */
export async function awardTrainingAttendancePoints(
  uid: string,
  communityId: string,
): Promise<{ pointsAwarded: number; streakBonus: number; newStreak: number }> {
  const today = localDate(new Date())
  const yesterday = localDate(new Date(Date.now() - 86400000))
  const memberRef = doc(db, 'communities', communityId, 'members', uid)

  let pointsAwarded = 0
  let streakBonus = 0
  let newStreak = 0

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(memberRef)
    if (!snap.exists()) return

    const data = snap.data()
    const lastPointDate: string | undefined = data.lastTrainingPointDate
    const lastAttendDate: string | undefined = data.lastAttendanceDate
    const currentStreak: number = data.trainingAttendanceStreak ?? 0

    // Daily cap — already awarded today
    if (lastPointDate === today) {
      newStreak = currentStreak
      return
    }

    // Streak calculation
    newStreak = lastAttendDate === yesterday ? currentStreak + 1 : 1

    pointsAwarded = 10

    tx.update(memberRef, {
      points: increment(10),
      lastTrainingPointDate: today,
      lastAttendanceDate: today,
      trainingAttendanceStreak: newStreak,
      totalTrainingsAttended: increment(1),
    })
  })

  // Streak milestone bonuses (guarded against double-award)
  if (pointsAwarded > 0 && (newStreak === 3 || newStreak === 7 || newStreak === 30)) {
    const milestone = newStreak as 3 | 7 | 30
    const bonusAmounts: Record<3 | 7 | 30, number> = { 3: 5, 7: 15, 30: 50 }
    const guardRef = doc(db, 'training_streak_tasks', `${uid}_${communityId}_${milestone}`)
    const guardSnap = await getDoc(guardRef)
    if (!guardSnap.exists()) {
      await setDoc(guardRef, { uid, communityId, milestone, awardedAt: serverTimestamp() })
      const bonus = bonusAmounts[milestone]
      await updateDoc(memberRef, { points: increment(bonus) })
      streakBonus = bonus
    }
  }

  return { pointsAwarded, streakBonus, newStreak }
}

/** Check and award milestone coins after skills count changes. */
export async function checkSkillMilestones(uid: string, totalSkills: number) {
  const promises: Promise<unknown>[] = []
  if (totalSkills >= 5) promises.push(awardCoins(uid, 'SKILLS_5'))
  if (totalSkills >= 10) promises.push(awardCoins(uid, 'SKILLS_10'))
  await Promise.all(promises)
}
