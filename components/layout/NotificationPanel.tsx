'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { markAllRead, deleteNotification } from '@/lib/firebase/notifications'
import type { AppNotification } from '@/types'
import { X, Bell, MessageSquare, UserPlus, UserCheck, Dumbbell, MapPin, Trash2, Users } from 'lucide-react'

function timeAgo(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date()
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'acum'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}z`
}

function notifIcon(type: AppNotification['type']) {
  switch (type) {
    case 'NEW_MESSAGE': return <MessageSquare size={16} className="text-blue-400" />
    case 'FRIEND_REQUEST': return <UserPlus size={16} className="text-brand-green" />
    case 'FRIEND_REQUEST_ACCEPTED': return <UserCheck size={16} className="text-brand-green" />
    case 'FRIEND_AT_YOUR_PARK': return <MapPin size={16} className="text-brand-green" />
    case 'PARK_CREATED':
    case 'PARK_REQUEST': return <MapPin size={16} className="text-yellow-400" />
    case 'COMMUNITY_REQUEST_APPROVED': return <Users size={16} className="text-brand-green" />
    case 'COMMUNITY_REQUEST_REJECTED': return <Users size={16} className="text-red-400" />
    case 'COMMUNITY_DELETED': return <Users size={16} className="text-red-400" />
    case 'TRAINING_STARTED':
    case 'TRAINING_UPDATED':
    case 'TRAINING_DELETED':
    case 'OFFICIAL_TRAINING_POSTED': return <Dumbbell size={16} className="text-purple-400" />
    default: return <Bell size={16} className="text-white/50" />
  }
}

function notifRoute(notif: AppNotification): string | null {
  switch (notif.type) {
    case 'NEW_MESSAGE': return notif.relatedId ? `/chat/${notif.relatedId}` : '/chat'
    case 'FRIEND_REQUEST': return '/profile/friends'
    case 'FRIEND_REQUEST_ACCEPTED': return notif.relatedId ? `/profile/${notif.relatedId}` : '/profile/friends'
    case 'FRIEND_AT_YOUR_PARK': return '/map'
    case 'TRAINING_STARTED':
    case 'TRAINING_UPDATED':
    case 'OFFICIAL_TRAINING_POSTED': return notif.relatedId ? `/community/${notif.relatedId}` : '/community'
    case 'PARK_CREATED': return '/map'
    case 'COMMUNITY_REQUEST_APPROVED': return notif.relatedId ? `/community/${notif.relatedId}` : '/map'
    case 'COMMUNITY_REQUEST_REJECTED': return '/map'
    case 'COMMUNITY_DELETED': return '/map'
    default: return null
  }
}

// ── Bell button with live unread badge ────────────────────────────────────────

export function NotificationBell({ uid }: { uid: string }) {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'notifications', uid, 'items'), snap => {
      setUnread(snap.docs.filter(d => !d.data().isRead).length)
    })
    return unsub
  }, [uid])

  async function handleOpen() {
    setOpen(true)
    if (unread > 0) await markAllRead(uid)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/8 transition-colors"
        style={{ backgroundColor: 'var(--app-surface)' }}
      >
        <Bell size={18} className="text-white/70" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-green text-black text-[9px] font-black flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && <NotificationPanel uid={uid} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function NotificationPanel({ uid, onClose }: { uid: string; onClose: () => void }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'notifications', uid, 'items'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as AppNotification))
        .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0))
      setNotifications(items)
    })
    return unsub
  }, [uid])

  // Close on backdrop click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function handleNotifClick(notif: AppNotification) {
    const route = notifRoute(notif)
    if (route) {
      onClose()
      router.push(route)
    }
  }

  async function handleDelete(e: React.MouseEvent, notifId: string) {
    e.stopPropagation()
    await deleteNotification(uid, notifId)
  }

  return (
    <div className="fixed inset-0 z-[4000] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-sm h-full flex flex-col shadow-2xl"
        style={{ backgroundColor: 'var(--app-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-brand-green" />
            <span className="font-black text-white text-sm">Notificări</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center"
          >
            <X size={14} className="text-white/70" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <Bell size={40} className="text-white/15" />
              <p className="text-sm text-white/40 font-medium">Nicio notificare</p>
              <p className="text-xs text-white/25">Vei primi notificări când prietenii tăi sunt activi.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/6">
              {notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-white/4 transition-colors ${
                    !n.isRead ? 'bg-brand-green/5' : ''
                  }`}
                >
                  {/* Icon */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: 'var(--app-bg)' }}
                  >
                    {notifIcon(n.type)}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-bold truncate ${n.isRead ? 'text-white/70' : 'text-white'}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-white/30 flex-shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed mt-0.5 line-clamp-2">{n.body}</p>
                  </div>

                  {/* Unread dot + delete */}
                  <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-brand-green" />
                    )}
                    <button
                      onClick={e => handleDelete(e, n.id)}
                      className="w-6 h-6 rounded-full bg-white/6 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 size={10} className="text-white/30" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
