import type { MemberRole } from '@/types'

// Shapes returned by /api/community/[id]/availability — shared by route and UI.

export interface AvailabilityMemberRow {
  uid: string
  name: string
  photoUrl: string | null
  role: MemberRole
  mask: number[]
  source: 'override' | 'typical' | 'none'
  completed: boolean
  customized: boolean
  updatedAt: number | null
}

export interface AvailabilityOverviewResponse {
  ok: true
  week: string
  config: { startHour: number; endHour: number }
  canSeeNames: boolean
  respondents: number
  /** counts[day][hour], absolute hour 0–23 */
  counts: number[][]
  /** Only for staff. */
  members?: AvailabilityMemberRow[]
}
