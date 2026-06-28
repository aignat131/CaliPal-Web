import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL ?? ''
const POINTS_PER_TRAINING = 10

export async function POST(req: NextRequest) {
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
    const communitiesSnap = await db.collection('communities').get()

    let totalCommunitiesProcessed = 0
    let totalMembersUpdated = 0

    for (const communityDoc of communitiesSnap.docs) {
      const communityId = communityDoc.id

      // Fetch all non-deleted, closed trainings for this community
      const trainingsSnap = await db
        .collection('communities')
        .doc(communityId)
        .collection('trainings')
        .get()

      // Count attendance per user from attendedBy arrays
      const attendanceCount: Record<string, number> = {}
      for (const tDoc of trainingsSnap.docs) {
        const data = tDoc.data()
        if (data.deletedAt) continue
        if (!data.isClosed) continue
        const attendedBy: string[] = data.attendedBy ?? []
        for (const uid of attendedBy) {
          attendanceCount[uid] = (attendanceCount[uid] ?? 0) + 1
        }
      }

      // Fetch all members and update their trainingPoints
      const membersSnap = await db
        .collection('communities')
        .doc(communityId)
        .collection('members')
        .get()

      const batch = db.batch()
      let batchCount = 0

      for (const memberDoc of membersSnap.docs) {
        const uid = memberDoc.id
        const correctPoints = (attendanceCount[uid] ?? 0) * POINTS_PER_TRAINING
        const currentData = memberDoc.data()

        // Only update if points differ
        if (currentData.trainingPoints !== correctPoints) {
          batch.update(memberDoc.ref, { trainingPoints: correctPoints })
          batchCount++
        }
      }

      if (batchCount > 0) {
        await batch.commit()
        totalMembersUpdated += batchCount
      }

      totalCommunitiesProcessed++
    }

    return NextResponse.json({
      ok: true,
      communitiesProcessed: totalCommunitiesProcessed,
      membersUpdated: totalMembersUpdated,
    })
  } catch (err) {
    console.error('reset-points error:', err)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
