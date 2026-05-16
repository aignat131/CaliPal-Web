'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  collection, query, orderBy, onSnapshot, addDoc, doc,
  setDoc, updateDoc, serverTimestamp, increment, getDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { createNotification } from '@/lib/firebase/notifications'
import type { ChatMessage, ConversationDoc } from '@/types'
import { ArrowLeft, Send, Check, CheckCheck } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

function formatTs(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date()
  return date.toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })
}

const TYPING_EXPIRY_MS = 4000

export default function ChatDetailPage() {
  const { user } = useAuth()
  const { displayName: myName, photoUrl: myPhoto } = useMyProfile()
  const router = useRouter()
  const t = useT()
  const params = useParams()
  const searchParams = useSearchParams()
  const conversationId = params.conversationId as string
  const otherUserIdParam = searchParams.get('otherUserId') ?? ''
  const otherNameParam = searchParams.get('otherName') ?? ''

  const [otherUserId, setOtherUserId] = useState(otherUserIdParam)
  const [otherName, setOtherName] = useState(otherNameParam || t('common.user_fallback'))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [otherPhoto, setOtherPhoto] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingActiveRef = useRef(false)

  // When navigating from a notification (no URL params), derive other user from conversation doc
  useEffect(() => {
    if (!user) return
    if (otherUserIdParam) return
    getDoc(doc(db, 'conversations', conversationId)).then(snap => {
      if (!snap.exists()) return
      const data = snap.data() as ConversationDoc
      const otherId = data.participantIds.find(id => id !== user.uid) ?? ''
      if (otherId) {
        setOtherUserId(otherId)
        setOtherName(data.participantNames?.[otherId] || t('common.user_fallback'))
        setOtherPhoto(data.participantPhotos?.[otherId] || '')
      }
    })
  }, [user, conversationId, otherUserIdParam, t])

  // Load other user photo (when otherUserId comes from URL params)
  useEffect(() => {
    if (!otherUserId || !otherUserIdParam) return
    getDoc(doc(db, 'users', otherUserId)).then(snap => {
      if (snap.exists()) setOtherPhoto(snap.data().photoUrl ?? '')
    })
  }, [otherUserId, otherUserIdParam])

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
      () => {
        if (otherUserIdParam) {
          setLoading(false)
        } else {
          setNotFound(true)
          setLoading(false)
        }
      },
    )
    return unsub
  }, [conversationId, otherUserIdParam])

  // Watch the other user's typing indicator
  useEffect(() => {
    if (!otherUserId) return
    const typingDoc = doc(db, 'conversations', conversationId, 'typing', otherUserId)
    const unsub = onSnapshot(typingDoc, snap => {
      if (!snap.exists()) { setOtherIsTyping(false); return }
      const at = snap.data()?.at
      if (!at) { setOtherIsTyping(false); return }
      const ms = at.toMillis ? at.toMillis() : Date.now()
      setOtherIsTyping(Date.now() - ms < TYPING_EXPIRY_MS)
    })
    return unsub
  }, [conversationId, otherUserId])

  // Scroll to bottom on new messages or typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, otherIsTyping])

  // Mark messages as read + mark my sent messages as isRead for receipt display
  useEffect(() => {
    if (!user || messages.length === 0) return
    updateDoc(doc(db, 'conversations', conversationId), {
      [`unreadCount.${user.uid}`]: 0,
    }).catch(() => {})

    const unread = messages.filter(m => m.senderId !== user.uid && !m.isRead)
    if (unread.length === 0) return
    const batch = writeBatch(db)
    unread.forEach(m => {
      batch.update(doc(db, 'conversations', conversationId, 'messages', m.id), { isRead: true })
    })
    batch.commit().catch(() => {})
  }, [conversationId, user, messages])

  // Typing indicator — debounced write + clear on stop
  const handleTyping = useCallback(() => {
    if (!user) return
    if (!typingActiveRef.current) {
      typingActiveRef.current = true
      setDoc(doc(db, 'conversations', conversationId, 'typing', user.uid), {
        at: serverTimestamp(),
      }).catch(() => {})
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      typingActiveRef.current = false
      setDoc(doc(db, 'conversations', conversationId, 'typing', user.uid), {
        at: null,
      }).catch(() => {})
    }, 2500)
  }, [user, conversationId])

  // Clear typing indicator on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (user && typingActiveRef.current) {
        setDoc(doc(db, 'conversations', conversationId, 'typing', user.uid), { at: null }).catch(() => {})
      }
    }
  }, [user, conversationId])

  async function sendMessage() {
    if (!user || !text.trim() || sending) return
    const content = text.trim()
    setText('')
    setSending(true)

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingActiveRef.current = false
    setDoc(doc(db, 'conversations', conversationId, 'typing', user.uid), { at: null }).catch(() => {})

    try {
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
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        senderId: user.uid,
        senderName: myName,
        text: content,
        timestamp: serverTimestamp(),
        isRead: false,
      })
      await createNotification(otherUserId, 'NEW_MESSAGE',
        myName || 'Mesaj nou',
        content.length > 60 ? content.slice(0, 57) + '...' : content,
        conversationId
      )
    } finally {
      setSending(false)
    }
  }

  const otherInitial = otherName.charAt(0).toUpperCase()

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] gap-3" style={{ backgroundColor: 'var(--app-bg)' }}>
        <p className="text-white/50 text-sm">{t('chat.conv_not_found')}</p>
        <button onClick={() => router.back()} className="text-brand-green text-sm font-semibold">{t('chat.back')}</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] md:h-screen" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 flex-shrink-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center md:hidden">
          <ArrowLeft size={18} className="text-white/80" />
        </button>
        <div className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#1ED75F33' }}>
          {otherPhoto
            ? <Image src={otherPhoto} alt={otherName} fill sizes="36px" className="object-cover" />
            : <span className="font-black text-brand-green text-sm">{otherInitial}</span>}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-white leading-tight">{otherName}</span>
          {otherIsTyping && (
            <span className="text-[11px] text-brand-green animate-pulse">{t('chat.typing')}</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-center text-sm text-white/35 py-8">{t('chat.send_first')}</p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.senderId === user?.uid
          const showAvatar = i === 0 || messages[i - 1]?.senderId !== msg.senderId
          const isLastFromMe = isMe && (i === messages.length - 1 || messages[i + 1]?.senderId !== user?.uid)
          return (
            <div key={msg.id} className={`flex items-end gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
              {/* Avatar spacer */}
              <div className="w-7 flex-shrink-0">
                {!isMe && showAvatar && (
                  <div className="relative w-7 h-7 rounded-full overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: '#1ED75F33' }}>
                    {otherPhoto
                      ? <Image src={otherPhoto} alt="" fill sizes="28px" className="object-cover" />
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
                <div className="flex items-center gap-1 mt-0.5 px-1">
                  <span className="text-[10px] text-white/25">{formatTs(msg.timestamp)}</span>
                  {/* Read receipt — only on last sent message */}
                  {isMe && isLastFromMe && (
                    msg.isRead
                      ? <CheckCheck size={12} className="text-brand-green flex-shrink-0" />
                      : <Check size={12} className="text-white/30 flex-shrink-0" />
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {/* Typing bubble */}
        {otherIsTyping && (
          <div className="flex items-end gap-2 mb-1.5">
            <div className="w-7 flex-shrink-0">
              <div className="relative w-7 h-7 rounded-full overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: '#1ED75F33' }}>
                {otherPhoto
                  ? <Image src={otherPhoto} alt="" fill sizes="28px" className="object-cover" />
                  : <span className="text-xs font-black text-brand-green">{otherInitial}</span>}
              </div>
            </div>
            <div className="px-4 py-3 rounded-2xl" style={{ backgroundColor: 'var(--app-surface)', borderBottomLeftRadius: 4 }}>
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8 flex-shrink-0"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        <input
          value={text}
          onChange={e => { setText(e.target.value); handleTyping() }}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder={t('chat.placeholder')}
          maxLength={4000}
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
