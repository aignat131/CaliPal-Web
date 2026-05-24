import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { feedbackReplyHtml, getDefaultPrefix, getDefaultSuffix } from '@/lib/email/feedbackReplyTemplate'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const FROM_EMAIL        = process.env.EMAIL_FROM ?? 'CaliPal <noreply@calipal.ro>'
const APP_URL           = process.env.NEXT_PUBLIC_APP_URL ?? 'https://calipal.ro'
const SUPERADMIN_EMAIL  = process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? ''

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth — superadmin only ─────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return NextResponse.json({ ok: false }, { status: 401 })

    let callerEmail: string
    try {
      const decoded = await adminAuth().verifyIdToken(idToken)
      callerEmail = decoded.email ?? ''
    } catch {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    if (!SUPERADMIN_EMAIL || callerEmail !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ ok: false, reason: 'not-superadmin' }, { status: 403 })
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const { feedbackId, replyBody, lang } = await req.json() as {
      feedbackId: string
      replyBody: string
      lang: 'RO' | 'EN'
    }

    if (!feedbackId || !replyBody?.trim() || !lang) {
      return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
    }

    // ── 3. Fetch original feedback ────────────────────────────────────────────
    const feedbackRef = adminDb().collection('feedback').doc(feedbackId)
    const feedbackSnap = await feedbackRef.get()
    if (!feedbackSnap.exists) {
      return NextResponse.json({ ok: false, reason: 'not-found' }, { status: 404 })
    }
    const fb = feedbackSnap.data()!

    const recipientName: string  = fb.senderName  ?? 'Utilizator'
    const recipientEmail: string = fb.senderEmail ?? ''
    const originalSubject: string = fb.subject    ?? ''
    const originalMessage: string = fb.message    ?? ''
    const category: string        = fb.category   ?? 'feedback'

    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({ ok: false, reason: 'no-recipient-email' }, { status: 400 })
    }

    // ── 4. Build subject line ─────────────────────────────────────────────────
    const emailSubject = lang === 'RO'
      ? `Răspuns CaliPal: ${originalSubject}`
      : `CaliPal Reply: ${originalSubject}`

    // ── 5. Send email ─────────────────────────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: emailSubject,
      html: feedbackReplyHtml({
        lang,
        recipientName,
        originalSubject,
        originalMessage,
        category,
        replyBody: replyBody.trim(),
        appUrl: APP_URL,
      }),
    })

    // ── 6. Save reply to Firestore ────────────────────────────────────────────
    await feedbackRef.update({
      replies: FieldValue.arrayUnion({
        body: replyBody.trim(),
        lang,
        prefix: getDefaultPrefix(lang, recipientName, originalSubject),
        suffix: getDefaultSuffix(lang),
        sentByEmail: callerEmail,
        sentAt: new Date().toISOString(),
      }),
    })

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[email/feedback-reply] error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
