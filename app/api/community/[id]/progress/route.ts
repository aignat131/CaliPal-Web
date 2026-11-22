import { NextRequest, NextResponse } from 'next/server'
import type { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { can } from '@/lib/schedule/permissions'
import { currentWeekStart, todayKey } from '@/lib/schedule/week'
import { sanitizeTestConfig } from '@/lib/schedule/progress'
import { buildMemberRow, type ProgressOverviewResponse } from '@/lib/schedule/overview'
import type { MemberRole } from '@/types'

export const dynamic = 'force-dynamic'

const ms = (v: unknown) => (v as Timestamp | undefined)?.toMillis?.() ?? null

/**
 * GET /api/community/{id}/progress
 * Fondator/Antrenor: one progress summary row per member (goals, extra
 * exercises, journal, tests, tips) for the "Progress" tab.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: communityId } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!can(caller.role, 'viewMemberFile', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }

    const db = adminDb()
    const base = db.collection('communities').doc(communityId)
    const [membersSnap, configSnap] = await Promise.all([
      base.collection('members').get(),
      base.collection('config').doc('plan').get(),
    ])
    const { intervalWeeks } = sanitizeTestConfig(configSnap.data())
    const week = currentWeekStart()
    const today = todayKey()

    const members = await Promise.all(membersSnap.docs.map(async m => {
      const plan = base.collection('memberPlans').doc(m.id)
      const [goals, exercises, journal, tests, tips] = await Promise.all([
        plan.collection('goals').get(),
        plan.collection('extraExercises').get(),
        plan.collection('journal').select().get(),
        plan.collection('tests').select().get(),
        plan.collection('tips').select('createdAt').get(),
      ])
      const d = m.data()
      return buildMemberRow({
        uid: m.id,
        name: (d.displayName as string) || 'Membru',
        photoUrl: (d.photoUrl as string) || null,
        role: ((d.role as MemberRole) ?? 'MEMBER'),
        points: (d.trainingPoints as number) ?? 0,
        goals: goals.docs.map(g => {
          const x = g.data()
          return {
            skill: (x.skill as string) ?? '',
            target: (x.target as string) ?? '',
            deadline: (x.deadline as string) || null,
            status: (x.status as string) ?? 'IN_PROGRESS',
            createdAtMs: ms(x.createdAt),
          }
        }),
        exercises: exercises.docs.map(e => {
          const x = e.data()
          return {
            active: x.active !== false,
            perWeek: Number.isInteger(x.perWeek) ? (x.perWeek as number) : 2,
            checks: (x.checks as Record<string, number>) ?? {},
          }
        }),
        journalWeeks: journal.docs.map(j => j.id),
        testDates: tests.docs.map(t => t.id),
        tipTimesMs: tips.docs.map(t => ms(t.data().createdAt) ?? 0),
      }, week, today, intervalWeeks)
    }))

    members.sort((a, b) => a.name.localeCompare(b.name, 'ro'))
    const body: ProgressOverviewResponse = { ok: true, week, members }
    return NextResponse.json(body)
  } catch (e) {
    console.error('[progress GET]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
