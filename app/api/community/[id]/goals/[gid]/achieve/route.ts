import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { parseBody } from '@/lib/api/parseBody'
import { getCommunityCaller } from '@/lib/server/communityAuth'
import { can } from '@/lib/schedule/permissions'
import { goalRewardDecision } from '@/lib/schedule/goals'
import { NO_POINTS } from '@/lib/schedule/attendance'

export const dynamic = 'force-dynamic'

/**
 * POST /api/community/{id}/goals/{gid}/achieve  { uid? }
 * Marks a goal "atins": auto post in the feed + bonus leaderboard points
 * (configurable, once per goal, with anti-farming limits).
 * The member marks their own goals; a Fondator/Antrenor can mark a member's
 * goal (pass `uid`) — that also skips the minimum-age rule.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; gid: string }> }) {
  try {
    const { id: communityId, gid } = await params
    const [caller, err] = await getCommunityCaller(req, communityId)
    if (err) return err
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(gid)) {
      return NextResponse.json({ ok: false, reason: 'bad-goal' }, { status: 400 })
    }
    const [body, bodyErr] = await parseBody<{ uid?: unknown }>(req, 2_000)
    if (bodyErr) return bodyErr
    const targetUid = typeof body.uid === 'string' && body.uid ? body.uid : caller.uid
    const byCoach = targetUid !== caller.uid
    if (byCoach && !can(caller.role, 'assignExercises', caller.isSuperAdmin)) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
    }
    if (!byCoach && !caller.role) {
      return NextResponse.json({ ok: false, reason: 'not-member' }, { status: 403 })
    }

    const db = adminDb()
    const base = db.collection('communities').doc(communityId)
    const goalsCol = base.collection('memberPlans').doc(targetUid).collection('goals')
    const goalRef = goalsCol.doc(gid)
    const memberRef = base.collection('members').doc(targetUid)
    const points = NO_POINTS

    const result = await db.runTransaction(async tx => {
      const [goalSnap, memberSnap, rewardedSnap] = await Promise.all([
        tx.get(goalRef), tx.get(memberRef), tx.get(goalsCol.where('rewarded', '==', true)),
      ])
      if (!goalSnap.exists) return { code: 404, reason: 'not-found' } as const
      if (!memberSnap.exists) return { code: 404, reason: 'not-member' } as const
      const g = goalSnap.data()!
      if (g.status === 'ACHIEVED') return { code: 200, rewarded: 0, already: true } as const

      const now = Date.now()
      const decision = goalRewardDecision({
        now,
        goalCreatedAtMs: byCoach ? 0 : ((g.createdAt as Timestamp | undefined)?.toMillis?.() ?? null),
        alreadyRewarded: g.rewarded === true,
        recentRewardTimesMs: rewardedSnap.docs
          .filter(d => d.id !== gid)
          .map(d => (d.data().achievedAt as Timestamp | undefined)?.toMillis?.() ?? 0),
      })
      const bonus = decision.reward ? points.goalAchieved : 0

      tx.update(goalRef, {
        status: 'ACHIEVED',
        achievedAt: FieldValue.serverTimestamp(),
        ...(decision.reward ? { rewarded: true, rewardPoints: bonus } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      })
      if (bonus > 0) tx.update(memberRef, { trainingPoints: FieldValue.increment(bonus) })

      const m = memberSnap.data()!
      const name = (m.displayName as string) || 'Un membru'
      // One feed post per goal, ever (re-achieving after an undo doesn't repost).
      if (!g.posted) {
        tx.update(goalRef, { posted: true })
        tx.set(base.collection('posts').doc(), {
          authorId: targetUid,
          authorName: name,
          authorRole: (m.role as string) ?? 'MEMBER',
          authorPhotoUrl: (m.photoUrl as string) || null,
          content: `🏆 ${name} a atins un obiectiv: ${g.skill}${g.target ? ` — ${g.target}` : ''}!${bonus > 0 ? ` (+${bonus} puncte)` : ''}`,
          likesCount: 0,
          commentsCount: 0,
          kind: 'goal',
          createdAt: FieldValue.serverTimestamp(),
        })
      }
      return { code: 200, rewarded: bonus, already: false, reason: decision.reward ? undefined : decision.reason } as const
    })

    if (result.code !== 200) return NextResponse.json({ ok: false, reason: result.reason }, { status: result.code })
    return NextResponse.json({ ok: true, rewarded: result.rewarded, noRewardReason: 'reason' in result ? result.reason : undefined })
  } catch (e) {
    console.error('[goal achieve]', e)
    return NextResponse.json({ ok: false, reason: 'server-error' }, { status: 500 })
  }
}
