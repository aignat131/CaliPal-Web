import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'

/** ISO 8601 week ID (Monday-based), e.g. "2026-W31". */
export function getWeekId(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** Increment the current user's weekly push-up count on the global leaderboard. */
export async function updateWeeklyPushupLeaderboard(
  uid: string,
  displayName: string,
  photoUrl: string,
  pushupReps: number,
): Promise<void> {
  if (pushupReps <= 0) return
  const weekId = getWeekId()
  const entryRef = doc(db, 'weekly_leaderboard', weekId, 'entries', uid)
  await setDoc(entryRef, {
    uid,
    displayName,
    photoUrl,
    totalPushupReps: increment(pushupReps),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}
