import {
  addDoc, collection, doc, getDocs, query, serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { createNotification } from '@/lib/firebase/notifications'
import type { UserDoc, WorkoutDoc } from '@/types'
import { postActivity } from './activity'
import { LIFTS, computeRecords, formatRecordValue, type LiftKey } from './records'

// Async friend challenges: "do N pull-ups in one set before <deadline>".
// Stored in challenges/{id}; completed automatically when the recipient saves
// a workout whose best competitive set reaches the target (see checkChallenges).

export type ChallengeStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED'

export interface FriendChallenge {
  id: string
  fromUid: string
  fromName: string
  fromPhoto: string
  toUid: string
  toName: string
  toPhoto: string
  lift: LiftKey
  target: number
  deadline: Timestamp
  status: ChallengeStatus
  message?: string
  result?: number
  verified?: boolean
  completedAt?: Timestamp | null
  createdAt: Timestamp | null
}

export const DEADLINE_DAYS = [3, 7, 14] as const

/** What a challenge looks like to the viewer right now. */
export type ChallengeView = ChallengeStatus | 'EXPIRED'

export function viewStatus(c: Pick<FriendChallenge, 'status' | 'deadline'>, now = new Date()): ChallengeView {
  if ((c.status === 'PENDING' || c.status === 'ACCEPTED') && c.deadline.toDate() < now) return 'EXPIRED'
  return c.status
}

/** Best competitive set for the challenge's lift in `workout`, if it meets the target. */
export function completionFrom(
  c: Pick<FriendChallenge, 'lift' | 'target'>,
  workout: Pick<WorkoutDoc, 'exercises' | 'backdated'>,
): { result: number; verified: boolean } | null {
  const r = computeRecords([workout], { competitive: true })[c.lift]
  return r.value >= c.target ? { result: r.value, verified: r.verified } : null
}

export async function createChallenge(input: {
  from: { uid: string; name: string; photo: string }
  to: { uid: string; name: string; photo: string }
  lift: LiftKey
  target: number
  days: number
  message?: string
}): Promise<string> {
  const deadline = Timestamp.fromDate(new Date(Date.now() + input.days * 86400000))
  const ref = await addDoc(collection(db, 'challenges'), {
    fromUid: input.from.uid, fromName: input.from.name, fromPhoto: input.from.photo,
    toUid: input.to.uid, toName: input.to.name, toPhoto: input.to.photo,
    lift: input.lift,
    target: input.target,
    deadline,
    status: 'PENDING',
    message: (input.message ?? '').slice(0, 140),
    createdAt: serverTimestamp(),
  })
  const lift = LIFTS.find(l => l.key === input.lift)!
  await createNotification(input.to.uid, 'CHALLENGE_RECEIVED',
    `⚔️ ${input.from.name} te provoacă`,
    `${lift.name.RO}: ${formatRecordValue(input.target, lift.metric)}${lift.metric === 'reps' ? ' rep' : ''} într-o serie, în ${input.days} zile.`,
    ref.id, input.from.uid).catch(() => {})
  return ref.id
}

export async function respondToChallenge(c: FriendChallenge, accept: boolean): Promise<void> {
  await updateDoc(doc(db, 'challenges', c.id), { status: accept ? 'ACCEPTED' : 'DECLINED' })
  await createNotification(c.fromUid, 'CHALLENGE_UPDATE',
    accept ? `💪 ${c.toName} a acceptat provocarea` : `${c.toName} a refuzat provocarea`,
    LIFTS.find(l => l.key === c.lift)!.name.RO, c.id, c.toUid).catch(() => {})
}

export async function cancelChallenge(c: FriendChallenge): Promise<void> {
  await updateDoc(doc(db, 'challenges', c.id), { status: 'CANCELLED' })
}

export async function loadMyChallenges(uid: string): Promise<FriendChallenge[]> {
  const [inc, out] = await Promise.all([
    getDocs(query(collection(db, 'challenges'), where('toUid', '==', uid))),
    getDocs(query(collection(db, 'challenges'), where('fromUid', '==', uid))),
  ])
  const all = [...inc.docs, ...out.docs].map(d => ({ id: d.id, ...d.data() }) as FriendChallenge)
  return all.sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()))
}

/** After a workout is saved: complete accepted challenges it satisfies. Never throws. */
export async function checkChallenges(uid: string, workout: WorkoutDoc, me?: Partial<UserDoc>): Promise<number> {
  try {
    if (workout.backdated) return 0
    const snap = await getDocs(query(collection(db, 'challenges'),
      where('toUid', '==', uid), where('status', '==', 'ACCEPTED')))
    let done = 0
    for (const d of snap.docs) {
      const c = { id: d.id, ...d.data() } as FriendChallenge
      if (viewStatus(c) === 'EXPIRED') continue
      const hit = completionFrom(c, workout)
      if (!hit) continue
      await updateDoc(d.ref, {
        status: 'COMPLETED', result: Math.round(hit.result), verified: hit.verified, completedAt: serverTimestamp(),
      })
      const lift = LIFTS.find(l => l.key === c.lift)!
      const val = `${formatRecordValue(hit.result, lift.metric)}${lift.metric === 'reps' ? ' rep' : ''}`
      await createNotification(c.fromUid, 'CHALLENGE_UPDATE',
        `🏁 ${c.toName} a reușit provocarea!`, `${lift.name.RO}: ${val}${hit.verified ? ' (verificat AI)' : ''}`,
        c.id, uid).catch(() => {})
      await createNotification(uid, 'CHALLENGE_UPDATE',
        '🏁 Provocare reușită!', `${lift.name.RO}: ${val}, provocarea lui ${c.fromName}.`, c.id, uid).catch(() => {})
      await postActivity({
        uid, name: me?.displayName ?? c.toName, photo: me?.photoUrl ?? c.toPhoto,
        kind: 'challenge', lift: c.lift, value: Math.round(hit.result), verified: hit.verified, otherName: c.fromName,
      })
      done++
    }
    return done
  } catch (e) {
    console.warn('[challenges] check failed', e)
    return 0
  }
}
