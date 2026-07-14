import { NextRequest, NextResponse } from 'next/server'
import { adminMessaging, adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { parseBody } from '@/lib/api/parseBody'

export const dynamic = 'force-dynamic'

const PUSH_LIMIT = 20 // max pushes per sender per hour

export async function POST(req: NextRequest) {
  try {
  // ── Auth — any signed-in user ─────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return NextResponse.json({ ok: false }, { status: 401 })

  let callerUid: string
  try {
    const decoded = await adminAuth().verifyIdToken(idToken)
    callerUid = decoded.uid
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  // ── Rate limit: 20 pushes / hour per sender ───────────────────────────────
  const now = Date.now()
  const windowStart = now - 60 * 60 * 1000
  const rateRef = adminDb().collection('push_rate').doc(callerUid)
  const rateSnap = await rateRef.get()
  const rateData = rateSnap.data() ?? {}
  const windowTs: number = rateData.windowStart ?? 0
  const count: number = windowTs > windowStart ? (rateData.count ?? 0) : 0

  if (count >= PUSH_LIMIT) {
    return NextResponse.json({ ok: false, reason: 'rate-limited' }, { status: 429 })
  }

  await rateRef.set({
    windowStart: windowTs > windowStart ? windowTs : now,
    count: FieldValue.increment(1),
  }, { merge: true })

  // ── Parse & validate ──────────────────────────────────────────────────────
  const [parsed, err] = await parseBody(req)
  if (err) return err
  const { toUid, title, body, url, notifType } = parsed as Record<string, string>
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
  } catch {
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
