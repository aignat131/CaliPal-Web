import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, adminMessaging } from '@/lib/firebase/admin'
import type { NotificationType } from '@/types'

/**
 * Server-side notification: in-app item + best-effort web push
 * (same storage as lib/firebase/notifications.ts and /api/push).
 * Push respects the user's `pushNotifCommunity` opt-out.
 */
export async function notifyUser(opts: {
  toUid: string
  fromUid: string
  type: NotificationType
  title: string
  body: string
  relatedId?: string
  url?: string
}): Promise<void> {
  const db = adminDb()
  await db.collection('notifications').doc(opts.toUid).collection('items').add({
    type: opts.type,
    title: opts.title,
    body: opts.body,
    isRead: false,
    relatedId: opts.relatedId ?? null,
    fromUid: opts.fromUid,
    createdAt: FieldValue.serverTimestamp(),
  })

  try {
    const [tokenDoc, userDoc] = await Promise.all([
      db.collection('fcm_tokens').doc(opts.toUid).get(),
      db.collection('users').doc(opts.toUid).get(),
    ])
    const token = tokenDoc.data()?.token as string | undefined
    if (!token || userDoc.data()?.pushNotifCommunity === false) return
    await adminMessaging().send({
      token,
      notification: { title: opts.title, body: opts.body },
      webpush: {
        notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' },
        fcmOptions: opts.url ? { link: opts.url } : undefined,
        data: { url: opts.url ?? '/home' },
      },
    })
  } catch {
    // Push is best-effort; the in-app notification is already stored.
  }
}
