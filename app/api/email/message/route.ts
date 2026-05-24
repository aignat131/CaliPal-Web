import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { messageEmailHtml } from '@/lib/email/messageTemplate'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'CaliPal <noreply@calipal.ro>'
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://calipal.ro'

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return NextResponse.json({ ok: false }, { status: 401 })

    let senderUid: string
    try {
      const decoded = await adminAuth().verifyIdToken(idToken)
      senderUid = decoded.uid
    } catch {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const { conversationId, recipientUid, preview } = await req.json() as {
      conversationId: string
      recipientUid: string
      preview: string
    }

    if (!conversationId || !recipientUid || !preview) {
      return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
    }
    if (senderUid === recipientUid) {
      return NextResponse.json({ ok: false, reason: 'self-message' }, { status: 400 })
    }

    // ── 3. Check one-time guard on conversation doc ───────────────────────────
    const convRef = adminDb().collection('conversations').doc(conversationId)
    const convSnap = await convRef.get()

    if (convSnap.exists && convSnap.data()?.firstMessageEmailSent === true) {
      // Already sent the one-time email for this conversation
      return NextResponse.json({ ok: true, skipped: 'already-sent' })
    }

    // Verify sender is actually a participant (security check)
    if (convSnap.exists) {
      const participants: string[] = convSnap.data()?.participantIds ?? []
      if (!participants.includes(senderUid)) {
        return NextResponse.json({ ok: false, reason: 'not-participant' }, { status: 403 })
      }
    }

    // ── 4. Check recipient's preference ──────────────────────────────────────
    const recipientSnap = await adminDb().collection('users').doc(recipientUid).get()
    const recipientData = recipientSnap.data() ?? {}

    if (recipientData.messageEmailNotifications === false) {
      return NextResponse.json({ ok: true, skipped: 'opted-out' })
    }

    const recipientEmail: string = recipientData.email ?? ''
    const recipientName: string  = recipientData.displayName ?? 'Utilizator'

    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({ ok: false, reason: 'no-email' }, { status: 400 })
    }

    // ── 5. Fetch sender name ──────────────────────────────────────────────────
    const senderSnap = await adminDb().collection('users').doc(senderUid).get()
    const senderName: string = senderSnap.data()?.displayName ?? 'Cineva'

    const chatUrl = `${APP_URL}/chat/${conversationId}?otherUserId=${senderUid}&otherName=${encodeURIComponent(senderName)}`

    // ── 6. Send email ─────────────────────────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `💬 ${senderName} ți-a trimis un mesaj pe CaliPal`,
      html: messageEmailHtml({
        recipientName,
        senderName,
        preview: preview.length > 120 ? preview.slice(0, 117) + '…' : preview,
        chatUrl,
      }),
    })

    // ── 7. Mark conversation so we never send again ───────────────────────────
    await convRef.set({ firstMessageEmailSent: true }, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[email/message] error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
