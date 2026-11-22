import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { parseBody } from '@/lib/api/parseBody'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { notifyUser } from '@/lib/server/notify'
import { can } from '@/lib/schedule/permissions'
import { parseTipInput, TIP_EMOJI, TIP_LABELS } from '@/lib/schedule/tips'

export const dynamic = 'force-dynamic'

/**
 * POST /api/community/{id}/members/{uid}/tips  { text, category }
 * A Fondator/Antrenor sends a tip to one member; the member is notified.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; uid: string }> }) {
  try {
    const { id: communityId, uid } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!can(caller.role, 'assignExercises', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
      return NextResponse.json({ ok: false, reason: 'bad-uid' }, { status: 400 })
    }
    const [body, bodyErr] = await parseBody<{ text?: unknown; category?: unknown }>(req, 5_000)
    if (bodyErr) return bodyErr
    const tip = parseTipInput(body)
    if (!tip) return NextResponse.json({ ok: false, reason: 'bad-tip' }, { status: 400 })

    const db = adminDb()
    const base = db.collection('communities').doc(communityId)
    const [memberSnap, communitySnap] = await Promise.all([
      base.collection('members').doc(uid).get(),
      base.get(),
    ])
    if (!memberSnap.exists) return NextResponse.json({ ok: false, reason: 'not-member' }, { status: 404 })

    const ref = await base.collection('memberPlans').doc(uid).collection('tips').add({
      ...tip,
      authorUid: caller.uid,
      authorName: caller.displayName || 'Antrenor',
      seen: false,
      createdAt: FieldValue.serverTimestamp(),
    })

    if (uid !== caller.uid) {
      const preview = tip.text.length > 90 ? `${tip.text.slice(0, 90)}…` : tip.text
      await notifyUser({
        toUid: uid,
        fromUid: caller.uid,
        type: 'COACH_TIP',
        title: `${TIP_EMOJI[tip.category]} Sfat nou (${TIP_LABELS[tip.category]}) · ${(communitySnap.data()?.name as string) || 'Comunitate'}`,
        body: preview,
        relatedId: communityId,
        url: `/community/${communityId}?tab=progress`,
      }).catch(e => console.error('[tips notify]', e))
    }

    return NextResponse.json({ ok: true, tipId: ref.id })
  } catch (e) {
    console.error('[tips POST]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
