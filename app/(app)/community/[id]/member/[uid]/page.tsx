'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import type { CommunityMember, MemberRole, PlannedTraining } from '@/types'
import { ROLE_LABELS } from '@/types'
import { can } from '@/lib/schedule/permissions'
import { RoleAvatar } from '../../_components/Avatars'
import { ROLE_COLORS } from '../../_components/shared'
import { AvailabilitySection } from './_components/AvailabilitySection'
import { GoalsSection } from './_components/GoalsSection'
import { ExtraExercisesSection } from './_components/ExtraExercisesSection'
import { AttendanceSection } from './_components/AttendanceSection'
import { ArrowLeft, Lock } from 'lucide-react'

/**
 * Fișa membrului — everything the coach used to track in the spreadsheet.
 * Visible to the member themself (as "Progresul meu") and to Fondator/Antrenor.
 */
export default function MemberFilePage() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth()
  const { displayName: myName } = useMyProfile()
  const router = useRouter()
  const params = useParams()
  const communityId = params.id as string
  const uid = params.uid as string

  const [member, setMember] = useState<CommunityMember | null | undefined>(undefined)
  const [myRole, setMyRole] = useState<MemberRole | null | undefined>(undefined)
  const [communityName, setCommunityName] = useState('')
  const [trainings, setTrainings] = useState<PlannedTraining[] | null>(null)

  useEffect(() => onSnapshot(doc(db, 'communities', communityId, 'members', uid),
    s => setMember(s.exists() ? ({ userId: s.id, ...s.data() } as CommunityMember) : null),
    () => setMember(null)), [communityId, uid])

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'communities', communityId, 'members', user.uid),
      s => setMyRole(s.exists() ? ((s.data().role as MemberRole) ?? 'MEMBER') : null),
      () => setMyRole(null))
  }, [communityId, user])

  useEffect(() => onSnapshot(doc(db, 'communities', communityId),
    s => setCommunityName((s.data()?.name as string) ?? ''), () => undefined), [communityId])

  const isOwner = !!user && user.uid === uid
  const isCoach = can(myRole, 'viewMemberFile', isSuperAdmin)
  const canAssign = can(myRole, 'assignExercises', isSuperAdmin)
  const allowed = isOwner || isCoach

  useEffect(() => {
    if (!allowed) return
    getDocs(collection(db, 'communities', communityId, 'trainings'))
      .then(snap => setTrainings(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PlannedTraining)))
      .catch(() => setTrainings([]))
  }, [allowed, communityId])

  const loading = authLoading || member === undefined || (user && myRole === undefined)

  return (
    <div className="min-h-[calc(100dvh-64px)] animate-page-enter" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Înapoi" className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={17} className="text-white/70" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white truncate">{isOwner ? 'Progresul meu' : 'Fișa membrului'}</h1>
            {communityName && <p className="text-[11px] text-white/40 truncate">{communityName}</p>}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">{[0, 1, 2].map(i => <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />)}</div>
        ) : !member ? (
          <p className="text-sm text-white/50 text-center py-10">Membrul nu a fost găsit în această comunitate.</p>
        ) : !allowed ? (
          <div className="text-center py-12">
            <Lock size={28} className="text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/50">Fișa membrului e vizibilă doar pentru el și pentru antrenori.</p>
          </div>
        ) : (
          <>
            {/* Header card */}
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
            <ExtraExercisesSection communityId={communityId} uid={uid} isOwner={isOwner} canAssign={canAssign}
              coachUid={user?.uid ?? ''} coachName={myName || 'Antrenor'} />
            <AttendanceSection communityId={communityId} uid={uid} trainings={trainings}
              joinedAtMs={member.joinedAt?.toMillis?.() ?? null} />
            <AvailabilitySection communityId={communityId} uid={uid} isOwner={isOwner} />
          </>
        )}
      </div>
    </div>
  )
}
