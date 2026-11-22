import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { can } from '@/lib/schedule/permissions'

export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/** DELETE /api/community/{id}/members/{uid}/tips/{tipId} — Fondator/Antrenor only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; uid: string; tipId: string }> }) {
  try {
    const { id: communityId, uid, tipId } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!can(caller.role, 'assignExercises', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }
    if (!ID_RE.test(uid) || !ID_RE.test(tipId)) {
      return NextResponse.json({ ok: false, reason: 'bad-id' }, { status: 400 })
    }
    await adminDb().collection('communities').doc(communityId)
      .collection('memberPlans').doc(uid).collection('tips').doc(tipId).delete()
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[tips DELETE]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
