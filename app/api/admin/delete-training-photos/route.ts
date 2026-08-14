import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth, adminStorage } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { parseBody } from '@/lib/api/parseBody'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return NextResponse.json({ ok: false, reason: 'no-token' }, { status: 401 })

    let callerUid: string
    let callerIsSuperAdmin = false
    try {
      const decoded = await adminAuth().verifyIdToken(idToken)
      callerUid = decoded.uid
      // Check superAdmin custom claim (set via scripts/set-superadmin-claim.ts)
      const userRecord = await adminAuth().getUser(decoded.uid)
      callerIsSuperAdmin = userRecord.customClaims?.superAdmin === true
    } catch {
      return NextResponse.json({ ok: false, reason: 'invalid-token' }, { status: 401 })
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const [parsed, bodyErr] = await parseBody(req)
    if (bodyErr) return bodyErr
    const { communityId, trainingId, photoIds, deleteAll, reason } = parsed as {
      communityId: string
      trainingId: string
      photoIds?: string[]
      deleteAll?: boolean
      reason?: string
    }

    if (!communityId || !trainingId) {
      return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
    }

    // deleteAll is superadmin-only
    if (deleteAll && !callerIsSuperAdmin) {
      return NextResponse.json({ ok: false, reason: 'not-superadmin' }, { status: 403 })
    }

    const db = adminDb()
    const photosCol = db.collection(`communities/${communityId}/trainings/${trainingId}/photos`)

    // ── 3. Gather photos to delete ────────────────────────────────────────────
    let photoDocs: FirebaseFirestore.QueryDocumentSnapshot[]
    if (deleteAll) {
      const snap = await photosCol.get()
      photoDocs = snap.docs
    } else if (photoIds?.length) {
      const snaps = await Promise.all(photoIds.map(id => photosCol.doc(id).get()))
      photoDocs = snaps.filter(s => s.exists) as FirebaseFirestore.QueryDocumentSnapshot[]
    } else {
      return NextResponse.json({ ok: false, reason: 'no-photos-specified' }, { status: 400 })
    }

    if (photoDocs.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 })
    }

    // ── 3b. Authorisation per photo ──────────────────────────────────────────
    // Superadmin can delete any photo; regular users can only delete their own
    for (const photoDoc of photoDocs) {
      const data = photoDoc.data()
      if (!callerIsSuperAdmin && data.authorId !== callerUid) {
        return NextResponse.json({ ok: false, reason: 'not-owner' }, { status: 403 })
      }
    }

    // Superadmin deleting others' photos must provide a reason
    const deletingOthers = photoDocs.some(d => d.data().authorId !== callerUid)
    if (deletingOthers && !reason?.trim()) {
      return NextResponse.json({ ok: false, reason: 'missing-reason' }, { status: 400 })
    }

    // ── 4. Delete storage files and Firestore docs ────────────────────────────
    const bucket = adminStorage().bucket()
    const otherAuthorIds = new Set<string>()

    for (const photoDoc of photoDocs) {
      const data = photoDoc.data()
      if (data.authorId !== callerUid) otherAuthorIds.add(data.authorId)

      // Extract storage path from download URL
      try {
        const url = data.photoUrl as string
        const pathMatch = url.match(/\/o\/(.+?)\?/)
        if (pathMatch) {
          const storagePath = decodeURIComponent(pathMatch[1])
          await bucket.file(storagePath).delete().catch(() => {
            // File may already be deleted — ignore
          })
        }
      } catch {
        // Non-critical — continue with Firestore deletion
      }

      await photoDoc.ref.delete()
    }

    // ── 5. Decrement photoCount ───────────────────────────────────────────────
    const trainingRef = db.doc(`communities/${communityId}/trainings/${trainingId}`)
    await trainingRef.update({
      photoCount: FieldValue.increment(-photoDocs.length),
    })

    // ── 6. Notify affected authors (only others, not self-delete) ────────────
    for (const authorId of otherAuthorIds) {
      await db.collection(`notifications/${authorId}/items`).add({
        type: 'PHOTO_DELETED',
        title: 'Poza ta a fost ștearsă',
        body: (reason ?? '').trim(),
        isRead: false,
        relatedId: null,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({ ok: true, deleted: photoDocs.length })
  } catch (err) {
    console.error('delete-training-photos error:', err)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
