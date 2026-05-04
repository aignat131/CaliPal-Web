'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { ConversationDoc } from '@/types'
import { MessageSquare } from 'lucide-react'

function formatTs(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date()
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return date.toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Ieri'
  if (diffDays < 7) return date.toLocaleDateString('ro', { weekday: 'short' })
  return date.toLocaleDateString('ro', { day: '2-digit', month: '2-digit' })
}

function Avatar({ name, photoUrl, size }: { name: string; photoUrl: string; size: number }) {
  return (
    <div className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: '#1ED75F33' }}>
      {photoUrl
        ? <Image src={photoUrl} alt={name} width={size} height={size} className="object-cover" />
        : <span className="font-black text-brand-green" style={{ fontSize: size * 0.38 }}>{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}

export default function ChatListPane() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [conversations, setConversations] = useState<ConversationDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'conversations'),
      where('participantIds', 'array-contains', user.uid),
      orderBy('lastMessageTimestamp', 'desc')
    )
    const unsub = onSnapshot(
      q,
      snap => {
        setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ConversationDoc))
        setLoading(false)
      },
      err => {
        console.error('ChatListPane snapshot error', err)
        setLoading(false)
      }
    )
    return unsub
  }, [user])

  function openChat(conv: ConversationDoc) {
    if (!user) return
    const otherId = conv.participantIds.find(id => id !== user.uid) ?? ''
    const otherName = conv.participantNames[otherId] ?? 'Utilizator'
    router.push(`/chat/${conv.id}?otherUserId=${otherId}&otherName=${encodeURIComponent(otherName)}`)
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="px-4 pt-5 pb-3 border-b border-white/8">
        <h1 className="text-lg font-black text-white">Mesaje</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading
          ? <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
          : conversations.length === 0
            ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <MessageSquare size={40} className="text-white/15 mb-3" />
                <p className="text-sm font-semibold text-white/50">Nicio conversație</p>
              </div>
            )
            : conversations.map(conv => {
              if (!user) return null
              const otherId = conv.participantIds.find(id => id !== user.uid) ?? ''
              const otherName = conv.participantNames[otherId] ?? 'Utilizator'
              const otherPhoto = conv.participantPhotos?.[otherId] ?? ''
              const unread = (conv.unreadCount?.[user.uid] ?? 0)
              const hasUnread = unread > 0
              const isActive = pathname.startsWith(`/chat/${conv.id}`)

              return (
                <button key={conv.id} onClick={() => openChat(conv)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors border-b border-white/5 text-left"
                  style={{ backgroundColor: isActive ? '#1ED75F10' : undefined }}
                >
                  <Avatar name={otherName} photoUrl={otherPhoto} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${hasUnread ? 'font-bold text-white' : 'font-medium text-white/80'}`}>
                      {otherName}
                    </p>
                    <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-white/80 font-semibold' : 'text-white/40'}`}>
                      {conv.lastMessage || 'Începe o conversație'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-[11px] text-white/35">{formatTs(conv.lastMessageTimestamp)}</span>
                    {hasUnread && (
                      <span className="w-5 h-5 rounded-full bg-brand-green flex items-center justify-center text-[10px] font-black text-black">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
      </div>
    </div>
  )
}
