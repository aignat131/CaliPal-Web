import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { parseBody } from '@/lib/api/parseBody'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { goingCount } from '@/lib/schedule/sessions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/community/{id}/trainings/{tid}/rsvp  { status: 'GOING' | 'NOT_GOING' | 'MAYBE' }
 * Server-side RSVP — required for sessions with a seat limit (`capacity`),
 * which the Firestore rules don't let clients RSVP to directly.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  try {
    const { id: communityId, tid } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!caller.role) return NextResponse.json({ ok: false, reason: 'not-member' }, { status: 403 })

    const [body, bodyErr] = await parseBody<{ status?: unknown }>(req, 2_000)
    if (bodyErr) return bodyErr
    const status = body.status
    if (status !== 'GOING' && status !== 'NOT_GOING' && status !== 'MAYBE') {
      return NextResponse.json({ ok: false, reason: 'bad-status' }, { status: 400 })
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(tid)) {
      return NextResponse.json({ ok: false, reason: 'bad-training' }, { status: 400 })
    }

    const db = adminDb()
    const ref = db.doc(`communities/${communityId}/trainings/${tid}`)
    const [memberSnap, userSnap] = await Promise.all([
      db.doc(`communities/${communityId}/members/${caller.uid}`).get(),
      db.doc(`users/${caller.uid}`).get(),
    ])
    const name = (userSnap.data()?.displayName as string) || (memberSnap.data()?.displayName as string) || ''
    const photo = (userSnap.data()?.photoUrl as string) || (memberSnap.data()?.photoUrl as string) || ''

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists || snap.data()?.deletedAt) return { code: 404, reason: 'not-found' } as const
      const t = snap.data()!
      if (t.isClosed) return { code: 409, reason: 'closed' } as const
      const rsvps = (t.rsvps ?? {}) as Record<string, string>
      const alreadyGoing = rsvps[caller.uid] === 'GOING'
      if (status === 'GOING' && !alreadyGoing && typeof t.capacity === 'number' && goingCount(rsvps) >= t.capacity) {
        return { code: 409, reason: 'full' } as const
      }
      tx.update(ref, {
        [`rsvps.${caller.uid}`]: status,
        [`rsvpNames.${caller.uid}`]: status === 'GOING' && name ? name : FieldValue.delete(),
        [`rsvpPhotos.${caller.uid}`]: status === 'GOING' && photo ? photo : FieldValue.delete(),
      })
      return { code: 200 } as const
    })

    if (result.code !== 200) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: result.code })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[rsvp POST]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
