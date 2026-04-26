'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  collection, query, orderBy, onSnapshot, addDoc, doc,
  setDoc, updateDoc, serverTimestamp, increment, getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import type { ChatMessage, ConversationDoc } from '@/types'
import { ArrowLeft, Send } from 'lucide-react'

function formatTs(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date()
  return date.toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatDetailPage() {
  const { user } = useAuth()
  const { displayName: myName, photoUrl: myPhoto } = useMyProfile()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const conversationId = params.conversationId as string
  const otherUserId = searchParams.get('otherUserId') ?? ''
  const otherName = searchParams.get('otherName') ?? 'Utilizator'

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [otherPhoto, setOtherPhoto] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load other user photo
  useEffect(() => {
    if (!otherUserId) return
    getDoc(doc(db, 'users', otherUserId)).then(snap => {
      if (snap.exists()) setOtherPhoto(snap.data().photoUrl ?? '')
    })
  }, [otherUserId])

  // Real-time messages
  useEffect(() => {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('timestamp', 'asc')
    )
    const unsub = onSnapshot(
      q,
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ChatMessage))
        setLoading(false)
      },
      () => setLoading(false), // permission denied — show empty state
    )
    return unsub
  }, [conversationId])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark messages as read
  useEffect(() => {
    if (!user) return
    updateDoc(doc(db, 'conversations', conversationId), {
      [`unreadCount.${user.uid}`]: 0,
    }).catch(() => {}) // conversation might not exist yet
  }, [conversationId, user])

  async function sendMessage() {
    if (!user || !text.trim() || sending) return
    const content = text.trim()
    setText('')
    setSending(true)
    try {
      // Ensure conversation doc exists
      const convRef = doc(db, 'conversations', conversationId)
      const convSnap = await getDoc(convRef)
      if (!convSnap.exists()) {
        const otherSnap = await getDoc(doc(db, 'users', otherUserId))
        const otherPhotoUrl = (otherSnap.data()?.photoUrl as string) ?? ''
        await setDoc(convRef, {
          id: conversationId,
          participantIds: [user.uid, otherUserId],
          participantNames: { [user.uid]: myName, [otherUserId]: otherName },
          participantPhotos: { [user.uid]: myPhoto, [otherUserId]: otherPhotoUrl },
          lastMessage: content,
          lastMessageSenderId: user.uid,
          lastMessageTimestamp: serverTimestamp(),
          unreadCount: { [otherUserId]: 1 },
        } as Partial<ConversationDoc>)
      } else {
        await updateDoc(convRef, {
          lastMessage: content,
          lastMessageSenderId: user.uid,
          lastMessageTimestamp: serverTimestamp(),
          [`unreadCount.${otherUserId}`]: increment(1),
          [`participantPhotos.${user.uid}`]: myPhoto,
        })
      }
      // Add message
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        senderId: user.uid,
        senderName: myName,
        text: content,
        timestamp: serverTimestamp(),
        isRead: false,
      })
    } finally {
      setSending(false)
    }
  }

  const myInitial = (myName || 'U').charAt(0).toUpperCase()
  const otherInitial = otherName.charAt(0).toUpperCase()

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] md:h-screen" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 flex-shrink-0">
        {/* Back button — hidden on desktop where the sidebar is always visible */}
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center md:hidden">
          <ArrowLeft size={18} className="text-white/80" />
        </button>
        <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#1ED75F33' }}>
          {otherPhoto
            ? <img src={otherPhoto} alt={otherName} className="w-full h-full object-cover" />
            : <span className="font-black text-brand-green text-sm">{otherInitial}</span>}
        </div>
        <span className="font-semibold text-white">{otherName}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-center text-sm text-white/35 py-8">Trimite primul mesaj!</p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.senderId === user?.uid
          const showAvatar = i === 0 || messages[i - 1]?.senderId !== msg.senderId
          return (
            <div key={msg.id} className={`flex items-end gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
              {/* Avatar spacer */}
              <div className="w-7 flex-shrink-0">
                {!isMe && showAvatar && (
                  <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: '#1ED75F33' }}>
                    {otherPhoto
                      ? <img src={otherPhoto} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xs font-black text-brand-green">{otherInitial}</span>}
                  </div>
                )}
              </div>
              <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={{
                    backgroundColor: isMe ? '#1ED75F' : 'var(--app-surface)',
                    color: isMe ? '#0D1B1A' : 'rgba(255,255,255,0.9)',
                    borderBottomRightRadius: isMe ? 4 : undefined,
                    borderBottomLeftRadius: !isMe ? 4 : undefined,
                  }}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-white/25 mt-0.5 px-1">
                  {formatTs(msg.timestamp)}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8 flex-shrink-0"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Scrie un mesaj..."
          className="flex-1 h-11 rounded-full px-4 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/40 transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={sending || !text.trim()}
          className="w-11 h-11 rounded-full bg-brand-green disabled:opacity-40 flex items-center justify-center transition-opacity"
        >
          <Send size={15} className="text-black" />
        </button>
      </div>
    </div>
  )
}
