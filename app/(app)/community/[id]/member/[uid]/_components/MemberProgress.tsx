'use client'

import type { CommunityMember, PlannedTraining } from '@/types'
import { ROLE_LABELS } from '@/types'
import { RoleAvatar } from '../../../_components/Avatars'
import { ROLE_COLORS } from '../../../_components/shared'
import { TipsSection } from './TipsSection'
import { GoalsSection } from './GoalsSection'
import { ExtraExercisesSection } from './ExtraExercisesSection'
import { AttendanceSection } from './AttendanceSection'
import { JournalSection } from './JournalSection'

/**
 * A member's whole progress file: coach tips, goals, extra exercises,
 * attendance, journal. Shown on the member file page and, for the
 * member themself, directly in the community's Progress tab.
 */
export function MemberProgress({ communityId, member, isOwner, canAssign, coachUid, coachName, trainings }: {
  communityId: string
  member: CommunityMember
  isOwner: boolean
  /** Viewer is Fondator/Antrenor (or superadmin). */
  canAssign: boolean
  coachUid: string
  coachName: string
  trainings: PlannedTraining[] | null
}) {
  const uid = member.userId
  return (
    <>
      <div className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: 'var(--app-surface)' }}>
        <RoleAvatar photoUrl={member.photoUrl ?? ''} name={member.displayName} roleColor={ROLE_COLORS[member.role] ?? 'var(--accent)'} size={52} />
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-white truncate">{member.displayName}</p>
          <p className="text-xs" style={{ color: ROLE_COLORS[member.role] }}>{ROLE_LABELS[member.role]}</p>
        </div>
        <div className="text-right leading-tight">
          <p className="text-xl font-medium text-brand-green">{member.trainingPoints ?? 0}</p>
          <p className="text-[11px] text-white/35">puncte</p>
        </div>
      </div>

      <GoalsSection communityId={communityId} uid={uid} isOwner={isOwner} isCoach={canAssign && !isOwner} />
      <TipsSection communityId={communityId} uid={uid} isOwner={isOwner} canGive={canAssign} />
      <ExtraExercisesSection communityId={communityId} uid={uid} isOwner={isOwner} canAssign={canAssign}
        coachUid={coachUid} coachName={coachName} />
      <AttendanceSection communityId={communityId} uid={uid} trainings={trainings}
        joinedAtMs={member.joinedAt?.toMillis?.() ?? null} />
      <JournalSection communityId={communityId} uid={uid} isOwner={isOwner} trainings={trainings} />
    </>
  )
}
