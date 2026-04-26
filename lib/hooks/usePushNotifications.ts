'use client'

import { useEffect, useState } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'

export type PushStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported'

export function usePushNotifications(uid: string | undefined) {
  const [status, setStatus] = useState<PushStatus>('idle')

  useEffect(() => {
    if (!uid) return
    if (!('Notification' in window)) { setStatus('unsupported'); return }
    if (Notification.permission === 'granted') setStatus('granted')
    else if (Notification.permission === 'denied') setStatus('denied')
  }, [uid])

  async function requestPermission(): Promise<boolean> {
    if (!uid || !('Notification' in window)) return false
    setStatus('loading')
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setStatus('granted')
        // Save FCM token if available (requires NEXT_PUBLIC_FIREBASE_VAPID_KEY)
        await saveFcmToken(uid)
        return true
      }
      setStatus('denied')
      return false
    } catch {
      setStatus('denied')
      return false
    }
  }

  return { status, requestPermission }
}

async function saveFcmToken(uid: string) {
  try {
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    if (!vapidKey) return

    const { getMessaging, getToken } = await import('firebase/messaging')
    const { app } = await import('@/lib/firebase/config')
    const messaging = getMessaging(app)

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    })

    if (token) {
      await setDoc(doc(db, 'fcm_tokens', uid), {
        uid,
        token,
        updatedAt: serverTimestamp(),
      })
    }
  } catch {
    // FCM not configured — notifications still work via SW push API
  }
}
