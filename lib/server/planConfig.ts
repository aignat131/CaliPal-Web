import type { Firestore } from 'firebase-admin/firestore'
import { sanitizePoints, type PlanPoints } from '@/lib/schedule/attendance'

export interface PlanConfig {
  points: PlanPoints
}

export async function loadPlanConfig(db: Firestore, communityId: string): Promise<PlanConfig> {
  const snap = await db.doc(`communities/${communityId}/config/plan`).get()
  return { points: sanitizePoints(snap.data()?.points) }
}
