import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { UserDoc, WorkoutDoc } from '@/types'
import { checkChallenges } from './challenges'

/**
 * Call right after a workout is saved: completes friend challenges the
 * workout satisfies. Never throws (must not break saving).
 */
export async function afterWorkoutSaved(uid: string, workoutId: string): Promise<void> {
  try {
    const [userSnap, workoutSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'users', uid, 'workouts', workoutId)),
    ])
    if (!workoutSnap.exists()) return
    const workout = { id: workoutSnap.id, ...workoutSnap.data() } as WorkoutDoc
    await checkChallenges(uid, workout, (userSnap.data() ?? {}) as Partial<UserDoc>)
  } catch (e) {
    console.warn('[challenges] post-workout check failed', e)
  }
}
