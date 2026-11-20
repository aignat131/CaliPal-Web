import type { Firestore } from 'firebase-admin/firestore'
import { sanitizeConfig, type ScheduleConfig } from '@/lib/schedule/availability'
import { sanitizePoints, type PlanPoints } from '@/lib/schedule/attendance'

export interface PlanConfig {
  hours: ScheduleConfig
  points: PlanPoints
}

export async function loadPlanConfig(db: Firestore, communityId: string): Promise<PlanConfig> {
  const snap = await db.doc(`communities/${communityId}/config/plan`).get()
  const data = snap.data()
  return { hours: sanitizeConfig(data), points: sanitizePoints(data?.points) }
}
