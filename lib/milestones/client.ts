import { deleteField, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { postActivity } from '@/lib/gamification/activity'

/**
 * Tick / untick a milestone on users/{uid}.milestones. Ticking also shares it
 * with friends (best effort — the feed must never block the tick).
 */
export async function setMilestone(
  uid: string,
  milestoneId: string,
  done: boolean,
  me: { name: string; photo: string },
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    [`milestones.${milestoneId}`]: done ? Date.now() : deleteField(),
  })
  if (done) {
    await postActivity({ uid, name: me.name, photo: me.photo, kind: 'milestone', milestoneId })
  }
}
