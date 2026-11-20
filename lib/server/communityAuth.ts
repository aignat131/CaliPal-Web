import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import type { MemberRole } from '@/types'

export interface CommunityCaller {
  uid: string
  role: MemberRole | null   // null = not a member
  isSuperAdmin: boolean
  displayName: string
}

/**
 * Verify the Bearer ID token and load the caller's role in a community.
 * Returns `[caller, null]` or `[null, errorResponse]`.
 */
export async function getCommunityCaller(
  req: NextRequest,
  communityId: string,
): Promise<[CommunityCaller, null] | [null, NextResponse]> {
  const authHeader = req.headers.get('authorization') ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return [null, NextResponse.json({ ok: false, reason: 'no-token' }, { status: 401 })]

  let uid: string
  let isSuperAdmin = false
  try {
    const decoded = await adminAuth().verifyIdToken(idToken)
    uid = decoded.uid
    isSuperAdmin = decoded.superAdmin === true
  } catch {
    return [null, NextResponse.json({ ok: false, reason: 'invalid-token' }, { status: 401 })]
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(communityId)) {
    return [null, NextResponse.json({ ok: false, reason: 'bad-community' }, { status: 400 })]
  }

  const memberSnap = await adminDb().doc(`communities/${communityId}/members/${uid}`).get()
  const data = memberSnap.data()
  const role = memberSnap.exists ? ((data?.role as MemberRole) ?? 'MEMBER') : null
  if (!role && !isSuperAdmin) {
    return [null, NextResponse.json({ ok: false, reason: 'not-member' }, { status: 403 })]
  }
  return [{ uid, role, isSuperAdmin, displayName: (data?.displayName as string) ?? '' }, null]
}
