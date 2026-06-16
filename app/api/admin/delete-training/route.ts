import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const SUPERADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? ''

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth — superadmin only ─────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return NextResponse.json({ ok: false, reason: 'no-token' }, { status: 401 })

    let callerUid: string
    let callerEmail: string | undefined
    try {
      const decoded = await adminAuth().verifyIdToken(idToken)
      callerUid = decoded.uid
      callerEmail = decoded.email
    } catch {
      return NextResponse.json({ ok: false, reason: 'invalid-token' }, { status: 401 })
    }

    if (!SUPERADMIN_EMAIL || callerEmail !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ ok: false, reason: 'not-superadmin' }, { status: 403 })
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const { communityId, parkId, trainingId } = await req.json() as {
      communityId?: string
      parkId?: string
      trainingId?: string
    }

    if (!trainingId) {
      return NextResponse.json({ ok: false, reason: 'missing-trainingId' }, { status: 400 })
    }
    if (!communityId && !parkId) {
      return NextResponse.json({ ok: false, reason: 'missing-communityId-or-parkId' }, { status: 400 })
    }

    const db = adminDb()
    const sourceType = communityId ? 'community' : 'park'
    const sourceId = (communityId || parkId)!
    const trainingPath = communityId
      ? `communities/${communityId}/trainings/${trainingId}`
      : `parks/${parkId}/trainings/${trainingId}`

    // ── 3. Read training ──────────────────────────────────────────────────────
    const trainingRef = db.doc(trainingPath)
    const trainingSnap = await trainingRef.get()

    if (!trainingSnap.exists) {
      return NextResponse.json({ ok: false, reason: 'not-found' }, { status: 404 })
    }

    const data = trainingSnap.data()!
    if (data.deletedAt) {
      return NextResponse.json({ ok: false, reason: 'already-deleted' }, { status: 409 })
    }

    // ── 4. Mark backup as deleted (if backup exists) ──────────────────────────
    const backupId = `${sourceType}_${sourceId}_${trainingId}`
    const backupRef = db.collection('training_backups').doc(backupId)
    const backupSnap = await backupRef.get()

    if (backupSnap.exists) {
      await backupRef.update({
        deletedAt: FieldValue.serverTimestamp(),
        deletedByUid: callerUid,
      })
    }

    // ── 5. Soft-delete the original training ──────────────────────────────────
    await trainingRef.update({
      deletedAt: FieldValue.serverTimestamp(),
      deletedByUid: callerUid,
    })

    // ── 5b. Mark mirror as deleted (Admin SDK bypasses rules) ────────────────
    const mirrorPath = communityId
      ? `communities/${communityId}/trainings_safe/${trainingId}`
      : `parks/${parkId}/trainings_safe/${trainingId}`
    const mirrorRef = db.doc(mirrorPath)
    const mirrorSnap = await mirrorRef.get()
    if (mirrorSnap.exists) {
      await mirrorRef.update({
        deletedAt: FieldValue.serverTimestamp(),
        deletedByUid: callerUid,
      })
    }

    // ── 6. Decrement park counter if upcoming park training ───────────────────
    if (parkId && data.timeStart) {
      const m = (data.timeStart as string).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
      if (m) {
        const parsed = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`)
        if (parsed >= new Date()) {
          await db.doc(`parks/${parkId}`).update({
            upcomingTrainingCount: FieldValue.increment(-1),
          })
        }
      }
    }

    return NextResponse.json({ ok: true, backupId })
  } catch (err) {
    console.error('delete-training error:', err)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
