import type { MemberRole } from '@/types'

/**
 * Capability matrix for the community Progress / coaching features.
 * Used by API routes (authoritative) and by the UI (to hide controls).
 * Keep in sync with firestore.rules (isCommunityStaff / isCommunityCoach).
 *
 *   Fondator (ADMIN)     — everything
 *   Antrenor (TRAINER)   — everything
 *   Voluntar (MODERATOR) — attendance, reminders; no exercises/tips/config/member files
 *   Membru (MEMBER)      — own data only
 */
export type ScheduleAction =
  | 'sendReminders'       // journal / progress-test reminders
  | 'configureProgress'   // points, test metrics
  | 'markAttendance'
  | 'assignExercises'     // extra exercises + coach tips
  | 'viewMemberFile'      // full progress file of any member + Progress overview

const MATRIX: Record<MemberRole, ReadonlySet<ScheduleAction>> = {
  ADMIN: new Set<ScheduleAction>([
    'sendReminders', 'configureProgress', 'markAttendance', 'assignExercises', 'viewMemberFile',
  ]),
  TRAINER: new Set<ScheduleAction>([
    'sendReminders', 'configureProgress', 'markAttendance', 'assignExercises', 'viewMemberFile',
  ]),
  MODERATOR: new Set<ScheduleAction>([
    'sendReminders', 'markAttendance',
  ]),
  MEMBER: new Set<ScheduleAction>(),
}

export function can(role: MemberRole | null | undefined, action: ScheduleAction, isSuperAdmin = false): boolean {
  if (isSuperAdmin) return true
  if (!role) return false
  return MATRIX[role]?.has(action) ?? false
}

/** A member may always edit their own progress data; nobody edits someone else's. */
export function canEditOwnData(callerUid: string, targetUid: string, isMember: boolean): boolean {
  return isMember && callerUid === targetUid
}
