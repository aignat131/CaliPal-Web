import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { parseBody } from '@/lib/api/parseBody'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // ── Auth — any signed-in user ─────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    await adminAuth().verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const [parsed, bodyErr] = await parseBody(req)
    if (bodyErr) return bodyErr

    const { placeId, name, address, lat, lon } = parsed as {
      placeId?: string
      name?: string
      address?: string
      lat?: number
      lon?: number
    }

    if (!placeId || !name || lat == null || lon == null) {
      return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
    }

    const db = adminDb()

    // Check if a park with this placeId already exists
    const existing = await db.collection('parks').where('placeId', '==', placeId).limit(1).get()
    if (!existing.empty) {
      const doc = existing.docs[0]
      return NextResponse.json({ ok: true, park: { id: doc.id, ...doc.data() } })
    }

    // Extract city from address (e.g. "Strada X, 620172 Focșani, Romania" → "Focșani")
    const parts = (address || '').split(',').map(s => s.trim())
    let city = ''
    if (parts.length >= 2) {
      // Second-to-last part is usually "City" or "PostalCode City"
      const candidate = parts[parts.length - 2]
      city = candidate.replace(/^\d+\s*/, '').trim()
    }

    const data = {
      name,
      address: address || '',
      city,
      description: '',
      latitude: lat,
      longitude: lon,
      communityId: null,
      placeId,
      addedByUid: 'auto-discovered',
      createdAt: FieldValue.serverTimestamp(),
    }

    const ref = await db.collection('parks').add(data)
    return NextResponse.json({ ok: true, park: { id: ref.id, ...data, createdAt: null } })
  } catch (err) {
    console.error('ensure-park error:', err)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
