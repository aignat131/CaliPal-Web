'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  doc, collection, onSnapshot, addDoc, deleteDoc,
  updateDoc, setDoc, serverTimestamp, query, orderBy, increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useT } from '@/lib/context/LanguageContext'
import type {
  CommunityPost, CommunityMember, MemberRole, PostComment,
} from '@/types'
import { ROLE_LABELS } from '@/types'
import {
  Send, Trash2, MessageCircle, X, Pencil,
} from 'lucide-react'
import { ROLE_COLORS } from './shared'
import { MemberAvatar } from './Avatars'
import { ReactorsModal } from './ReactorsModal'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPostDate(createdAt: CommunityPost['createdAt']): string {
  if (!createdAt) return ''
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt as unknown as number)
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'acum'
  if (mins < 60) return `acum ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `acum ${hours}h`
  return date.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatPostDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function renderTextWithMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\w[\w\s]*?\w(?=\s|$)|@\w+)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="text-brand-green font-semibold">{part}</span>
      : part
  )
}

// ── PostCard ─────────────────────────────────────────────────────────────────

export function PostCard({ post, communityId, myUid, myName, myPhoto, myRole, isSuperAdmin, myProTitle, members, onDelete, onOpen }: {
  post: CommunityPost
  communityId: string
  myUid: string
  myName: string
  myPhoto?: string | null
  myRole: MemberRole
  isSuperAdmin: boolean
  myProTitle?: boolean
  members: CommunityMember[]
  onDelete: () => void
  onOpen?: () => void
}) {
  const t = useT()
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  // Emoji reactions: { [emoji]: string[] (userIds) }
  const [reactionCounts, setReactionCounts] = useState<Record<string, string[]>>({})
  const [myReaction, setMyReaction] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showReactors, setShowReactors] = useState<string | null>(null)

  const _POST_REACTIONS = ['💪', '❤️', '🔥', '👏', '😮']

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'communities', communityId, 'posts', post.id, 'reactions'),
      snap => {
        const counts: Record<string, string[]> = {}
        let mine: string | null = null
        snap.docs.forEach(d => {
          const { emoji } = d.data() as { emoji: string }
          if (!counts[emoji]) counts[emoji] = []
          counts[emoji].push(d.id)
          if (d.id === myUid) mine = emoji
        })
        setReactionCounts(counts)
        setMyReaction(mine)
      },
      () => { /* permission denied or offline — keep last known state */ }
    )
    return unsub
  }, [post.id, communityId, myUid])

  useEffect(() => {
    if (!showComments) return
    const q = query(
      collection(db, 'communities', communityId, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'asc')
    )
    return onSnapshot(q,
      snap => { setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PostComment)) },
      () => { /* permission denied or offline — keep last known state */ }
    )
  }, [showComments, post.id, communityId])

  const _isOwnPost = post.authorId === myUid
  const isWorkoutPost = post.workoutExercises !== undefined

  async function setReaction(emoji: string) {
    if (!myUid) return
    const ref = doc(db, 'communities', communityId, 'posts', post.id, 'reactions', myUid)
    if (myReaction === emoji) {
      await deleteDoc(ref)
    } else {
      await setDoc(ref, { emoji, at: serverTimestamp() })
    }
    setShowReactionPicker(false)
  }

  async function addComment() {
    if (!commentText.trim() || commenting) return
    setCommenting(true)
    try {
      await addDoc(
        collection(db, 'communities', communityId, 'posts', post.id, 'comments'),
        { authorId: myUid, authorName: myName, authorPhotoUrl: myPhoto || null, text: commentText.trim(), createdAt: serverTimestamp() }
      )
      await updateDoc(doc(db, 'communities', communityId, 'posts', post.id), { commentsCount: increment(1) })
      setCommentText('')
    } finally { setCommenting(false) }
  }

  async function deleteComment(commentId: string) {
    await deleteDoc(doc(db, 'communities', communityId, 'posts', post.id, 'comments', commentId))
    await updateDoc(doc(db, 'communities', communityId, 'posts', post.id), { commentsCount: increment(-1) })
  }

  async function saveEditComment(commentId: string) {
    if (!editCommentText.trim()) return
    await updateDoc(
      doc(db, 'communities', communityId, 'posts', post.id, 'comments', commentId),
      { text: editCommentText.trim() }
    )
    setEditingCommentId(null)
    setEditCommentText('')
  }

  const roleColor = ROLE_COLORS[post.authorRole as MemberRole] ?? 'var(--accent)'

  return (
    <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'var(--app-surface)' }}>

      {/* Header: avatar + name + date — tap author to view profile */}
      <div className="flex items-start justify-between mb-3">
        <Link
          href={post.authorId === myUid ? '/profile' : `/profile/${post.authorId}`}
          className="flex items-center gap-2.5 active:opacity-70 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)', border: `1.5px solid ${roleColor}` }}>
            {post.authorPhotoUrl
              ? <Image src={post.authorPhotoUrl} alt={post.authorName} width={36} height={36} className="object-cover w-full h-full" />
              : <span className="text-sm font-black" style={{ color: roleColor }}>{post.authorName.charAt(0).toUpperCase()}</span>
            }
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white leading-none">{post.authorName}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-none"
                style={{ backgroundColor: `${roleColor}22`, color: roleColor }}>
                {post.authorId === myUid && myProTitle ? '🎯 Pro' : ROLE_LABELS[post.authorRole as MemberRole]}
              </span>
            </div>
            <span className="text-[11px] text-white/35">{formatPostDate(post.createdAt)}</span>
          </div>
        </Link>
        {(post.authorId === myUid || myRole === 'ADMIN' || isSuperAdmin) && (
          <button onClick={onDelete} aria-label="Șterge postare" className="text-red-400/60 hover:text-red-400 transition-colors p-1 mt-0.5">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Body — tappable to open detail sheet */}
      <div onClick={onOpen} className={onOpen ? 'cursor-pointer' : ''}>
        {/* Description — more prominent (workout note or regular content) */}
        {(isWorkoutPost ? post.workoutNote : post.content) && (
          <p className="text-[15px] text-white/90 leading-snug mb-3 whitespace-pre-line font-medium">
            {renderTextWithMentions(isWorkoutPost ? (post.workoutNote ?? '') : post.content)}
          </p>
        )}

        {/* Workout training block */}
        {isWorkoutPost && (
          <div className="rounded-xl border border-white/10 bg-white/4 p-3 mb-3">
            <div className="flex items-center gap-3 mb-2.5">
              {post.workoutDuration != null && (
                <span className="text-xs font-semibold text-white/60">⏱ {formatPostDuration(post.workoutDuration)}</span>
              )}
              {post.workoutReps != null && post.workoutReps > 0 && (
                <span className="text-xs font-semibold text-white/60">🔁 {post.workoutReps} rep</span>
              )}
            </div>
            {post.workoutExercises && post.workoutExercises.length > 0 && (
              <div className="flex flex-col gap-1">
                {post.workoutExercises.map((ex, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-brand-green/60 flex-shrink-0" />
                    <span className="text-xs text-white/70">{ex.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {post.photoUrl && (
          <div className="relative mb-3 rounded-xl overflow-hidden" style={{ maxHeight: 288 }}>
            <Image
              src={post.photoUrl}
              alt={`${post.authorName}'s post image`}
              width={600}
              height={288}
              className="w-full object-cover"
              style={{ maxHeight: 288 }}
              unoptimized={!post.photoUrl.startsWith('https://firebasestorage')}
            />
          </div>
        )}

        {/* Comment count hint (when collapsed) */}
        {onOpen && !showComments && (post.commentsCount ?? 0) > 0 && (
          <p className="text-xs text-white/25 mb-2">
            {post.commentsCount === 1 ? t('comm_detail.comment_1') : t('comm_detail.comment_n', { n: post.commentsCount ?? 0 })}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-1">
        {/* Primary reactions — always visible */}
        {['💪', '❤️'].map(e => {
          const count = (reactionCounts[e] ?? []).length
          return (
            <button key={e} onClick={() => setReaction(e)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                myReaction === e ? 'bg-brand-green/20 border-brand-green/50 text-brand-green' : 'bg-white/8 border-white/12 text-white/60'
              }`}>
              {e} {count > 0 && <span onClick={ev => { ev.stopPropagation(); setShowReactors(e) }}>{count}</span>}
            </button>
          )
        })}
        {/* Secondary reactions — visible if count > 0, myReaction, or picker open */}
        {['🔥', '👏', '😮'].map(e => {
          const count = (reactionCounts[e] ?? []).length
          if (count === 0 && myReaction !== e && !showReactionPicker) return null
          return (
            <button key={e} onClick={() => { setReaction(e); setShowReactionPicker(false) }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                myReaction === e ? 'bg-brand-green/20 border-brand-green/50 text-brand-green' : 'bg-white/8 border-white/12 text-white/60'
              }`}>
              {e} {count > 0 && <span onClick={ev => { ev.stopPropagation(); setShowReactors(e) }}>{count}</span>}
            </button>
          )
        })}
        {!showReactionPicker && (
          <button onClick={() => setShowReactionPicker(true)}
            className="w-7 h-7 rounded-full bg-white/8 border border-white/12 text-white/40 text-sm flex items-center justify-center">+</button>
        )}
        <button onClick={() => setShowComments(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-semibold ml-1 transition-colors ${showComments ? 'text-brand-green' : 'text-white/40 hover:text-white/60'}`}>
          <MessageCircle size={14} />
          {(showComments ? comments.length : (post.commentsCount ?? 0)) > 0 && (
            <span>{showComments ? comments.length : post.commentsCount}</span>
          )}
        </button>
      </div>

      {showReactors && (
        <ReactorsModal emoji={showReactors} reactionCounts={reactionCounts} members={members} onClose={() => setShowReactors(null)} />
      )}

      {showComments && (
        <div className="mt-3 border-t border-white/8 pt-3">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2 mb-2">
              <div className="mt-0.5">
                <MemberAvatar photoUrl={c.authorPhotoUrl} name={c.authorName} size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-white">{c.authorName} </span>
                {editingCommentId === c.id ? (
                  <div className="flex gap-1 mt-1">
                    <input
                      value={editCommentText}
                      onChange={e => setEditCommentText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEditComment(c.id)}
                      className="flex-1 h-7 rounded-lg px-2 text-xs text-white outline-none border border-brand-green/60 bg-white/7"
                      autoFocus
                    />
                    <button onClick={() => saveEditComment(c.id)} className="text-brand-green text-xs font-bold px-1">&#10003;</button>
                    <button onClick={() => setEditingCommentId(null)} className="text-white/40 text-xs px-1">&#10005;</button>
                  </div>
                ) : (
                  <span className="text-xs text-white/70">{c.text}</span>
                )}
              </div>
              {(c.authorId === myUid || isSuperAdmin) && editingCommentId !== c.id && (
                <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
                  {c.authorId === myUid && (
                    <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.text) }}
                      aria-label="Editează comentariu"
                      className="text-white/40 hover:text-white/70 transition-colors p-0.5">
                      <Pencil size={11} />
                    </button>
                  )}
                  <button onClick={() => deleteComment(c.id)} aria-label="Șterge comentariu"
                    className="text-red-400/60 hover:text-red-400 transition-colors p-0.5">
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addComment()}
              placeholder={t('comm_detail.add_comment')}
              className="flex-1 h-8 rounded-lg px-3 text-xs text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
            />
            <button onClick={addComment} disabled={commenting || !commentText.trim()}
              className="w-8 h-8 rounded-lg bg-brand-green disabled:opacity-40 flex items-center justify-center flex-shrink-0">
              <Send size={12} className="text-black" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Post Detail Sheet ─────────────────────────────────────────────────────────

export function PostDetailSheet({ post, communityId, myUid, myName, myPhoto, myRole, isSuperAdmin, myProTitle: _myProTitle, members, onDelete, onClose }: {
  post: CommunityPost
  communityId: string
  myUid: string
  myName: string
  myPhoto?: string | null
  myRole: MemberRole
  isSuperAdmin: boolean
  myProTitle?: boolean
  members: CommunityMember[]
  onDelete: () => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)
  const t = useT()
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [reactionCounts, setReactionCounts] = useState<Record<string, string[]>>({})
  const [myReaction, setMyReaction] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showReactors, setShowReactors] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const _POST_REACTIONS = ['💪', '❤️', '🔥', '👏', '😮']
  const roleColor = ROLE_COLORS[post.authorRole as MemberRole] ?? 'var(--accent)'
  const isOwnPost = post.authorId === myUid
  const isWorkoutPost = post.workoutExercises !== undefined

  useEffect(() => {
    const q = query(collection(db, 'communities', communityId, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PostComment)))
  }, [post.id, communityId])

  useEffect(() => {
    const q = collection(db, 'communities', communityId, 'posts', post.id, 'reactions')
    return onSnapshot(q, snap => {
      const counts: Record<string, string[]> = {}
      let mine: string | null = null
      snap.docs.forEach(d => {
        const { emoji } = d.data() as { emoji: string }
        if (!counts[emoji]) counts[emoji] = []
        counts[emoji].push(d.id)
        if (d.id === myUid) mine = emoji
      })
      setReactionCounts(counts)
      setMyReaction(mine)
    })
  }, [post.id, communityId, myUid])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [comments])

  async function handleReaction(emoji: string) {
    const ref = doc(db, 'communities', communityId, 'posts', post.id, 'reactions', myUid)
    if (myReaction === emoji) await deleteDoc(ref)
    else await setDoc(ref, { emoji, at: serverTimestamp() })
    setShowReactionPicker(false)
  }

  async function addComment() {
    if (!commentText.trim() || commenting) return
    setCommenting(true)
    try {
      await addDoc(collection(db, 'communities', communityId, 'posts', post.id, 'comments'),
        { authorId: myUid, authorName: myName, authorPhotoUrl: myPhoto || null, text: commentText.trim(), createdAt: serverTimestamp() })
      await updateDoc(doc(db, 'communities', communityId, 'posts', post.id), { commentsCount: increment(1) })
      setCommentText('')
    } finally { setCommenting(false) }
  }

  async function deleteComment(commentId: string) {
    await deleteDoc(doc(db, 'communities', communityId, 'posts', post.id, 'comments', commentId))
    await updateDoc(doc(db, 'communities', communityId, 'posts', post.id), { commentsCount: increment(-1) })
  }

  async function saveEditComment(commentId: string) {
    if (!editCommentText.trim()) return
    await updateDoc(
      doc(db, 'communities', communityId, 'posts', post.id, 'comments', commentId),
      { text: editCommentText.trim() }
    )
    setEditingCommentId(null)
    setEditCommentText('')
  }

  function formatPostDurationLocal(s: number): string {
    const m = Math.floor(s / 60); const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-t-3xl flex flex-col"
        style={{ backgroundColor: 'var(--app-bg)', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="flex items-center justify-between pt-3 pb-2 px-5 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
          <div className="w-6" />
          <p className="text-sm font-bold text-white/50">{t('comm_detail.post_label')}</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/50" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {/* Author */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)', border: `1.5px solid ${roleColor}` }}>
              {post.authorPhotoUrl
                ? <Image src={post.authorPhotoUrl} alt={post.authorName} width={36} height={36} className="object-cover w-full h-full" />
                : <span className="text-sm font-black" style={{ color: roleColor }}>{post.authorName.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-white">{post.authorName}</span>
            </div>
            {(isOwnPost || myRole === 'ADMIN' || isSuperAdmin) && (
              <button onClick={onDelete} className="text-red-400/60 p-1">
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {/* Content */}
          {(isWorkoutPost ? post.workoutNote : post.content) && (
            <p className="text-[15px] text-white/90 leading-snug mb-3 whitespace-pre-line font-medium">
              {renderTextWithMentions(isWorkoutPost ? (post.workoutNote ?? '') : post.content)}
            </p>
          )}

          {isWorkoutPost && (
            <div className="rounded-xl border border-white/10 bg-white/4 p-3 mb-3">
              <div className="flex items-center gap-3 mb-2">
                {post.workoutDuration != null && <span className="text-xs font-semibold text-white/60">⏱ {formatPostDurationLocal(post.workoutDuration)}</span>}
                {post.workoutReps != null && post.workoutReps > 0 && <span className="text-xs font-semibold text-white/60">🔁 {post.workoutReps} rep</span>}
              </div>
              {post.workoutExercises?.map((ex, i) => (
                <div key={i} className="flex items-center gap-2 mb-0.5">
                  <div className="w-1 h-1 rounded-full bg-brand-green/60 flex-shrink-0" />
                  <span className="text-xs text-white/70">{ex.summary}</span>
                </div>
              ))}
            </div>
          )}

          {post.photoUrl && (
            <div className="relative mb-3 rounded-xl overflow-hidden">
              <Image src={post.photoUrl} alt="" width={600} height={400} className="w-full object-cover rounded-xl"
                unoptimized={!post.photoUrl.startsWith('https://firebasestorage')} />
            </div>
          )}

          {/* Reactions */}
          <div className="flex items-center gap-2 flex-wrap mb-4" onClick={e => e.stopPropagation()}>
            {/* Primary reactions — always visible */}
            {['💪', '❤️'].map(e => {
              const count = (reactionCounts[e] ?? []).length
              return (
                <button key={e} onClick={() => handleReaction(e)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                    myReaction === e ? 'bg-brand-green/20 border-brand-green/50 text-brand-green' : 'bg-white/8 border-white/12 text-white/60'
                  }`}>
                  {e} {count > 0 && <span onClick={ev => { ev.stopPropagation(); setShowReactors(e) }}>{count}</span>}
                </button>
              )
            })}
            {/* Secondary reactions — visible if count > 0, myReaction, or picker open */}
            {['🔥', '👏', '😮'].map(e => {
              const count = (reactionCounts[e] ?? []).length
              if (count === 0 && myReaction !== e && !showReactionPicker) return null
              return (
                <button key={e} onClick={() => { handleReaction(e); setShowReactionPicker(false) }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                    myReaction === e ? 'bg-brand-green/20 border-brand-green/50 text-brand-green' : 'bg-white/8 border-white/12 text-white/60'
                  }`}>
                  {e} {count > 0 && <span onClick={ev => { ev.stopPropagation(); setShowReactors(e) }}>{count}</span>}
                </button>
              )
            })}
            {!showReactionPicker && (
              <button onClick={() => setShowReactionPicker(true)}
                className="w-7 h-7 rounded-full bg-white/8 border border-white/12 text-white/40 text-sm flex items-center justify-center">+</button>
            )}
          </div>

          {showReactors && (
            <ReactorsModal emoji={showReactors} reactionCounts={reactionCounts} members={members} onClose={() => setShowReactors(null)} />
          )}

          {/* Comments */}
          <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2">{t('comm_detail.comments_header', { n: comments.length })}</p>
          {comments.length === 0 && (
            <p className="text-xs text-white/25 text-center py-4">{t('comm_detail.no_comments_yet')}</p>
          )}
          {comments.map(c => (
            <div key={c.id} className="flex gap-2.5 mb-3">
              <div className="mt-0.5">
                <MemberAvatar photoUrl={c.authorPhotoUrl} name={c.authorName} size={28} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="rounded-2xl px-3 py-2" style={{ backgroundColor: 'var(--app-surface)' }}>
                  <span className="text-xs font-bold text-white">{c.authorName} </span>
                  {editingCommentId === c.id ? (
                    <div className="flex gap-1 mt-1">
                      <input
                        value={editCommentText}
                        onChange={e => setEditCommentText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEditComment(c.id)}
                        className="flex-1 h-7 rounded-lg px-2 text-xs text-white outline-none border border-brand-green/60 bg-white/7"
                        autoFocus
                      />
                      <button onClick={() => saveEditComment(c.id)} className="text-brand-green text-xs font-bold px-1">&#10003;</button>
                      <button onClick={() => setEditingCommentId(null)} className="text-white/40 text-xs px-1">&#10005;</button>
                    </div>
                  ) : (
                    <span className="text-xs text-white/70">{c.text}</span>
                  )}
                </div>
              </div>
              {(c.authorId === myUid || isSuperAdmin) && editingCommentId !== c.id && (
                <div className="flex gap-0.5 flex-shrink-0 mt-2">
                  {c.authorId === myUid && (
                    <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.text) }}
                      aria-label="Editează comentariu"
                      className="text-white/40 hover:text-white/70 transition-colors p-0.5">
                      <Pencil size={12} />
                    </button>
                  )}
                  <button onClick={() => deleteComment(c.id)} aria-label="Șterge comentariu"
                    className="text-red-400/60 hover:text-red-400 transition-colors p-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Comment input */}
        <div className="flex gap-2 px-5 py-3 border-t border-white/8 flex-shrink-0">
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addComment()}
            placeholder={t('comm_detail.add_comment')}
            className="flex-1 h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
          />
          <button onClick={addComment} disabled={commenting || !commentText.trim()}
            className="w-10 h-10 rounded-xl bg-brand-green disabled:opacity-40 flex items-center justify-center flex-shrink-0">
            <Send size={14} className="text-black" />
          </button>
        </div>
      </div>
    </div>
  )
}
