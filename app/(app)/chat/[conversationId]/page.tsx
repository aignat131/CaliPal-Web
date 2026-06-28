'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  collection, query, orderBy, onSnapshot, addDoc, doc,
  setDoc, updateDoc, serverTimestamp, increment, getDoc, writeBatch, limitToLast,
  getDocs, endBefore, QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { createNotification } from '@/lib/firebase/notifications'
import { uploadChatImage } from '@/lib/firebase/storage'
import type { ChatMessage, ConversationDoc } from '@/types'
import Link from 'next/link'
import { ArrowLeft, Send, Check, CheckCheck, X, ImagePlus } from 'lucide-react'
import { useLanguage } from '@/lib/context/LanguageContext'
import { SkeletonMessages } from '@/components/ui/SkeletonLoaders'

// ── Time helpers ──────────────────────────────────────────────────────────────

function formatTime(ts: { toDate?: () => Date } | null | undefined, locale: string): string {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date()
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatDateSeparator(
  ts: { toDate?: () => Date } | null | undefined,
  todayLabel: string,
  yesterdayLabel: string,
  locale: string,
): string {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date()
  const now = new Date()
  if (isSameDay(date, now)) return todayLabel
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) return yesterdayLabel
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) return date.toLocaleDateString(locale, { weekday: 'long' })
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function msgDayKey(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return 'unknown'
  const d = ts.toDate ? ts.toDate() : new Date()
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatLastSeen(ts: { toDate: () => Date } | null, locale: string): string {
  if (!ts) return ''
  try {
    const d = ts.toDate()
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 2) return 'Văzut acum'
    if (diffMin < 60) return `Văzut acum ${diffMin}m`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `Văzut la ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
    return `Văzut ${d.toLocaleDateString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
  } catch { return '' }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPING_EXPIRY_MS = 4000

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatDetailPage() {
  const { user } = useAuth()
  const { displayName: myName, photoUrl: myPhoto } = useMyProfile()
  const router = useRouter()
  const { lang, t } = useLanguage()
  const locale = lang === 'RO' ? 'ro-RO' : 'en-US'
  const params = useParams()
  const searchParams = useSearchParams()
  const conversationId = params.conversationId as string
  const otherUserIdParam = searchParams.get('otherUserId') ?? ''
  const otherNameParam = searchParams.get('otherName') ?? ''

  const [otherUserId, setOtherUserId] = useState(otherUserIdParam)
  const [otherName, setOtherName] = useState(otherNameParam || t('common.user_fallback'))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const oldestDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [otherPhoto, setOtherPhoto] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const [otherIsOnline, setOtherIsOnline] = useState(false)
  const [otherLastSeen, setOtherLastSeen] = useState<{ toDate: () => Date } | null>(null)
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; senderName: string } | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const swipeMsgId = useRef<string | null>(null)
  const swipeStartX = useRef<number>(0)
  const swipeTriggered = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const justSentRef = useRef(false)
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
      orderBy('timestamp', 'asc'),
      limitToLast(50)
    )
    const unsub = onSnapshot(
      q,
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ChatMessage))
        if (!oldestDocRef.current && snap.docs.length > 0) {
          oldestDocRef.current = snap.docs[0]
        }
        setHasMore(snap.docs.length >= 50)
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

  // Watch other user's online/lastSeen status
  useEffect(() => {
    if (!otherUserId) return
    const unsub = onSnapshot(doc(db, 'users', otherUserId), snap => {
      if (!snap.exists()) return
      setOtherIsOnline(snap.data().isOnline === true)
      setOtherLastSeen(snap.data().lastSeen ?? null)
    })
    return unsub
  }, [otherUserId])

  // Dismiss reaction picker on outside tap
  useEffect(() => {
    if (!reactionPickerMsgId) return
    const handler = () => setReactionPickerMsgId(null)
    document.addEventListener('touchstart', handler, { passive: true })
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('mousedown', handler)
    }
  }, [reactionPickerMsgId])

  // Track if user is near the bottom of the scroll area
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    function handleScroll() {
      if (!el) return
      const threshold = 150
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Scroll to bottom on new messages or typing indicator (only if near bottom or just sent)
  useEffect(() => {
    if (isNearBottomRef.current || justSentRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      justSentRef.current = false
    }
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

  async function loadOlderMessages() {
    if (!oldestDocRef.current || loadingMore) return
    setLoadingMore(true)
    const el = scrollContainerRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0
    try {
      const q = query(
        collection(db, 'conversations', conversationId, 'messages'),
        orderBy('timestamp', 'asc'),
        endBefore(oldestDocRef.current),
        limitToLast(50),
      )
      const snap = await getDocs(q)
      if (snap.docs.length > 0) {
        oldestDocRef.current = snap.docs[0]
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }) as ChatMessage)
        setOlderMessages(prev => [...fetched, ...prev])
        setHasMore(snap.docs.length >= 50)
        // Preserve scroll position after prepending older messages
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevScrollHeight
        })
      } else {
        setHasMore(false)
      }
    } finally {
      setLoadingMore(false)
    }
  }

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
    justSentRef.current = true

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
      const msgData: Record<string, unknown> = {
        senderId: user.uid,
        senderName: myName,
        text: content,
        timestamp: serverTimestamp(),
        isRead: false,
      }
      if (replyTo) {
        msgData.replyToId = replyTo.id
        msgData.replyToText = replyTo.text
        msgData.replyToSenderName = replyTo.senderName
        setReplyTo(null)
      }
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), msgData)
      await createNotification(otherUserId, 'NEW_MESSAGE',
        myName || 'Mesaj nou',
        content.length > 60 ? content.slice(0, 57) + '...' : content,
        conversationId
      )

      // One-time email reminder — fire-and-forget, never blocks sending
      auth.currentUser?.getIdToken().then(idToken => {
        if (!idToken) return
        fetch('/api/email/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ conversationId, recipientUid: otherUserId, preview: content }),
        }).catch(() => {})
      }).catch(() => {})
    } finally {
      setSending(false)
    }
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    e.target.value = ''
    setImageUploading(true)
    try {
      const imageUrl = await uploadChatImage(conversationId, user.uid, Date.now(), file)
      // Send as message with imageUrl (empty text is allowed for image-only messages)
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
          lastMessage: '📷 Imagine',
          lastMessageSenderId: user.uid,
          lastMessageTimestamp: serverTimestamp(),
          unreadCount: { [otherUserId]: 1 },
        } as Partial<ConversationDoc>)
      } else {
        await updateDoc(convRef, {
          lastMessage: '📷 Imagine',
          lastMessageSenderId: user.uid,
          lastMessageTimestamp: serverTimestamp(),
          [`unreadCount.${otherUserId}`]: increment(1),
        })
      }
      const msgData: Record<string, unknown> = {
        senderId: user.uid,
        senderName: myName,
        text: '',
        imageUrl,
        timestamp: serverTimestamp(),
        isRead: false,
      }
      if (replyTo) {
        msgData.replyToId = replyTo.id
        msgData.replyToText = replyTo.text
        msgData.replyToSenderName = replyTo.senderName
        setReplyTo(null)
      }
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), msgData)
    } catch {
      // silently ignore upload errors — user can retry
    } finally {
      setImageUploading(false)
    }
  }

  const MSG_REACTIONS = ['❤️', '👍', '😂', '🔥', '💪', '😮']

  async function setReaction(msgId: string, emoji: string) {
    if (!user) return
    const ref = doc(db, 'conversations', conversationId, 'messages', msgId)
    const msg = [...olderMessages, ...messages].find(m => m.id === msgId)
    const existing: string[] = (msg?.reactions as Record<string, string[]>)?.[emoji] ?? []
    if (existing.includes(user.uid)) {
      await updateDoc(ref, { [`reactions.${emoji}`]: existing.filter(id => id !== user.uid) }).catch(() => {})
    } else {
      await updateDoc(ref, { [`reactions.${emoji}`]: [...existing, user.uid] }).catch(() => {})
    }
    setReactionPickerMsgId(null)
  }

  function handleLongPressStart(msgId: string) {
    longPressTimer.current = setTimeout(() => setReactionPickerMsgId(msgId), 450)
  }
  function handleLongPressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  function handleSwipeStart(e: React.TouchEvent, msgId: string) {
    swipeMsgId.current = msgId
    swipeStartX.current = e.touches[0].clientX
    swipeTriggered.current = false
  }
  function handleSwipeMove(e: React.TouchEvent, msg: ChatMessage) {
    if (swipeTriggered.current) return
    const dx = e.touches[0].clientX - swipeStartX.current
    if (dx > 40) {
      swipeTriggered.current = true
      setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName })
      navigator.vibrate?.(15)
    }
  }

  const otherInitial = otherName.charAt(0).toUpperCase()
  const todayLabel = t('chat.today')
  const yesterdayLabel = t('chat.yesterday')

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
        <button onClick={() => router.back()} aria-label="Înapoi" className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center md:hidden">
          <ArrowLeft size={18} className="text-white/80" />
        </button>
        <Link
          href={otherUserId ? `/profile/${otherUserId}` : '#'}
          className="flex items-center gap-3 flex-1 min-w-0 active:opacity-70 transition-opacity"
        >
          <div className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.20)' }}>
            {otherPhoto
              ? <Image src={otherPhoto} alt={otherName} fill sizes="36px" className="object-cover" />
              : <span className="font-black text-brand-green text-sm">{otherInitial}</span>}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-white leading-tight">{otherName}</span>
            {otherIsTyping
              ? <span className="text-[11px] text-brand-green animate-pulse">{t('chat.typing')}</span>
              : otherIsOnline
                ? <span className="text-[11px] text-brand-green">Online</span>
                : otherLastSeen
                  ? <span className="text-[11px] text-white/35">{formatLastSeen(otherLastSeen, locale)}</span>
                  : <span className="text-[11px] text-white/35">Vezi profil</span>
            }
          </div>
        </Link>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <SkeletonMessages />}
        {!loading && hasMore && (
          <div className="flex justify-center mb-3">
            <button
              onClick={loadOlderMessages}
              disabled={loadingMore}
              className="text-xs font-semibold text-white/50 px-4 py-2 rounded-full border border-white/12 hover:text-white/80 disabled:opacity-40 transition-colors"
            >
              {loadingMore ? '...' : t('chat.load_earlier')}
            </button>
          </div>
        )}
        {!loading && messages.length === 0 && olderMessages.length === 0 && (
          <p className="text-center text-sm text-white/35 py-8">{t('chat.send_first')}</p>
        )}
        {[...olderMessages, ...messages].map((msg, i, all) => {
          const isMe = msg.senderId === user?.uid
          const showAvatar = !isMe && (i === 0 || all[i - 1]?.senderId !== msg.senderId)

          // Show a date separator when the day changes between messages
          const prevMsg = i > 0 ? all[i - 1] : null
          const showDateSep = !prevMsg || msgDayKey(msg.timestamp) !== msgDayKey(prevMsg.timestamp)
          const dateSepLabel = showDateSep
            ? formatDateSeparator(msg.timestamp, todayLabel, yesterdayLabel, locale)
            : null

          return (
            <div key={msg.id}>
              {/* Date separator */}
              {dateSepLabel && (
                <div className="flex items-center justify-center my-3">
                  <span
                    className="text-[10px] font-semibold text-white/35 px-3 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                  >
                    {dateSepLabel}
                  </span>
                </div>
              )}

              {/* Message bubble */}
              <div
                className={`flex items-end gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : ''}`}
                onTouchStart={e => handleSwipeStart(e, msg.id)}
                onTouchMove={e => handleSwipeMove(e, msg)}
              >
                {/* Avatar / spacer */}
                <div className="w-7 flex-shrink-0">
                  {!isMe && showAvatar && (
                    <div className="relative w-7 h-7 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.20)' }}>
                      {otherPhoto
                        ? <Image src={otherPhoto} alt="" fill sizes="28px" className="object-cover" />
                        : <span className="text-xs font-black text-brand-green">{otherInitial}</span>}
                    </div>
                  )}
                </div>

                <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className="relative">
                    <div
                      className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed select-none"
                      style={{
                        backgroundColor: isMe ? 'var(--accent)' : 'var(--app-surface)',
                        color: isMe ? '#0D1B1A' : 'rgba(255,255,255,0.9)',
                        borderBottomRightRadius: isMe ? 4 : undefined,
                        borderBottomLeftRadius: !isMe ? 4 : undefined,
                      }}
                      onTouchStart={() => handleLongPressStart(msg.id)}
                      onTouchEnd={handleLongPressEnd}
                      onTouchMove={handleLongPressEnd}
                      onContextMenu={e => { e.preventDefault(); setReactionPickerMsgId(msg.id) }}
                    >
                      {msg.replyToText && (
                        <div className="mb-1.5 px-2 py-1.5 rounded-xl border-l-2 border-brand-green/60 bg-black/20">
                          <p className="text-[10px] font-bold mb-0.5" style={{ color: 'rgba(var(--accent-rgb), 0.60)' }}>{msg.replyToSenderName}</p>
                          <p className="text-xs line-clamp-2" style={{ color: isMe ? 'rgba(13,27,26,0.6)' : 'rgba(255,255,255,0.5)' }}>{msg.replyToText}</p>
                        </div>
                      )}
                      {msg.imageUrl && (
                        <div className="mb-1 -mx-0.5 rounded-xl overflow-hidden">
                          <Image
                            src={msg.imageUrl}
                            alt="imagine"
                            width={240}
                            height={180}
                            className="object-cover w-full"
                            style={{ maxHeight: 240 }}
                          />
                        </div>
                      )}
                      {msg.text}
                    </div>
                    {/* Reaction picker popover */}
                    {reactionPickerMsgId === msg.id && (
                      <div
                        className={`absolute bottom-full mb-1.5 z-30 flex items-center gap-1 px-2 py-1.5 rounded-2xl shadow-xl ${isMe ? 'right-0' : 'left-0'}`}
                        style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {MSG_REACTIONS.map(e => (
                          <button key={e} onClick={() => setReaction(msg.id, e)}
                            className="w-8 h-8 text-lg flex items-center justify-center rounded-full hover:bg-white/10 transition-colors active:scale-110">
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Reaction bar */}
                  {msg.reactions && Object.entries(msg.reactions).some(([, uids]) => uids.length > 0) && (
                    <div className={`flex items-center gap-1 mt-1 flex-wrap ${isMe ? 'justify-end' : ''}`}>
                      {Object.entries(msg.reactions).filter(([, uids]) => uids.length > 0).map(([emoji, uids]) => (
                        <button key={emoji} onClick={() => setReaction(msg.id, emoji)}
                          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all ${
                            uids.includes(user?.uid ?? '')
                              ? 'bg-brand-green/20 border-brand-green/40 text-brand-green'
                              : 'bg-white/8 border-white/10 text-white/60'
                          }`}>
                          {emoji} {uids.length}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Timestamp + read receipt */}
                  <div className={`flex items-center gap-1 mt-0.5 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] text-white/25">{formatTime(msg.timestamp, locale)}</span>
                    {isMe && (
                      msg.isRead
                        ? <CheckCheck size={12} className="text-brand-green flex-shrink-0" />
                        : <Check size={12} className="text-white/30 flex-shrink-0" />
                    )}
                  </div>
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
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.20)' }}>
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

      {/* Reply preview bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-white/8 flex-shrink-0"
          style={{ backgroundColor: 'var(--app-bg)' }}>
          <div className="w-0.5 h-8 rounded-full bg-brand-green flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-brand-green">{replyTo.senderName}</p>
            <p className="text-xs text-white/50 truncate">{replyTo.text}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-white/40 p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8 flex-shrink-0"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={imageUploading}
          className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
        >
          {imageUploading
            ? <div className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            : <ImagePlus size={16} className="text-white/50" />
          }
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
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
          aria-label="Trimite mesajul"
          className="w-11 h-11 rounded-full bg-brand-green disabled:opacity-40 flex items-center justify-center transition-opacity"
        >
          <Send size={15} className="text-black" />
        </button>
      </div>
    </div>
  )
}
