import {
  addDoc, collection, deleteField, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { LiftKey } from './records'

// Friends activity: small structured events (no free text) so the feed can be
// rendered in either language. Written by the user who achieved something.

export type ActivityKind = 'milestone' | 'challenge'

export interface ActivityDoc {
  id: string
  uid: string
  name: string
  photo: string
  kind: ActivityKind
  /** milestone: id from lib/milestones/tree.ts */
  milestoneId?: string
  lift?: LiftKey
  value?: number
  verified?: boolean
  /** challenge: the friend who set it */
  otherName?: string
  cheers: Record<string, true>
  createdAt: Timestamp | null
}

export type NewActivity = Omit<ActivityDoc, 'id' | 'cheers' | 'createdAt'>

export async function postActivity(a: NewActivity): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))
    await addDoc(collection(db, 'activity'), { ...clean, cheers: {}, createdAt: serverTimestamp() })
  } catch (e) {
    console.warn('[activity] post failed', e)
  }
}

/** Latest events from up to 30 users (Firestore `in` limit). */
export async function loadActivity(uids: string[], max = 20): Promise<ActivityDoc[]> {
  if (uids.length === 0) return []
  const snap = await getDocs(query(
    collection(db, 'activity'),
    where('uid', 'in', uids.slice(0, 30)),
    orderBy('createdAt', 'desc'),
    limit(max),
  ))
  return snap.docs.map(d => ({ id: d.id, cheers: {}, ...d.data() }) as ActivityDoc)
}

export async function toggleCheer(activityId: string, uid: string, on: boolean): Promise<void> {
  await updateDoc(doc(db, 'activity', activityId), { [`cheers.${uid}`]: on ? true : deleteField() })
}
