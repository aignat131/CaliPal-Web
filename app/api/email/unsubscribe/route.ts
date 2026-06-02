import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const UNSUB_SECRET = process.env.UNSUBSCRIBE_SECRET
if (!UNSUB_SECRET) throw new Error('UNSUBSCRIBE_SECRET env var is not set')

function unsubToken(uid: string, communityId: string): string {
  return createHmac('sha256', UNSUB_SECRET).update(`${uid}:${communityId}`).digest('hex')
}

function html(title: string, heading: string, body: string, resubUrl?: string): string {
  const resubBtn = resubUrl
    ? `<a href="${resubUrl}" style="display:inline-block;margin-top:16px;background:#1ED75F;color:#000;padding:10px 22px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;">Reabonare</a>`
    : ''
  return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>${title}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:40px 16px;background:#0D2E2B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
    <div style="background:#164742;border-radius:20px;padding:32px;max-width:420px;width:100%;text-align:center;border:1px solid rgba(30,215,95,0.15);">
      <p style="margin:0 0 8px;color:#1ED75F;font-size:24px;">✓</p>
      <h1 style="margin:0 0 12px;color:#F9FAFB;font-size:20px;font-weight:900;">${heading}</h1>
      <p style="margin:0;color:#9CA3AF;font-size:14px;line-height:1.6;">${body}</p>
      ${resubBtn}
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
    return new NextResponse(html('Link invalid', 'Link invalid', 'Acest link de dezabonare nu este valid.'), {
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
    return new NextResponse(html('Link invalid', 'Link invalid', 'Token de dezabonare invalid sau expirat.'), {
      status: 400, headers: { 'Content-Type': 'text/html' },
    })
  }

  // ── Check current status ───────────────────────────────────────────────────
  const memberRef = adminDb().collection('communities').doc(cid).collection('members').doc(uid)
  const memberSnap = await memberRef.get()

  if (!memberSnap.exists) {
    return new NextResponse(html('Deja dezabonat', 'Nu ești membru', 'Nu ești membru al acestei comunități sau ai fost deja eliminat.'), {
      status: 200, headers: { 'Content-Type': 'text/html' },
    })
  }

  if (memberSnap.data()?.emailNotifications === false) {
    // Already opted out — offer to re-subscribe
    const resubUrl = `/api/email/resubscribe?uid=${uid}&cid=${cid}&t=${token}`
    return new NextResponse(html(
      'Deja dezabonat',
      'Ești deja dezabonat',
      'Nu vei mai primi emailuri de la această comunitate.',
      resubUrl,
    ), { status: 200, headers: { 'Content-Type': 'text/html' } })
  }

  // ── Update member doc ──────────────────────────────────────────────────────
  await memberRef.update({ emailNotifications: false })

  const communitySnap = await adminDb().collection('communities').doc(cid).get()
  const communityName = (communitySnap.data()?.name as string | undefined) ?? 'comunitate'
  const resubUrl = `/api/email/resubscribe?uid=${uid}&cid=${cid}&t=${token}`

  return new NextResponse(
    html(
      'Dezabonat',
      'Dezabonat cu succes',
      `Nu vei mai primi notificări email de la <strong style="color:#F9FAFB;">${communityName}</strong>. Poți reactiva oricând din pagina comunității.`,
      resubUrl,
    ),
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )
}
