import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { parseBody } from '@/lib/api/parseBody'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { can } from '@/lib/schedule/permissions'
import { parseTrainingMs } from '@/lib/schedule/week'
import {
  canCheckIn, canEditAttendance, diffAwards, legacyAwards, targetAwards, NO_POINTS,
} from '@/lib/schedule/attendance'

export const dynamic = 'force-dynamic'

type Mode = 'set' | 'auto' | 'checkin'

/**
 * POST /api/community/{id}/trainings/{tid}/attendance
 *   { mode: 'set', attendedUids }  staff/author — set the attendee list (closes the training)
 *   { mode: 'auto' }               staff/author — close an ended training with RSVP "GOING" + check-ins
 *   { mode: 'checkin' }            member — check yourself in around the session time
 * Points come from communities/{id}/config/plan (default 10) and are applied
 * as a diff against `attendanceAwards`, so repeated calls never double-count.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  try {
    const { id: communityId, tid } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(tid)) {
      return NextResponse.json({ ok: false, reason: 'bad-training' }, { status: 400 })
    }

    const [body, bodyErr] = await parseBody<{ mode?: unknown; attendedUids?: unknown }>(req, 30_000)
    if (bodyErr) return bodyErr
    const mode = body.mode as Mode
    if (mode !== 'set' && mode !== 'auto' && mode !== 'checkin') {
      return NextResponse.json({ ok: false, reason: 'bad-mode' }, { status: 400 })
    }
    if (mode === 'checkin' && !caller.role) {
      return NextResponse.json({ ok: false, reason: 'not-member' }, { status: 403 })
    }
    const requested = mode === 'set'
      ? Array.isArray(body.attendedUids)
        ? Array.from(new Set(body.attendedUids.filter((u): u is string => typeof u === 'string'))).slice(0, 500)
        : null
      : null
    if (mode === 'set' && !requested) {
      return NextResponse.json({ ok: false, reason: 'bad-list' }, { status: 400 })
    }

    const db = adminDb()
    const base = db.collection('communities').doc(communityId)
    const ref = base.collection('trainings').doc(tid)
    const points = NO_POINTS

    const result = await db.runTransaction(async tx => {
      const [snap, membersSnap] = await Promise.all([tx.get(ref), tx.get(base.collection('members'))])
      if (!snap.exists || snap.data()?.deletedAt) return { code: 404, reason: 'not-found' } as const
      const t = snap.data()!
      const memberIds = new Set(membersSnap.docs.map(d => d.id))
      const now = Date.now()
      const startMs = parseTrainingMs(t.timeStart)
      const endMs = parseTrainingMs(t.timeEnd) ?? (startMs !== null ? startMs + 2 * 3600_000 : null)
      const closedAtMs = (t.closedAt as Timestamp | undefined)?.toMillis?.() ?? null
      const attendedBy = (t.attendedBy ?? []) as string[]
      const isAuthor = t.authorId === caller.uid
      const isManager = can(caller.role, 'markAttendance', caller.isSuperAdmin) || (isAuthor && !!caller.role)

      let attended: string[]
      if (mode === 'checkin') {
        const check = canCheckIn({ now, startMs, endMs })
        if (!check.ok) return { code: 409, reason: check.reason } as const
        if (attendedBy.includes(caller.uid)) return { code: 200, attendedBy, changed: 0 } as const
        attended = [...attendedBy, caller.uid]
      } else {
        if (!isManager) return { code: 403, reason: 'forbidden' } as const
        const check = canEditAttendance({ now, startMs, closedAtMs, isSuperAdmin: caller.isSuperAdmin })
        if (!check.ok) return { code: 409, reason: check.reason } as const
        if (mode === 'auto') {
          if (t.isClosed) return { code: 200, attendedBy, changed: 0 } as const
          if (endMs !== null && now < endMs) return { code: 409, reason: 'not-ended' } as const
          const going = Object.entries((t.rsvps ?? {}) as Record<string, string>)
            .filter(([, s]) => s === 'GOING').map(([u]) => u)
          attended = Array.from(new Set([...attendedBy, ...going]))
        } else {
          attended = requested!
        }
      }
      // Only current members can be credited
      attended = attended.filter(u => memberIds.has(u))

      const prev = (t.attendanceAwards as Record<string, number> | undefined)
        ?? (t.isClosed ? legacyAwards(attendedBy, t.authorId) : {})
      const authorId = memberIds.has(t.authorId) ? (t.authorId as string) : undefined
      const next = targetAwards(attended, authorId, points)
      const deltas = diffAwards(prev, next)

      const closes = mode !== 'checkin'
      tx.update(ref, {
        attendedBy: attended,
        attendanceAwards: next,
        attendanceUpdatedAt: FieldValue.serverTimestamp(),
        ...(closes ? {
          isClosed: true,
          closedByUid: caller.uid,
          ...(closedAtMs === null ? { closedAt: FieldValue.serverTimestamp() } : {}),
        } : {}),
      })
      for (const d of deltas) {
        if (!memberIds.has(d.uid)) continue
        tx.update(base.collection('members').doc(d.uid), {
          trainingPoints: FieldValue.increment(d.points),
          ...(d.attendedDelta ? { totalTrainingsAttended: FieldValue.increment(d.attendedDelta) } : {}),
        })
        if (d.attendedDelta) {
          tx.set(db.collection('users').doc(d.uid), { totalTrainings: FieldValue.increment(d.attendedDelta) }, { merge: true })
        }
      }
      return { code: 200, attendedBy: attended, changed: deltas.length } as const
    })

    if (result.code !== 200) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: result.code })
    }
    return NextResponse.json({ ok: true, attendedBy: result.attendedBy, changed: result.changed })
  } catch (e) {
    console.error('[attendance POST]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
