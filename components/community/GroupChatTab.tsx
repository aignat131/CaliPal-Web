'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, doc, updateDoc, deleteDoc,
  limitToLast, getDocs, endBefore, QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { CommunityMember, MemberRole } from '@/types'
import { Send, Pin, Trash2, Megaphone } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupMessage {
  id: string
  senderId: string
  senderName: string
  senderPhotoUrl: string | null
  senderRole: MemberRole
  text?: string
  replyToId?: string
  replyToText?: string
  replyToSenderName?: string
  reactions?: Record<string, string[]>
  isAnnouncement?: boolean
  type: 'message' | 'system'
  systemText?: string
  timestamp: { toDate: () => Date; toMillis: () => number } | null
}

interface PinnedState {
  pinnedMessageId: string | null
  pinnedMessageText: string | null
  pinnedMessageSender: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MSG_REACTIONS = ['❤️', '👍', '😂', '🔥', '💪', '😮']

const ROLE_COLORS: Record<MemberRole, string> = {
  ADMIN: '#FFB800',
  MODERATOR: '#3B82F6',
  TRAINER: '#F97316',
  MEMBER: '#1ED75F',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: GroupMessage['timestamp'], locale: string): string {
  if (!ts) return ''
  try {
    const d = ts.toDate()
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatDateSep(ts: GroupMessage['timestamp'], locale: string): string {
  if (!ts) return ''
  try {
    const d = ts.toDate()
    const now = new Date()
    if (isSameDay(d, now)) return 'Astăzi'
    const yest = new Date(now); yest.setDate(now.getDate() - 1)
    if (isSameDay(d, yest)) return 'Ieri'
    return d.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'short' })
  } catch { return '' }
}

function dayKey(ts: GroupMessage['timestamp']): string {
  if (!ts) return 'unknown'
  try { const d = ts.toDate(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
  catch { return 'unknown' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GroupChatTab({
  communityId,
  myUid,
  myName,
  myPhotoUrl,
  myRole,
  members,
  onMemberTap,
}: {
  communityId: string
  myUid: string
  myName: string
  myPhotoUrl: string | null
  myRole: MemberRole
  members: CommunityMember[]
  onMemberTap: (m: CommunityMember) => void
}) {
  const isAdmin = myRole === 'ADMIN' || myRole === 'MODERATOR'
  const locale = 'ro-RO'

  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [olderMessages, setOlderMessages] = useState<GroupMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [announcementMode, setAnnouncementMode] = useState(false)
  const [pinned, setPinned] = useState<PinnedState>({ pinnedMessageId: null, pinnedMessageText: null, pinnedMessageSender: null })
  const [showPinned, setShowPinned] = useState(true)
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; senderName: string } | null>(null)
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentionList, setShowMentionList] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const oldestDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swipeStartX = useRef(0)
  const swipeTriggered = useRef(false)

  const msgsRef = collection(db, 'communities', communityId, 'groupMessages')
  const metaRef = doc(db, 'communities', communityId, 'groupMeta', 'state')

  // ── Listeners ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const q = query(msgsRef, orderBy('timestamp', 'asc'), limitToLast(60))
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }) as GroupMessage))
      if (!oldestDocRef.current && snap.docs.length > 0) oldestDocRef.current = snap.docs[0]
      setHasMore(snap.docs.length >= 60)
      setLoading(false)
    })
    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId])

  useEffect(() => {
    const unsub = onSnapshot(metaRef, snap => {
      if (!snap.exists()) return
      const d = snap.data()
      setPinned({
        pinnedMessageId: d.pinnedMessageId ?? null,
        pinnedMessageText: d.pinnedMessageText ?? null,
        pinnedMessageSender: d.pinnedMessageSender ?? null,
      })
    })
    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId])

  // Mark as read on mount
  useEffect(() => {
    updateDoc(metaRef, { [`memberLastRead.${myUid}`]: serverTimestamp() }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, myUid])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function loadOlderMessages() {
    if (!oldestDocRef.current || loadingMore) return
    setLoadingMore(true)
    try {
      const q = query(msgsRef, orderBy('timestamp', 'asc'), endBefore(oldestDocRef.current), limitToLast(40))
      const snap = await getDocs(q)
      if (snap.docs.length > 0) {
        oldestDocRef.current = snap.docs[0]
        setOlderMessages(prev => [...snap.docs.map(d => ({ id: d.id, ...d.data() }) as GroupMessage), ...prev])
        setHasMore(snap.docs.length >= 40)
      } else {
        setHasMore(false)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  async function sendMessage() {
    if (!text.trim() || sending) return
    const content = text.trim()
    setText('')
    setSending(true)
    setShowMentionList(false)
    try {
      const msgData: Record<string, unknown> = {
        senderId: myUid,
        senderName: myName,
        senderPhotoUrl: myPhotoUrl,
        senderRole: myRole,
        text: content,
        type: 'message',
        isAnnouncement: announcementMode,
        timestamp: serverTimestamp(),
      }
      if (replyTo) {
        msgData.replyToId = replyTo.id
        msgData.replyToText = replyTo.text
        msgData.replyToSenderName = replyTo.senderName
        setReplyTo(null)
      }
      if (announcementMode) setAnnouncementMode(false)
      await addDoc(msgsRef, msgData)
      // Update lastMessageAt in meta
      updateDoc(metaRef, { lastMessageAt: serverTimestamp() }).catch(() => {})
    } finally {
      setSending(false)
    }
  }

  async function toggleReaction(msgId: string, emoji: string) {
    const ref = doc(db, 'communities', communityId, 'groupMessages', msgId)
    const msg = [...olderMessages, ...messages].find(m => m.id === msgId)
    const existing: string[] = msg?.reactions?.[emoji] ?? []
    if (existing.includes(myUid)) {
      await updateDoc(ref, { [`reactions.${emoji}`]: existing.filter(id => id !== myUid) }).catch(() => {})
    } else {
      await updateDoc(ref, { [`reactions.${emoji}`]: [...existing, myUid] }).catch(() => {})
    }
    setReactionPickerMsgId(null)
  }

  async function pinMessage(msg: GroupMessage) {
    await updateDoc(metaRef, {
      pinnedMessageId: msg.id,
      pinnedMessageText: msg.text ?? '',
      pinnedMessageSender: msg.senderName,
    }).catch(() => {})
  }

  async function deleteMessage(msgId: string) {
    await deleteDoc(doc(db, 'communities', communityId, 'groupMessages', msgId)).catch(() => {})
  }

  // ── Long press / swipe ───────────────────────────────────────────────────────

  function handleLongPressStart(msgId: string) {
    longPressTimer.current = setTimeout(() => setReactionPickerMsgId(msgId), 450)
  }
  function handleLongPressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }
  function handleSwipeStart(e: React.TouchEvent) {
    swipeStartX.current = e.touches[0].clientX
    swipeTriggered.current = false
  }
  function handleSwipeMove(e: React.TouchEvent, msg: GroupMessage) {
    if (swipeTriggered.current || !msg.text) return
    if (e.touches[0].clientX - swipeStartX.current > 40) {
      swipeTriggered.current = true
      setReplyTo({ id: msg.id, text: msg.text, senderName: msg.senderName })
      navigator.vibrate?.(15)
    }
  }

  // ── Mention autocomplete ─────────────────────────────────────────────────────

  const handleTextChange = useCallback((val: string) => {
    setText(val)
    const atIdx = val.lastIndexOf('@')
    if (atIdx !== -1 && atIdx === val.length - 1 - (val.length - 1 - atIdx)) {
      const query = val.slice(atIdx + 1)
      if (!query.includes(' ')) {
        setMentionQuery(query)
        setShowMentionList(true)
        return
      }
    }
    setShowMentionList(false)
  }, [])

  function insertMention(name: string) {
    const atIdx = text.lastIndexOf('@')
    setText(text.slice(0, atIdx) + '@' + name + ' ')
    setShowMentionList(false)
    inputRef.current?.focus()
  }

  const mentionFiltered = showMentionList
    ? members.filter(m => m.displayName.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : []

  // Dismiss reaction picker on outside click
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

  // ── All messages combined ────────────────────────────────────────────────────

  const allMessages = [...olderMessages, ...messages]

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>

      {/* Pinned message banner */}
      {pinned.pinnedMessageId && pinned.pinnedMessageText && showPinned && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/8"
          style={{ backgroundColor: 'rgba(30,215,95,0.07)' }}>
          <Pin size={12} className="text-brand-green flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-brand-green/70">{pinned.pinnedMessageSender}</p>
            <p className="text-xs text-white/60 truncate">{pinned.pinnedMessageText}</p>
          </div>
          <button onClick={() => setShowPinned(false)} className="text-white/30 text-xs">✕</button>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && hasMore && (
          <div className="flex justify-center mb-3">
            <button onClick={loadOlderMessages} disabled={loadingMore}
              className="text-xs font-semibold text-white/50 px-4 py-2 rounded-full border border-white/12 hover:text-white/80 disabled:opacity-40 transition-colors">
              {loadingMore ? '...' : 'Mesaje mai vechi'}
            </button>
          </div>
        )}
        {!loading && allMessages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: '#1ED75F12' }}>
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-sm text-white/40">Fii primul care scrie un mesaj!</p>
          </div>
        )}

        {allMessages.map((msg, i) => {
          const isMe = msg.senderId === myUid
          const prevMsg = i > 0 ? allMessages[i - 1] : null
          const showDateSep = !prevMsg || dayKey(msg.timestamp) !== dayKey(prevMsg.timestamp)
          const showAvatar = !isMe && (i === 0 || allMessages[i - 1]?.senderId !== msg.senderId)

          return (
            <div key={msg.id}>
              {/* Date separator */}
              {showDateSep && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] font-semibold text-white/35 px-3 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    {formatDateSep(msg.timestamp, locale)}
                  </span>
                </div>
              )}

              {/* System message */}
              {msg.type === 'system' && (
                <div className="text-center text-[11px] text-white/30 my-2 px-4">{msg.systemText}</div>
              )}

              {/* Chat message */}
              {msg.type === 'message' && (
                <div
                  className={`flex items-end gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : ''}`}
                  onTouchStart={handleSwipeStart}
                  onTouchMove={e => handleSwipeMove(e, msg)}
                >
                  {/* Avatar */}
                  <div className="w-7 flex-shrink-0">
                    {!isMe && showAvatar && (
                      <button onClick={() => {
                        const m = members.find(mem => mem.userId === msg.senderId)
                        if (m) onMemberTap(m)
                      }}>
                        <div className="relative w-7 h-7 rounded-full overflow-hidden flex items-center justify-center"
                          style={{ backgroundColor: `${ROLE_COLORS[msg.senderRole] ?? '#1ED75F'}33` }}>
                          {msg.senderPhotoUrl
                            ? <Image src={msg.senderPhotoUrl} alt="" fill sizes="28px" className="object-cover" />
                            : <span className="text-xs font-black" style={{ color: ROLE_COLORS[msg.senderRole] ?? '#1ED75F' }}>
                                {msg.senderName.charAt(0).toUpperCase()}
                              </span>
                          }
                        </div>
                      </button>
                    )}
                  </div>

                  <div className={`max-w-[72%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Sender name (others only, first in group) */}
                    {!isMe && showAvatar && (
                      <p className="text-[10px] font-bold mb-0.5 px-1"
                        style={{ color: ROLE_COLORS[msg.senderRole] ?? '#1ED75F' }}>
                        {msg.senderName}
                      </p>
                    )}

                    <div className="relative">
                      {/* Announcement badge */}
                      {msg.isAnnouncement && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <Megaphone size={9} className="text-amber-400" />
                          <span className="text-[9px] font-bold text-amber-400">Anunț</span>
                        </div>
                      )}

                      <div
                        className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed select-none"
                        style={{
                          backgroundColor: msg.isAnnouncement
                            ? 'rgba(245,158,11,0.15)'
                            : isMe ? '#1ED75F' : 'var(--app-surface)',
                          color: isMe && !msg.isAnnouncement ? '#0D1B1A' : 'rgba(255,255,255,0.9)',
                          borderBottomRightRadius: isMe ? 4 : undefined,
                          borderBottomLeftRadius: !isMe ? 4 : undefined,
                          border: msg.isAnnouncement ? '1px solid rgba(245,158,11,0.3)' : undefined,
                        }}
                        onTouchStart={() => handleLongPressStart(msg.id)}
                        onTouchEnd={handleLongPressEnd}
                        onTouchMove={handleLongPressEnd}
                        onContextMenu={e => { e.preventDefault(); setReactionPickerMsgId(msg.id) }}
                      >
                        {msg.replyToText && (
                          <div className="mb-1.5 px-2 py-1.5 rounded-xl border-l-2 border-brand-green/60 bg-black/20">
                            <p className="text-[10px] font-bold mb-0.5 text-brand-green/70">{msg.replyToSenderName}</p>
                            <p className="text-xs text-white/50 line-clamp-2">{msg.replyToText}</p>
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
                            <button key={e} onClick={() => toggleReaction(msg.id, e)}
                              className="w-7 h-7 text-base flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
                              {e}
                            </button>
                          ))}
                          {isAdmin && (
                            <>
                              <div className="w-px h-5 bg-white/10 mx-0.5" />
                              <button onClick={() => { pinMessage(msg); setReactionPickerMsgId(null) }}
                                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10">
                                <Pin size={12} className="text-white/50" />
                              </button>
                              <button onClick={() => { deleteMessage(msg.id); setReactionPickerMsgId(null) }}
                                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10">
                                <Trash2 size={12} className="text-red-400/70" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Reaction bar */}
                    {msg.reactions && Object.entries(msg.reactions).some(([, u]) => u.length > 0) && (
                      <div className={`flex items-center gap-1 mt-1 flex-wrap ${isMe ? 'justify-end' : ''}`}>
                        {Object.entries(msg.reactions).filter(([, u]) => u.length > 0).map(([emoji, uids]) => (
                          <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all ${
                              uids.includes(myUid)
                                ? 'bg-brand-green/20 border-brand-green/40 text-brand-green'
                                : 'bg-white/8 border-white/10 text-white/60'
                            }`}>
                            {emoji} {uids.length}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Timestamp */}
                    <span className="text-[9px] text-white/25 mt-0.5 px-1">{formatTime(msg.timestamp, locale)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Mention autocomplete */}
      {showMentionList && mentionFiltered.length > 0 && (
        <div className="border-t border-white/8 max-h-40 overflow-y-auto"
          style={{ backgroundColor: 'var(--app-surface)' }}>
          {mentionFiltered.map(m => (
            <button key={m.userId} onClick={() => insertMention(m.displayName)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 text-left">
              <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0"
                style={{ backgroundColor: `${ROLE_COLORS[m.role]}33` }}>
                {m.photoUrl
                  ? <Image src={m.photoUrl} alt="" fill sizes="24px" className="object-cover" />
                  : <span className="text-[10px] font-black w-full h-full flex items-center justify-center"
                      style={{ color: ROLE_COLORS[m.role] }}>{m.displayName.charAt(0)}</span>
                }
              </div>
              <span className="text-sm text-white/80">{m.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-white/8"
          style={{ backgroundColor: 'var(--app-bg)' }}>
          <div className="w-0.5 h-8 rounded-full bg-brand-green flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-brand-green">{replyTo.senderName}</p>
            <p className="text-xs text-white/50 truncate">{replyTo.text}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-white/40 p-1 text-sm">✕</button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8 flex-shrink-0"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        {isAdmin && (
          <button
            onClick={() => setAnnouncementMode(v => !v)}
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              announcementMode ? 'bg-amber-500/20' : 'bg-white/8'
            }`}
            title="Mod anunț (admin)"
          >
            <Megaphone size={15} className={announcementMode ? 'text-amber-400' : 'text-white/40'} />
          </button>
        )}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={text}
            onChange={e => handleTextChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Scrie un mesaj..."
            maxLength={4000}
            className="w-full h-11 rounded-full px-4 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/40 transition-colors"
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={sending || !text.trim()}
          className="w-11 h-11 rounded-full bg-brand-green disabled:opacity-40 flex items-center justify-center transition-opacity flex-shrink-0"
        >
          <Send size={15} className="text-black" />
        </button>
      </div>
    </div>
  )
}
