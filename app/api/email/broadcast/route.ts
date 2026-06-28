import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { broadcastEmailHtml } from '@/lib/email/broadcastTemplate'
import { parseBody } from '@/lib/api/parseBody'

export const dynamic = 'force-dynamic'

const FROM_EMAIL  = process.env.EMAIL_FROM ?? 'CaliPal <noreply@calipal.ro>'
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://calipal.ro'
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL ?? ''

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth — superadmin only ─────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return NextResponse.json({ ok: false }, { status: 401 })

    let callerUid: string
    let callerEmail: string
    try {
      const decoded = await adminAuth().verifyIdToken(idToken)
      callerUid  = decoded.uid
      callerEmail = decoded.email ?? ''
    } catch {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    if (!SUPERADMIN_EMAIL || callerEmail !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ ok: false, reason: 'not-superadmin' }, { status: 403 })
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const [parsed, bodyErr] = await parseBody(req)
    if (bodyErr) return bodyErr
    const { subject, body } = parsed as { subject: string; body: string }

    if (!subject?.trim() || !body?.trim()) {
      return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
    }

    // ── 3. Fetch all users with newsEmailNotifications !== false ──────────────
    // Firestore doesn't index missing fields so we fetch all and filter in-memory
    const usersSnap = await adminDb().collection('users').get()

    const targets: { email: string; displayName: string }[] = []
    usersSnap.docs.forEach(d => {
      const data = d.data()
      if (data.newsEmailNotifications === false) return
      if (d.id === callerUid) return                // skip the sender
      const email: string = data.email ?? ''
      if (!email || !email.includes('@')) return
      targets.push({ email, displayName: data.displayName ?? 'Utilizator' })
    })

    if (targets.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 })
    }

    // ── 4. Send in batches of 50 (Resend batch limit) ─────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY)
    const MAIL_BATCH = 50
    let sent = 0

    for (let i = 0; i < targets.length; i += MAIL_BATCH) {
      const slice = targets.slice(i, i + MAIL_BATCH)
      const emails = slice.map(({ email, displayName }) => ({
        from: FROM_EMAIL,
        to: email,
        subject,
        html: broadcastEmailHtml({ recipientName: displayName, subject, body, appUrl: APP_URL }),
      }))
      try {
        await resend.batch.send(emails)
        sent += slice.length
      } catch (err) {
        console.error('[email/broadcast] batch error:', err)
      }
    }

    return NextResponse.json({ ok: true, sent, total: targets.length })
  } catch (err) {
    console.error('[email/broadcast] error:', err)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
