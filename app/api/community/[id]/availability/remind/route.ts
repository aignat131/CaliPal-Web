import { NextRequest, NextResponse } from 'next/server'
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { parseBody } from '@/lib/api/parseBody'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { notifyUser } from '@/lib/server/notify'
import { can } from '@/lib/schedule/permissions'
import { isDateKey, todayKey, weekStartOf, weekRangeLabel } from '@/lib/schedule/week'
import { resolveWeek, type AvailabilityDoc } from '@/lib/schedule/availability'
import { sanitizeTestConfig, testStatus } from '@/lib/schedule/progress'

export const dynamic = 'force-dynamic'

/** Minimum time between two reminder rounds for the same community + kind + week. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000

type Kind = 'availability' | 'journal' | 'test'

/**
 * POST /api/community/{id}/availability/remind  { week, kind?, uids? }
 *   kind 'availability' (default) — members who haven't completed their schedule for `week`
 *   kind 'journal'                — members without a journal entry for `week`
 *   kind 'test'                   — members whose progress test is due
 * `uids` optionally narrows the target list; members who are already done are
 * always skipped, whatever the client sends.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: communityId } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!can(caller.role, 'sendReminders', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }

    const [body, bodyErr] = await parseBody<{ week?: unknown; uids?: unknown; kind?: unknown }>(req, 20_000)
    if (bodyErr) return bodyErr
    if (!isDateKey(body.week)) {
      return NextResponse.json({ ok: false, reason: 'bad-week' }, { status: 400 })
    }
    const kind: Kind = body.kind === 'journal' || body.kind === 'test' ? body.kind : 'availability'
    const week = weekStartOf(body.week)
    const only = Array.isArray(body.uids)
      ? new Set(body.uids.filter((u): u is string => typeof u === 'string').slice(0, 500))
      : null

    const db = adminDb()
    const base = db.collection('communities').doc(communityId)
    const cooldownKey = kind === 'test' ? `test_${todayKey()}` : `${kind}_${week}`
    const cooldownRef = base.collection('reminders').doc(kind === 'availability' ? `availability_${week}` : cooldownKey)

    // Cooldown check + claim in a transaction so double-clicks don't double-send.
    const claimed = await db.runTransaction(async tx => {
      const snap = await tx.get(cooldownRef)
      const last = (snap.data()?.lastSentAt as Timestamp | undefined)?.toMillis() ?? 0
      if (Date.now() - last < COOLDOWN_MS) return { ok: false as const, retryAt: last + COOLDOWN_MS }
      tx.set(cooldownRef, { lastSentAt: FieldValue.serverTimestamp(), lastSentBy: caller.uid, week, kind }, { merge: true })
      return { ok: true as const }
    })
    if (!claimed.ok) {
      return NextResponse.json({ ok: false, reason: 'cooldown', retryAt: claimed.retryAt }, { status: 429 })
    }

    const [communitySnap, membersSnap] = await Promise.all([base.get(), base.collection('members').get()])
    const communityName = (communitySnap.data()?.name as string) || 'Comunitate'
    const candidates = membersSnap.docs.map(d => d.id)
      .filter(uid => uid !== caller.uid)
      .filter(uid => !only || only.has(uid))

    let targets: string[] = []
    let message = ''
    const range = weekRangeLabel(week)

    if (kind === 'availability') {
      const availSnap = await base.collection('availability').get()
      const avail = new Map<string, AvailabilityDoc>()
      availSnap.forEach(d => avail.set(d.id, d.data() as AvailabilityDoc))
      targets = candidates.filter(uid => !resolveWeek(avail.get(uid), week).completed)
      message = `Completează-ți orarul pentru săptămâna ${range} 🗓️`
    } else if (kind === 'journal') {
      const has = await Promise.all(candidates.map(uid =>
        base.collection('memberPlans').doc(uid).collection('journal').doc(week).get().then(s => s.exists)))
      targets = candidates.filter((_, i) => !has[i])
      message = `Completează-ți jurnalul pentru săptămâna ${range} 📓`
    } else {
      const cfg = sanitizeTestConfig((await base.collection('config').doc('plan').get()).data())
      const today = todayKey()
      const last = await Promise.all(candidates.map(uid =>
        base.collection('memberPlans').doc(uid).collection('tests')
          .orderBy(FieldPath.documentId(), 'desc').limit(1).get()
          .then(s => s.docs.map(d => ({ date: d.id, values: {} })))))
      targets = candidates.filter((_, i) => testStatus(last[i], cfg.intervalWeeks, today).due)
      message = 'E timpul pentru testul de progres: tracțiuni, flotări, dips, L-sit, handstand 💪'
    }

    const results = await Promise.allSettled(targets.map(uid => notifyUser({
      toUid: uid,
      fromUid: caller.uid,
      type: kind === 'availability' ? 'AVAILABILITY_REMINDER' : 'PLAN_REMINDER',
      title: communityName,
      body: message,
      relatedId: communityId,
      url: kind === 'availability' ? `/community/${communityId}?tab=orar` : `/community/${communityId}/member/${uid}`,
    })))
    const sent = results.filter(r => r.status === 'fulfilled').length

    await cooldownRef.set({ lastSentCount: sent }, { merge: true })
    return NextResponse.json({ ok: true, sent })
  } catch (e) {
    console.error('[remind]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
