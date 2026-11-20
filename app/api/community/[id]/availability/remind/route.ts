import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { parseBody } from '@/lib/api/parseBody'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { notifyUser } from '@/lib/server/notify'
import { can } from '@/lib/schedule/permissions'
import { isDateKey, weekStartOf, weekRangeLabel } from '@/lib/schedule/week'
import { resolveWeek, type AvailabilityDoc } from '@/lib/schedule/availability'

export const dynamic = 'force-dynamic'

/** Minimum time between two reminder rounds for the same community + week. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000

/**
 * POST /api/community/{id}/availability/remind  { week, uids? }
 * Notifies members who haven't completed their schedule for `week`.
 * `uids` optionally narrows the target list (e.g. a filtered group); members
 * who already completed are always skipped, whatever the client sends.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: communityId } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!can(caller.role, 'sendReminders', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }

    const [body, bodyErr] = await parseBody<{ week?: unknown; uids?: unknown }>(req, 20_000)
    if (bodyErr) return bodyErr
    if (!isDateKey(body.week)) {
      return NextResponse.json({ ok: false, reason: 'bad-week' }, { status: 400 })
    }
    const week = weekStartOf(body.week)
    const only = Array.isArray(body.uids)
      ? new Set(body.uids.filter((u): u is string => typeof u === 'string').slice(0, 500))
      : null

    const db = adminDb()
    const base = db.collection('communities').doc(communityId)
    const cooldownRef = base.collection('reminders').doc(`availability_${week}`)

    // Cooldown check + claim in a transaction so double-clicks don't double-send.
    const claimed = await db.runTransaction(async tx => {
      const snap = await tx.get(cooldownRef)
      const last = (snap.data()?.lastSentAt as Timestamp | undefined)?.toMillis() ?? 0
      if (Date.now() - last < COOLDOWN_MS) return { ok: false as const, retryAt: last + COOLDOWN_MS }
      tx.set(cooldownRef, {
        lastSentAt: FieldValue.serverTimestamp(),
        lastSentBy: caller.uid,
        week,
      }, { merge: true })
      return { ok: true as const }
    })
    if (!claimed.ok) {
      return NextResponse.json({ ok: false, reason: 'cooldown', retryAt: claimed.retryAt }, { status: 429 })
    }

    const [communitySnap, membersSnap, availSnap] = await Promise.all([
      base.get(),
      base.collection('members').get(),
      base.collection('availability').get(),
    ])
    const communityName = (communitySnap.data()?.name as string) || 'Comunitate'
    const avail = new Map<string, AvailabilityDoc>()
    availSnap.forEach(d => avail.set(d.id, d.data() as AvailabilityDoc))

    const targets = membersSnap.docs
      .map(d => d.id)
      .filter(uid => uid !== caller.uid)
      .filter(uid => !only || only.has(uid))
      .filter(uid => !resolveWeek(avail.get(uid), week).completed)

    const range = weekRangeLabel(week)
    const results = await Promise.allSettled(targets.map(uid => notifyUser({
      toUid: uid,
      fromUid: caller.uid,
      type: 'AVAILABILITY_REMINDER',
      title: communityName,
      body: `Completează-ți orarul pentru săptămâna ${range} 🗓️`,
      relatedId: communityId,
      url: `/community/${communityId}?tab=orar`,
    })))
    const sent = results.filter(r => r.status === 'fulfilled').length

    await cooldownRef.set({ lastSentCount: sent }, { merge: true })
    return NextResponse.json({ ok: true, sent })
  } catch (e) {
    console.error('[availability remind]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
