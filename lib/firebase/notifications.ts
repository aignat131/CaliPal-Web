import { collection, addDoc, serverTimestamp, writeBatch, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from './firestore'
import type { NotificationType } from '@/types'

export async function createNotification(
  toUid: string,
  type: NotificationType,
  title: string,
  body: string,
  relatedId?: string,
  fromUid?: string,
) {
  await addDoc(collection(db, 'notifications', toUid, 'items'), {
    type,
    title,
    body,
    isRead: false,
    relatedId: relatedId ?? null,
    fromUid: fromUid ?? null,
    createdAt: serverTimestamp(),
  })
}

export async function markAllRead(uid: string) {
  const snap = await getDocs(collection(db, 'notifications', uid, 'items'))
  if (snap.empty) return
  const BATCH_LIMIT = 490
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_LIMIT).forEach(d => batch.update(d.ref, { isRead: true }))
    await batch.commit()
  }
}

export async function deleteNotification(uid: string, notifId: string) {
  await deleteDoc(doc(db, 'notifications', uid, 'items', notifId))
}
