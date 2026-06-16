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
    const { backupId } = await req.json() as { backupId?: string }
    if (!backupId) {
      return NextResponse.json({ ok: false, reason: 'missing-backupId' }, { status: 400 })
    }

    const db = adminDb()

    // ── 3. Read backup ────────────────────────────────────────────────────────
    const backupRef = db.collection('training_backups').doc(backupId)
    const backupSnap = await backupRef.get()

    if (!backupSnap.exists) {
      return NextResponse.json({ ok: false, reason: 'backup-not-found' }, { status: 404 })
    }

    const backup = backupSnap.data()!
    const { sourceType, sourceId, originalTrainingId } = backup as {
      sourceType: 'community' | 'park'
      sourceId: string
      originalTrainingId: string
    }

    if (!sourceType || !sourceId || !originalTrainingId) {
      return NextResponse.json({ ok: false, reason: 'invalid-backup-data' }, { status: 400 })
    }

    // ── 4. Determine original training path ───────────────────────────────────
    const trainingPath = sourceType === 'community'
      ? `communities/${sourceId}/trainings/${originalTrainingId}`
      : `parks/${sourceId}/trainings/${originalTrainingId}`

    const trainingRef = db.doc(trainingPath)
    const trainingSnap = await trainingRef.get()

    // ── 5. Restore ────────────────────────────────────────────────────────────
    if (trainingSnap.exists) {
      // Doc exists but was soft-deleted → remove deletedAt
      await trainingRef.update({
        deletedAt: FieldValue.delete(),
        deletedByUid: FieldValue.delete(),
      })
    } else {
      // Doc was hard-deleted → recreate from backup
      // Strip backup-specific fields
      const { sourceType: _st, sourceId: _si, originalTrainingId: _ot,
              backedUpAt: _ba, deletedAt: _da, deletedByUid: _du,
              restoredAt: _ra, restoredByUid: _ru, ...trainingData } = backup
      await trainingRef.set(trainingData)
    }

    // ── 6. Mark backup as restored ────────────────────────────────────────────
    await backupRef.update({
      restoredAt: FieldValue.serverTimestamp(),
      restoredByUid: callerUid,
      // Clear deletedAt on the backup so it shows as active again
      deletedAt: FieldValue.delete(),
      deletedByUid: FieldValue.delete(),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('restore-training error:', err)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
