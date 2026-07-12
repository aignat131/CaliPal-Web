import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { parseBody } from '@/lib/api/parseBody'

export const dynamic = 'force-dynamic'

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY ?? ''

export async function POST(req: NextRequest) {
  const [parsed, err] = await parseBody(req)
  if (err) return err
  const { token, email, password, displayName, gender, age } = parsed as Record<string, string>

  // ── Validate input ────────────────────────────────────────────────────────
  if (!email || !password || !displayName) {
    return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ ok: false, reason: 'weak-password' }, { status: 400 })
  }
  if (typeof displayName !== 'string' || displayName.trim().length === 0 || displayName.length > 60) {
    return NextResponse.json({ ok: false, reason: 'invalid-name' }, { status: 400 })
  }

  // ── Turnstile verification ────────────────────────────────────────────────
  if (TURNSTILE_SECRET) {
    if (!token) {
      return NextResponse.json({ ok: false, reason: 'captcha-required' }, { status: 400 })
    }
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token }),
      })
      const result = await res.json()
      if (!result.success) {
        return NextResponse.json({ ok: false, reason: 'captcha-failed' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ ok: false, reason: 'captcha-error' }, { status: 500 })
    }
  }

  // ── Create Firebase user ──────────────────────────────────────────────────
  try {
    const userRecord = await adminAuth().createUser({
      email,
      password,
      displayName: displayName.trim(),
    })

    // Create Firestore user doc (mirrors ensureUserDoc logic)
    await adminDb().collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      displayName: displayName.trim(),
      email,
      bio: '',
      isCoach: false,
      photoUrl: '',
      totalWorkouts: 0,
      currentStreak: 0,
      coins: 0,
      friendCount: 0,
      assessmentCompleted: false,
      joinedCommunityIds: [],
      ...(gender ? { gender } : {}),
      ...(age ? { age: Number(age) } : {}),
      createdAt: FieldValue.serverTimestamp(),
    })

    // Generate a custom token for the client to sign in
    const customToken = await adminAuth().createCustomToken(userRecord.uid)

    // Send email verification (non-blocking)
    const verifyLink = await adminAuth().generateEmailVerificationLink(email).catch(() => null)
    // The client will handle email verification via Firebase SDK as a fallback

    return NextResponse.json({ ok: true, customToken, verifyLink })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'auth/email-already-exists') {
      return NextResponse.json({ ok: false, reason: 'email-in-use' }, { status: 409 })
    }
    if (code === 'auth/invalid-email') {
      return NextResponse.json({ ok: false, reason: 'invalid-email' }, { status: 400 })
    }
    console.error('[register] Error creating user:', err)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
