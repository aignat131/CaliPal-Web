import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { parseBody } from '@/lib/api/parseBody'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { notifyUser } from '@/lib/server/notify'
import { can } from '@/lib/schedule/permissions'
import { endTimeOf, focusLabel, parseSessionInput } from '@/lib/schedule/sessions'
import { bucharestToMs, toTrainingDateTime, weekDays, weekStartOf } from '@/lib/schedule/week'

export const dynamic = 'force-dynamic'

/**
 * POST /api/community/{id}/sessions — schedule a training from the plan.
 * Creates a regular `trainings` doc (+ the immutable mirror and backup the app
 * always writes), a feed post, and notifies members.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: communityId } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!can(caller.role, 'createSessions', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }

    const [body, bodyErr] = await parseBody(req, 30_000)
    if (bodyErr) return bodyErr
    const parsed = parseSessionInput(body)
    if (!parsed.ok) return NextResponse.json({ ok: false, reason: parsed.reason }, { status: 400 })
    const s = parsed.value

    const startMs = bucharestToMs(s.date, +s.startTime.slice(0, 2), +s.startTime.slice(3, 5))
    if (startMs < Date.now() - 60 * 60 * 1000) {
      return NextResponse.json({ ok: false, reason: 'in-the-past' }, { status: 400 })
    }

    const db = adminDb()
    const base = db.collection('communities').doc(communityId)

    // Park must belong to this community
    let location = s.location
    if (s.parkId) {
      const park = await db.collection('parks').doc(s.parkId).get()
      if (!park.exists || park.data()?.communityId !== communityId) {
        return NextResponse.json({ ok: false, reason: 'bad-park' }, { status: 400 })
      }
      location = (park.data()?.name as string) || location
    }

    const [communitySnap, userSnap] = await Promise.all([
      base.get(),
      db.collection('users').doc(caller.uid).get(),
    ])
    const communityName = (communitySnap.data()?.name as string) || 'Comunitate'
    const authorName = (userSnap.data()?.displayName as string) || caller.displayName || 'Antrenor'
    const authorPhoto = (userSnap.data()?.photoUrl as string) || null

    const endTime = endTimeOf(s.startTime, s.durationMinutes)
    const timeStart = toTrainingDateTime(s.date, s.startTime)
    const timeEnd = toTrainingDateTime(s.date, endTime)

    const trainingData = {
      name: s.name,
      description: s.notes,
      timeStart,
      timeEnd,
      location,
      authorId: caller.uid,
      authorName,
      authorCoach: true,
      authorAdmin: caller.role === 'ADMIN',
      official: true,
      reminderMinutes: 30,
      rsvps: {},
      rsvpNames: {},
      ...(s.exercises.length ? { exercises: s.exercises } : {}),
      source: 'plan' as const,
      focus: s.focus,
      parkId: s.parkId,
      capacity: s.capacity,
      templateId: s.templateId,
      durationMinutes: s.durationMinutes,
      createdAt: FieldValue.serverTimestamp(),
    }

    const trainingRef = base.collection('trainings').doc()
    const day = weekDays(weekStartOf(s.date)).find(d => d.dateKey === s.date)!
    const lines = [
      `📅 Antrenament nou: ${s.name}`,
      `${focusLabel(s.focus)} · ${day.name} ${day.dayMonth}, ${s.startTime}–${endTime}`,
      ...(location ? [`📍 ${location}`] : []),
      ...(s.capacity ? [`👥 ${s.capacity} locuri`] : []),
      ...(s.notes ? ['', s.notes] : []),
    ]

    const batch = db.batch()
    batch.set(trainingRef, trainingData)
    batch.set(base.collection('trainings_safe').doc(trainingRef.id), trainingData)
    batch.set(db.collection('training_backups').doc(`community_${communityId}_${trainingRef.id}`), {
      ...trainingData,
      sourceType: 'community',
      sourceId: communityId,
      originalTrainingId: trainingRef.id,
      backedUpAt: FieldValue.serverTimestamp(),
    })
    batch.set(base.collection('posts').doc(), {
      authorId: caller.uid,
      authorName,
      authorRole: caller.role ?? 'ADMIN',
      authorPhotoUrl: authorPhoto,
      content: lines.join('\n').slice(0, 2000),
      likesCount: 0,
      commentsCount: 0,
      kind: 'session',
      trainingId: trainingRef.id,
      createdAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()

    // Notify members (best-effort)
    const members = await base.collection('members').get()
    await Promise.allSettled(members.docs
      .filter(m => m.id !== caller.uid)
      .map(m => notifyUser({
        toUid: m.id,
        fromUid: caller.uid,
        type: 'OFFICIAL_TRAINING_POSTED',
        title: communityName,
        body: `${s.name} · ${day.name} ${day.dayMonth}, ${s.startTime}. Vii?`,
        relatedId: communityId,
        url: `/training/${communityId}/${trainingRef.id}`,
      })))

    return NextResponse.json({ ok: true, trainingId: trainingRef.id })
  } catch (e) {
    console.error('[sessions POST]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
