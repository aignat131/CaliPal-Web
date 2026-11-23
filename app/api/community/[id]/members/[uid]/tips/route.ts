import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, type Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { parseBody } from '@/lib/api/parseBody'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { notifyUser } from '@/lib/server/notify'
import { can } from '@/lib/schedule/permissions'
import { isTipCategory, parseTipInput, TIP_EMOJI, TIP_LABELS, type CoachTip } from '@/lib/schedule/tips'

export const dynamic = 'force-dynamic'

const UID_RE = /^[A-Za-z0-9_-]{1,128}$/

/**
 * GET /api/community/{id}/members/{uid}/tips
 * The member themself or a Fondator/Antrenor lists the member's tips.
 * Reads go through the Admin SDK so they don't depend on deployed rules.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; uid: string }> }) {
  try {
    const { id: communityId, uid } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!UID_RE.test(uid)) return NextResponse.json({ ok: false, reason: 'bad-uid' }, { status: 400 })
    const isOwner = caller.uid === uid && !!caller.role
    if (!isOwner && !can(caller.role, 'viewMemberFile', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }
    const snap = await adminDb().collection('communities').doc(communityId)
      .collection('memberPlans').doc(uid).collection('tips').get()
    const tips: CoachTip[] = snap.docs.map(d => {
      const x = d.data()
      return {
        id: d.id,
        text: (x.text as string) ?? '',
        category: isTipCategory(x.category) ? x.category : 'general',
        authorName: (x.authorName as string) ?? '',
        createdAtMs: (x.createdAt as Timestamp | undefined)?.toMillis?.() ?? null,
        seen: x.seen === true,
      }
    }).sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
    return NextResponse.json({ ok: true, tips })
  } catch (e) {
    console.error('[tips GET]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}

/**
 * POST /api/community/{id}/members/{uid}/tips  { text, category }
 *   or { action: 'seen' } — the member marks all their tips as seen.
 * A Fondator/Antrenor sends a tip to one member; the member is notified.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; uid: string }> }) {
  try {
    const { id: communityId, uid } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!UID_RE.test(uid)) {
      return NextResponse.json({ ok: false, reason: 'bad-uid' }, { status: 400 })
    }
    const [body, bodyErr] = await parseBody<{ text?: unknown; category?: unknown; action?: unknown }>(req, 5_000)
    if (bodyErr) return bodyErr

    if (body.action === 'seen') {
      if (caller.uid !== uid || !caller.role) {
        return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
      }
      const db = adminDb()
      const unseen = await db.collection('communities').doc(communityId)
        .collection('memberPlans').doc(uid).collection('tips').where('seen', '==', false).get()
      if (!unseen.empty) {
        const batch = db.batch()
        unseen.docs.forEach(d => batch.update(d.ref, { seen: true }))
        await batch.commit()
      }
      return NextResponse.json({ ok: true, marked: unseen.size })
    }

    if (!can(caller.role, 'assignExercises', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }
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
        url: `/community/${communityId}/member/${uid}`,
      }).catch(e => console.error('[tips notify]', e))
    }

    return NextResponse.json({ ok: true, tipId: ref.id })
  } catch (e) {
    console.error('[tips POST]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
