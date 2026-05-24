import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { feedbackEmailHtml } from '@/lib/email/feedbackTemplate'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'CaliPal <noreply@calipal.ro>'
const FEEDBACK_EMAIL = 'calipal2026@gmail.com'

const DAY_LIMIT  = 1
const WEEK_LIMIT = 3

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

    // ── 3. Rate limiting ──────────────────────────────────────────────────────
    const now = new Date()
    const startOfDay  = new Date(now); startOfDay.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay()) // Sunday
    startOfWeek.setHours(0, 0, 0, 0)

    const rateRef = adminDb().collection('feedback_rate').doc(uid)
    const rateSnap = await rateRef.get()
    const rateData = rateSnap.data() ?? {}

    const dayCount  = (rateData.dayCount  as number ?? 0)
    const weekCount = (rateData.weekCount as number ?? 0)
    const dayReset  = (rateData.dayReset  as FirebaseFirestore.Timestamp | null)?.toDate() ?? new Date(0)
    const weekReset = (rateData.weekReset as FirebaseFirestore.Timestamp | null)?.toDate() ?? new Date(0)

    const effectiveDayCount  = dayReset  >= startOfDay  ? dayCount  : 0
    const effectiveWeekCount = weekReset >= startOfWeek ? weekCount : 0

    if (effectiveDayCount >= DAY_LIMIT) {
      return NextResponse.json({ ok: false, reason: 'daily-limit' }, { status: 429 })
    }
    if (effectiveWeekCount >= WEEK_LIMIT) {
      return NextResponse.json({ ok: false, reason: 'weekly-limit' }, { status: 429 })
    }

    // ── 4. Fetch user data ────────────────────────────────────────────────────
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

    // ── 5. Send email ─────────────────────────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: FEEDBACK_EMAIL,
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

    // ── 6. Persist feedback to Firestore ─────────────────────────────────────
    await adminDb().collection('feedback').add({
      uid,
      senderName,
      senderEmail,
      category,
      subject,
      message,
      rating: rating ?? null,
      communities,
      replies: [],
      createdAt: FieldValue.serverTimestamp(),
    })

    // ── 7. Update rate counters ───────────────────────────────────────────────
    const newDayCount  = effectiveDayCount  + 1
    const newWeekCount = effectiveWeekCount + 1

    await rateRef.set({
      dayCount:  newDayCount,
      weekCount: newWeekCount,
      dayReset:  effectiveDayCount === 0 ? FieldValue.serverTimestamp() : rateData.dayReset,
      weekReset: effectiveWeekCount === 0 ? FieldValue.serverTimestamp() : rateData.weekReset,
      lastSentAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    // Tell the client how many they've used this week so UI can warn them
    const remaining = WEEK_LIMIT - newWeekCount
    return NextResponse.json({ ok: true, weekCount: newWeekCount, remaining })

  } catch (err) {
    console.error('[email/feedback] error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// GET — lets the client check current rate counts without sending
export async function GET(req: NextRequest) {
  try {
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

    const now = new Date()
    const startOfDay  = new Date(now); startOfDay.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const rateSnap = await adminDb().collection('feedback_rate').doc(uid).get()
    const rateData = rateSnap.data() ?? {}

    const dayReset  = (rateData.dayReset  as FirebaseFirestore.Timestamp | null)?.toDate() ?? new Date(0)
    const weekReset = (rateData.weekReset as FirebaseFirestore.Timestamp | null)?.toDate() ?? new Date(0)

    const effectiveDayCount  = dayReset  >= startOfDay  ? (rateData.dayCount  as number ?? 0) : 0
    const effectiveWeekCount = weekReset >= startOfWeek ? (rateData.weekCount as number ?? 0) : 0

    return NextResponse.json({
      ok: true,
      dayCount:  effectiveDayCount,
      weekCount: effectiveWeekCount,
      remaining: WEEK_LIMIT - effectiveWeekCount,
      canSendToday: effectiveDayCount < DAY_LIMIT && effectiveWeekCount < WEEK_LIMIT,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
