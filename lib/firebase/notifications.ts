import { collection, addDoc, serverTimestamp, writeBatch, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from './firestore'
import type { NotificationType } from '@/types'

export async function createNotification(
  toUid: string,
  type: NotificationType,
  title: string,
  body: string,
  relatedId?: string,
) {
  await addDoc(collection(db, 'notifications', toUid, 'items'), {
    type,
    title,
    body,
    isRead: false,
    relatedId: relatedId ?? null,
    createdAt: serverTimestamp(),
  })
}

export async function markAllRead(uid: string) {
  const snap = await getDocs(collection(db, 'notifications', uid, 'items'))
  if (snap.empty) return
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.update(d.ref, { isRead: true }))
  await batch.commit()
}

export async function deleteNotification(uid: string, notifId: string) {
  await deleteDoc(doc(db, 'notifications', uid, 'items', notifId))
}
