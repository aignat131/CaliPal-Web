import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { feedbackEmailHtml } from '@/lib/email/feedbackTemplate'

export const dynamic = 'force-dynamic'

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'CaliPal <noreply@calipal.ro>'
const SUPERADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? ''

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return NextResponse.json({ ok: false }, { status: 401 })

    let uid: string
    try {
      const decoded = await adminAuth().verifyIdToken(idToken)
      uid = decoded.uid
    } catch {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const { category, subject, message, rating } = await req.json() as {
      category: string
      subject: string
      message: string
      rating?: number
    }

    if (!category || !subject?.trim() || !message?.trim()) {
      return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
    }
    if (!SUPERADMIN_EMAIL) {
      return NextResponse.json({ ok: false, reason: 'no-admin-email' }, { status: 500 })
    }

    // ── 3. Fetch user data ────────────────────────────────────────────────────
    const userSnap = await adminDb().collection('users').doc(uid).get()
    const userData = userSnap.data() ?? {}
    const senderName: string = userData.displayName ?? 'Unknown'
    const senderEmail: string = userData.email ?? ''

    // Fetch community names from joined IDs
    const joinedIds: string[] = userData.joinedCommunityIds ?? []
    let communities: string[] = []
    if (joinedIds.length > 0) {
      const commSnaps = await Promise.all(
        joinedIds.slice(0, 10).map((id: string) => adminDb().collection('communities').doc(id).get())
      )
      communities = commSnaps
        .filter(s => s.exists)
        .map(s => (s.data()?.name as string | undefined) ?? s.id)
    }

    const sentAt = new Date().toLocaleString('en-GB', { timeZone: 'Europe/Bucharest' })

    // ── 4. Send email to super admin only ─────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: SUPERADMIN_EMAIL,
      subject: `[Feedback] ${subject}`,
      html: feedbackEmailHtml({
        senderName,
        senderEmail,
        category,
        subject,
        message,
        rating,
        communities,
        uid,
        sentAt,
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[email/feedback] error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
