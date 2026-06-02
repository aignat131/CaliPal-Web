import { NextRequest, NextResponse } from 'next/server'
import { adminMessaging, adminDb, adminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // ── Auth — any signed-in user ─────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    await adminAuth().verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  // ── Parse & validate ──────────────────────────────────────────────────────
  const { toUid, title, body, url, notifType } = await req.json()
  if (!toUid || !title) return NextResponse.json({ ok: false }, { status: 400 })

  try {
    const tokenDoc = await adminDb().collection('fcm_tokens').doc(toUid).get()
    const token = tokenDoc.data()?.token as string | undefined
    if (!token) return NextResponse.json({ ok: false, reason: 'no-token' })

    // Check per-category opt-out preference
    if (notifType) {
      const fieldMap: Record<string, string> = {
        messages:  'pushNotifMessages',
        trainings: 'pushNotifTrainings',
        community: 'pushNotifCommunity',
        friends:   'pushNotifFriends',
      }
      const field = fieldMap[notifType]
      if (field) {
        const userSnap = await adminDb().collection('users').doc(toUid).get()
        if (userSnap.data()?.[field] === false) {
          return NextResponse.json({ ok: false, reason: 'user-opted-out' })
        }
      }
    }

    await adminMessaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        },
        fcmOptions: { link: url },
        data: { url: url ?? '/home' },
      },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
