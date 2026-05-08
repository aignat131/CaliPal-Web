'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { AppNotification } from '@/types'

interface NotificationContextValue {
  notifications: AppNotification[]
  unreadCount: number
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
})

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const prevUnread = useRef(0)

  useEffect(() => {
    if (!user) {
      setNotifications([])
      prevUnread.current = 0
      return
    }
    const unsub = onSnapshot(
      collection(db, 'notifications', user.uid, 'items'),
      snap => {
        const items = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as AppNotification))
          .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0))
        prevUnread.current = items.filter(n => !n.isRead).length
        setNotifications(items)
      }
    )
    return unsub
  }, [user])

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
