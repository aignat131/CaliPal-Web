import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { Resend } from 'resend'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { trainingEmailHtml } from '@/lib/email/trainingTemplate'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://calipal.ro'
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'CaliPal <noreply@calipal.ro>'
const UNSUB_SECRET = process.env.UNSUBSCRIBE_SECRET ?? 'change-me-in-env'

function unsubToken(uid: string, communityId: string): string {
  return createHmac('sha256', UNSUB_SECRET).update(`${uid}:${communityId}`).digest('hex')
}

/** Format "dd/MM/yyyy HH:mm" → readable label */
function formatDateLabel(ts: string): string {
  const m = ts.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (!m) return ts
  const [, dd, mm, yyyy] = m
  const d = new Date(`${yyyy}-${mm}-${dd}`)
  return d.toLocaleDateString('ro', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

export async function POST(req: NextRequest) {
  // ── 1. Auth: require valid Firebase ID token ───────────────────────────────
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

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  const {
    communityId,
    trainingId,
    trainingName,
    description,
    timeStart,
    timeEnd,
    location,
    authorName,
  }: {
    communityId: string
    trainingId: string
    trainingName: string
    description?: string
    timeStart: string
    timeEnd?: string
    location?: string
    authorName: string
  } = await req.json()

  if (!communityId || !trainingId || !trainingName || !timeStart) {
    return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
  }

  // ── 3. Verify caller is staff in this community ────────────────────────────
  const callerMemberSnap = await adminDb()
    .collection('communities').doc(communityId)
    .collection('members').doc(callerUid)
    .get()

  if (!callerMemberSnap.exists) {
    return NextResponse.json({ ok: false, reason: 'not-member' }, { status: 403 })
  }
  const callerRole = callerMemberSnap.data()?.role as string | undefined
  const isSuperAdmin = (await adminAuth().getUser(callerUid)).customClaims?.superAdmin === true
  if (!isSuperAdmin && !['ADMIN', 'MODERATOR', 'TRAINER'].includes(callerRole ?? '')) {
    return NextResponse.json({ ok: false, reason: 'not-staff' }, { status: 403 })
  }

  // ── 4. Fetch community name ────────────────────────────────────────────────
  const communitySnap = await adminDb().collection('communities').doc(communityId).get()
  const communityName = (communitySnap.data()?.name as string | undefined) ?? 'Comunitate'

  // ── 5. Fetch all members, filter out opted-out ─────────────────────────────
  const membersSnap = await adminDb()
    .collection('communities').doc(communityId)
    .collection('members')
    .get()

  const memberUids = membersSnap.docs
    .filter(d => {
      // Skip members who opted out (emailNotifications explicitly false)
      if (d.data().emailNotifications === false) return false
      // Skip the sender themselves
      if (d.id === callerUid) return false
      return true
    })
    .map(d => d.id)

  if (memberUids.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  // ── 6. Fetch user emails in batches of 30 (Firestore getAll limit is lenient but let's be safe) ─
  const BATCH = 30
  const emailTargets: { uid: string; email: string }[] = []

  for (let i = 0; i < memberUids.length; i += BATCH) {
    const slice = memberUids.slice(i, i + BATCH)
    const userDocs = await Promise.all(
      slice.map(uid => adminDb().collection('users').doc(uid).get())
    )
    userDocs.forEach((snap, idx) => {
      const email = snap.data()?.email as string | undefined
      if (email && email.includes('@')) {
        emailTargets.push({ uid: slice[idx], email })
      }
    })
  }

  if (emailTargets.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  // ── 7. Build labels ────────────────────────────────────────────────────────
  const dateLabel = formatDateLabel(timeStart)
  const startTime = timeStart.slice(-5)
  const endTime = timeEnd ? timeEnd.slice(-5) : ''
  const timeLabel = endTime ? `${startTime} – ${endTime}` : startTime
  const trainingUrl = `${APP_URL}/community/${communityId}`

  // ── 8. Send emails in batches of 50 (Resend batch limit) ──────────────────
  const MAIL_BATCH = 50
  let sent = 0

  for (let i = 0; i < emailTargets.length; i += MAIL_BATCH) {
    const slice = emailTargets.slice(i, i + MAIL_BATCH)
    const emails = slice.map(({ uid, email }) => {
      const token = unsubToken(uid, communityId)
      const unsubscribeUrl = `${APP_URL}/api/email/unsubscribe?uid=${uid}&cid=${communityId}&t=${token}`
      return {
        from: FROM_EMAIL,
        to: email,
        subject: `📅 ${trainingName} — ${communityName}`,
        html: trainingEmailHtml({
          trainingName,
          communityName,
          dateLabel,
          timeLabel,
          location: location ?? '',
          description: description ?? '',
          authorName,
          trainingUrl,
          unsubscribeUrl,
        }),
      }
    })

    try {
      await resend.batch.send(emails)
      sent += slice.length
    } catch (err) {
      console.error('[email/training] batch send error:', err)
      // Continue — partial success is better than failing all
    }
  }

  return NextResponse.json({ ok: true, sent })
}
