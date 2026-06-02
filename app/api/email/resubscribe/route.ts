import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

function unsubToken(uid: string, communityId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET env var is not set')
  return createHmac('sha256', secret).update(`${uid}:${communityId}`).digest('hex')
}

function html(title: string, heading: string, body: string): string {
  return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>${title}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:40px 16px;background:#0D2E2B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
    <div style="background:#164742;border-radius:20px;padding:32px;max-width:420px;width:100%;text-align:center;border:1px solid rgba(30,215,95,0.15);">
      <p style="margin:0 0 8px;color:#1ED75F;font-size:24px;">✓</p>
      <h1 style="margin:0 0 12px;color:#F9FAFB;font-size:20px;font-weight:900;">${heading}</h1>
      <p style="margin:0;color:#9CA3AF;font-size:14px;line-height:1.6;">${body}</p>
      <p style="margin:24px 0 0;"><a href="/home" style="color:#4B5563;font-size:13px;text-decoration:underline;">Înapoi la CaliPal</a></p>
    </div>
  </body></html>`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const uid = searchParams.get('uid') ?? ''
  const cid = searchParams.get('cid') ?? ''
  const token = searchParams.get('t') ?? ''

  if (!uid || !cid || !token) {
    return new NextResponse(html('Link invalid', 'Link invalid', 'Acest link nu este valid.'), {
      status: 400, headers: { 'Content-Type': 'text/html' },
    })
  }

  // ── Verify HMAC token ──────────────────────────────────────────────────────
  const expected = unsubToken(uid, cid)
  let valid = false
  try {
    valid = timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    valid = false
  }

  if (!valid) {
    return new NextResponse(html('Link invalid', 'Link invalid', 'Token invalid sau expirat.'), {
      status: 400, headers: { 'Content-Type': 'text/html' },
    })
  }

  // ── Check member exists ────────────────────────────────────────────────────
  const memberRef = adminDb().collection('communities').doc(cid).collection('members').doc(uid)
  const memberSnap = await memberRef.get()

  if (!memberSnap.exists) {
    return new NextResponse(html('Eroare', 'Nu ești membru', 'Nu ești membru al acestei comunități.'), {
      status: 200, headers: { 'Content-Type': 'text/html' },
    })
  }

  if (memberSnap.data()?.emailNotifications !== false) {
    return new NextResponse(html('Deja abonat', 'Ești deja abonat', 'Vei primi în continuare emailuri de la această comunitate.'), {
      status: 200, headers: { 'Content-Type': 'text/html' },
    })
  }

  // ── Re-enable notifications ────────────────────────────────────────────────
  await memberRef.update({ emailNotifications: true })

  return new NextResponse(
    html(
      'Reabonare reușită',
      'Reabonare reușită',
      'Vei primi din nou notificări email de la această comunitate. Poți dezactiva oricând din meniul comunității.',
    ),
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )
}
