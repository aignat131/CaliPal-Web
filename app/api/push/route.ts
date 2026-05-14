import { NextRequest, NextResponse } from 'next/server'
import { adminMessaging, adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { toUid, title, body, url } = await req.json()
  if (!toUid || !title) return NextResponse.json({ ok: false }, { status: 400 })

  try {
    const tokenDoc = await adminDb().collection('fcm_tokens').doc(toUid).get()
    const token = tokenDoc.data()?.token as string | undefined
    if (!token) return NextResponse.json({ ok: false, reason: 'no-token' })

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
