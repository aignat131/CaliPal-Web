import type { MemberRole } from '@/types'

/**
 * Capability matrix for the community schedule / coaching features.
 * Used by API routes (authoritative) and by the UI (to hide controls).
 * Keep in sync with firestore.rules (isCommunityStaff / isCommunityCoach).
 *
 *   Fondator (ADMIN)     — everything
 *   Antrenor (TRAINER)   — everything
 *   Voluntar (MODERATOR) — overview, attendance, reminders; no exercises/sessions/config/member file
 *   Membru (MEMBER)      — own data only; heatmap as numbers
 */
export type ScheduleAction =
  | 'viewOverviewNames'   // see who is available in each slot + completion status
  | 'sendReminders'
  | 'configureSchedule'   // hour range, points, test metrics
  | 'createSessions'
  | 'manageTemplates'
  | 'markAttendance'
  | 'assignExercises'
  | 'viewMemberFile'      // full coaching file of any member

const MATRIX: Record<MemberRole, ReadonlySet<ScheduleAction>> = {
  ADMIN: new Set<ScheduleAction>([
    'viewOverviewNames', 'sendReminders', 'configureSchedule', 'createSessions',
    'manageTemplates', 'markAttendance', 'assignExercises', 'viewMemberFile',
  ]),
  TRAINER: new Set<ScheduleAction>([
    'viewOverviewNames', 'sendReminders', 'configureSchedule', 'createSessions',
    'manageTemplates', 'markAttendance', 'assignExercises', 'viewMemberFile',
  ]),
  MODERATOR: new Set<ScheduleAction>([
    'viewOverviewNames', 'sendReminders', 'markAttendance',
  ]),
  MEMBER: new Set<ScheduleAction>(),
}

export function can(role: MemberRole | null | undefined, action: ScheduleAction, isSuperAdmin = false): boolean {
  if (isSuperAdmin) return true
  if (!role) return false
  return MATRIX[role]?.has(action) ?? false
}

/** A member may always edit their own schedule data; nobody edits someone else's. */
export function canEditOwnData(callerUid: string, targetUid: string, isMember: boolean): boolean {
  return isMember && callerUid === targetUid
}
