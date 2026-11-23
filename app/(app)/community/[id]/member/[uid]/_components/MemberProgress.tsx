'use client'

import type { CommunityMember, PlannedTraining } from '@/types'
import { ROLE_LABELS } from '@/types'
import { RoleAvatar } from '../../../_components/Avatars'
import { ROLE_COLORS } from '../../../_components/shared'
import { TipsSection } from './TipsSection'
import { GoalsSection } from './GoalsSection'
import { ExtraExercisesSection } from './ExtraExercisesSection'
import { AttendanceSection } from './AttendanceSection'
import { GraduationCap } from 'lucide-react'

/**
 * A member's progress file: goals, what the coach gave them (tips + extra
 * exercises) and attendance. Shown to the member themself and to coaches.
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
      </div>

      <GoalsSection communityId={communityId} uid={uid} isOwner={isOwner} isCoach={canAssign && !isOwner} />

      {/* From the coach: tips + extra exercises in one card */}
      <section className="flex flex-col gap-2">
        <p className="text-[10px] font-bold text-white/35 tracking-widest flex items-center gap-1.5 px-1">
          <GraduationCap size={11} />DE LA ANTRENOR
        </p>
        <div className="rounded-2xl p-4 flex flex-col gap-5" style={{ backgroundColor: 'var(--app-surface)' }}>
          <TipsSection communityId={communityId} uid={uid} isOwner={isOwner} canGive={canAssign} inline />
          <div className="h-px bg-white/8" />
          <ExtraExercisesSection communityId={communityId} uid={uid} isOwner={isOwner} canAssign={canAssign}
            coachUid={coachUid} coachName={coachName} inline />
        </div>
      </section>

      <AttendanceSection communityId={communityId} uid={uid} trainings={trainings}
        joinedAtMs={member.joinedAt?.toMillis?.() ?? null} />
    </>
  )
}
