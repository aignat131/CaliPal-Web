import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { can } from '@/lib/schedule/permissions'
import { isDateKey, weekStartOf } from '@/lib/schedule/week'
import {
  computeHeatmap, resolveWeek, sanitizeConfig,
  type AvailabilityDoc, type MemberWeek,
} from '@/lib/schedule/availability'
import type { MemberRole } from '@/types'
import type { AvailabilityMemberRow, AvailabilityOverviewResponse } from '@/lib/schedule/api-types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/community/{id}/availability?week=yyyy-MM-dd
 * Staff (can 'viewOverviewNames') get every member's effective week.
 * Regular members only get aggregated counts — names never leave the server.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: communityId } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err

    const weekParam = req.nextUrl.searchParams.get('week')
    if (!isDateKey(weekParam)) {
      return NextResponse.json({ ok: false, reason: 'bad-week' }, { status: 400 })
    }
    const week = weekStartOf(weekParam)

    const db = adminDb()
    const base = db.collection('communities').doc(communityId)
    const [configSnap, membersSnap, availSnap] = await Promise.all([
      base.collection('config').doc('plan').get(),
      base.collection('members').get(),
      base.collection('availability').get(),
    ])
    const config = sanitizeConfig(configSnap.data())

    const availByUid = new Map<string, AvailabilityDoc>()
    availSnap.forEach(d => availByUid.set(d.id, d.data() as AvailabilityDoc))

    // Only current members count — docs of people who left are ignored.
    const rows: AvailabilityMemberRow[] = []
    const entries: MemberWeek[] = []
    membersSnap.forEach(m => {
      const md = m.data()
      const avail = availByUid.get(m.id)
      const r = resolveWeek(avail, week)
      entries.push({ uid: m.id, mask: r.mask })
      rows.push({
        uid: m.id,
        name: (md.displayName as string) || 'Membru',
        photoUrl: (md.photoUrl as string) || null,
        role: ((md.role as MemberRole) ?? 'MEMBER'),
        mask: r.mask,
        source: r.source,
        completed: r.completed,
        customized: r.customized,
        updatedAt: avail?.updatedAt?.toMillis?.() ?? null,
      })
    })

    const heat = computeHeatmap(entries, config)
    const canSeeNames = can(caller.role, 'viewOverviewNames', caller.isSuperAdmin)

    const body: AvailabilityOverviewResponse = {
      ok: true,
      week,
      config,
      canSeeNames,
      respondents: heat.respondents,
      counts: heat.counts,
      ...(canSeeNames ? { members: rows } : {}),
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[availability GET]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
