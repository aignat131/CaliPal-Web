import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL ?? ''

export async function GET(req: NextRequest) {
  try {
    // ── 1. Auth — superadmin only ─────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return NextResponse.json({ ok: false, reason: 'no-token' }, { status: 401 })

    let callerEmail: string | undefined
    try {
      const decoded = await adminAuth().verifyIdToken(idToken)
      callerEmail = decoded.email
    } catch {
      return NextResponse.json({ ok: false, reason: 'invalid-token' }, { status: 401 })
    }

    if (!SUPERADMIN_EMAIL || callerEmail !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ ok: false, reason: 'not-superadmin' }, { status: 403 })
    }

    const db = adminDb()

    // ── 2. Count backups per source ───────────────────────────────────────────
    const backupsSnap = await db.collection('training_backups').get()
    const backupCounts: Record<string, { sourceType: string; sourceId: string; backupCount: number; activeBackups: number }> = {}

    for (const doc of backupsSnap.docs) {
      const data = doc.data()
      const key = `${data.sourceType}_${data.sourceId}`
      if (!backupCounts[key]) {
        backupCounts[key] = { sourceType: data.sourceType, sourceId: data.sourceId, backupCount: 0, activeBackups: 0 }
      }
      backupCounts[key].backupCount++
      if (!data.deletedAt) backupCounts[key].activeBackups++
    }

    // ── 3. Count live trainings per source ────────────────────────────────────
    const mismatches: {
      sourceType: string
      sourceId: string
      sourceName: string
      backupCount: number
      liveCount: number
    }[] = []

    for (const [, info] of Object.entries(backupCounts)) {
      const collPath = info.sourceType === 'community'
        ? `communities/${info.sourceId}/trainings`
        : `parks/${info.sourceId}/trainings`

      const liveSnap = await db.collection(collPath).get()
      const liveCount = liveSnap.docs.filter(d => !d.data().deletedAt).length

      // Get source name
      let sourceName = info.sourceId
      try {
        const sourceDoc = info.sourceType === 'community'
          ? await db.doc(`communities/${info.sourceId}`).get()
          : await db.doc(`parks/${info.sourceId}`).get()
        if (sourceDoc.exists) {
          sourceName = sourceDoc.data()?.name ?? info.sourceId
        }
      } catch { /* keep ID as name */ }

      if (liveCount !== info.activeBackups) {
        mismatches.push({
          sourceType: info.sourceType,
          sourceId: info.sourceId,
          sourceName,
          backupCount: info.activeBackups,
          liveCount,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      totalBackups: backupsSnap.size,
      mismatches,
    })
  } catch (err) {
    console.error('verify-trainings error:', err)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
