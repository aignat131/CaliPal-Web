'use client'

import { useEffect, useState, useRef } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, doc, increment, serverTimestamp, query, orderBy, deleteDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { uploadTrainingPhoto } from '@/lib/firebase/storage'
import { MapPin, Clock, Camera, Trash2, MessageCircle, Send, Pencil } from 'lucide-react'
import type { PlannedTraining, TrainingPhoto, PostComment } from '@/types'
import TrainingPhotoCarousel from './TrainingPhotoCarousel'
import PhotoDeleteModal from './PhotoDeleteModal'
import { useT } from '@/lib/context/LanguageContext'

interface Props {
  training: PlannedTraining
  communityId: string
  myUid: string
  myName: string
  myPhoto: string | null
  isSuperAdmin?: boolean
}

function parseTrainingDateTime(str: string, fallbackDate?: string): Date | null {
  if (!str) return null
  const androidMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (androidMatch) {
    const [, dd, mm, yyyy, hh, min] = androidMatch
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}`)
  }
  if (fallbackDate && /^\d{2}:\d{2}$/.test(str)) {
    return new Date(`${fallbackDate}T${str}`)
  }
  try { return new Date(str) } catch { return null }
}

export default function TrainingPhotoCard({ training, communityId, myUid, myName, myPhoto, isSuperAdmin }: Props) {
  const t = useT()
  const [photos, setPhotos] = useState<TrainingPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ mode: 'single' | 'all'; photo?: TrainingPhoto } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [reactionCounts, setReactionCounts] = useState<Record<string, string[]>>({})
  const [myReaction, setMyReaction] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')

  // Subscribe to photos subcollection
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'communities', communityId, 'trainings', training.id, 'photos'),
      snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainingPhoto))
          .filter(p => p.visibility !== 'private' || p.authorId === myUid || isSuperAdmin)
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
          const tb = b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
          return ta - tb
        })
        setPhotos(items)
      }
    )
    return unsub
  }, [communityId, training.id, myUid, isSuperAdmin])

  // Subscribe to reactions subcollection
  useEffect(() => {
    return onSnapshot(
      collection(db, 'communities', communityId, 'trainings', training.id, 'reactions'),
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
      () => { /* permission denied or offline */ }
    )
  }, [communityId, training.id, myUid])

  // Subscribe to comments subcollection
  useEffect(() => {
    if (!showComments) return
    const q = query(
      collection(db, 'communities', communityId, 'trainings', training.id, 'comments'),
      orderBy('createdAt', 'asc')
    )
    return onSnapshot(q,
      snap => { setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PostComment)) },
      () => { /* permission denied or offline */ }
    )
  }, [showComments, training.id, communityId])

  async function handleReaction(emoji: string) {
    if (!myUid) return
    const ref = doc(db, 'communities', communityId, 'trainings', training.id, 'reactions', myUid)
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
        collection(db, 'communities', communityId, 'trainings', training.id, 'comments'),
        { authorId: myUid, authorName: myName, authorPhotoUrl: myPhoto || null, text: commentText.trim(), createdAt: serverTimestamp() }
      )
      await updateDoc(doc(db, 'communities', communityId, 'trainings', training.id), { commentsCount: increment(1) })
      setCommentText('')
    } finally { setCommenting(false) }
  }

  async function deleteComment(commentId: string) {
    await deleteDoc(doc(db, 'communities', communityId, 'trainings', training.id, 'comments', commentId))
    await updateDoc(doc(db, 'communities', communityId, 'trainings', training.id), { commentsCount: increment(-1) })
  }

  async function saveEditComment(commentId: string) {
    if (!editCommentText.trim()) return
    await updateDoc(
      doc(db, 'communities', communityId, 'trainings', training.id, 'comments', commentId),
      { text: editCommentText.trim() }
    )
    setEditingCommentId(null)
    setEditCommentText('')
  }

  // Can user add a photo?
  const isAttendee = training.attendedBy?.includes(myUid) || training.rsvps?.[myUid] === 'GOING'
  const myPhotoCount = photos.filter(p => p.authorId === myUid).length
  const now = new Date()
  const end = parseTrainingDateTime(training.timeEnd, training.date)
  const start = parseTrainingDateTime(training.timeStart, training.date)
  const hasStarted = start ? start <= now : false
  const isOngoing = start && end ? start <= now && now < end : false
  const fourHoursAfterEnd = end ? new Date(end.getTime() + 4 * 60 * 60 * 1000) : null
  const withinUploadWindow = isOngoing || (fourHoursAfterEnd && now < fourHoursAfterEnd)
  const canAddPhoto = isAttendee && myPhotoCount < 3 && !!withinUploadWindow && !uploading && hasStarted

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !canAddPhoto) return
    setUploading(true)
    try {
      const photoUrl = await uploadTrainingPhoto(communityId, training.id, myUid, file)
      await addDoc(collection(db, 'communities', communityId, 'trainings', training.id, 'photos'), {
        authorId: myUid,
        authorName: myName,
        authorPhotoUrl: myPhoto || null,
        photoUrl,
        visibility: 'public',
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'communities', communityId, 'trainings', training.id), {
        photoCount: increment(1),
      })
    } catch (err) {
      console.error('Failed to upload training photo:', err)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleDeletePhoto(photo: TrainingPhoto) {
    if (photo.authorId === myUid) {
      // Own photo — delete directly without reason modal
      deletePhotos([photo.id])
    } else {
      // Superadmin deleting someone else's photo — show reason modal
      setDeleteTarget({ mode: 'single', photo })
    }
  }

  async function deletePhotos(photoIds: string[], reason?: string) {
    if (deleting) return
    setDeleting(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const body: Record<string, unknown> = { communityId, trainingId: training.id, photoIds }
      if (reason) body.reason = reason
      const res = await fetch('/api/admin/delete-training-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) console.error('Delete photos failed:', data.reason)
    } catch (err) {
      console.error('Delete photos error:', err)
    } finally {
      setDeleting(false)
    }
  }

  async function handleConfirmDelete(reason: string) {
    if (deleting) return
    if (deleteTarget?.mode === 'all') {
      setDeleting(true)
      try {
        const token = await auth.currentUser?.getIdToken()
        const res = await fetch('/api/admin/delete-training-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ communityId, trainingId: training.id, deleteAll: true, reason }),
        })
        const data = await res.json()
        if (!data.ok) console.error('Delete photos failed:', data.reason)
      } catch (err) {
        console.error('Delete photos error:', err)
      } finally {
        setDeleting(false)
        setDeleteTarget(null)
      }
    } else if (deleteTarget?.photo) {
      await deletePhotos([deleteTarget.photo.id], reason)
      setDeleteTarget(null)
    }
  }

  // Format display date
  const displayDate = start
    ? start.toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' })
    : ''
  const displayTime = start
    ? start.toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })
    : ''

  // Attendee avatars (up to 6)
  const attendees = training.attendedBy ?? Object.keys(training.rsvps ?? {}).filter(k => training.rsvps[k] === 'GOING')
  const avatarUids = attendees.slice(0, 6)
  const extraCount = Math.max(0, attendees.length - 6)

  // Don't render before training starts, or if no photos and can't add
  if (!hasStarted) return null
  if (photos.length === 0 && !canAddPhoto) return null

  return (
    <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'var(--app-surface)' }}>
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Camera size={14} className="text-brand-green" />
          <span className="text-sm font-bold text-white flex-1">{training.name}</span>
          {isSuperAdmin && photos.length > 0 && (
            <button
              onClick={() => setDeleteTarget({ mode: 'all' })}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors"
              aria-label="Șterge toate pozele"
            >
              <Trash2 size={13} className="text-red-400/70" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/45">
          {displayDate && (
            <span className="flex items-center gap-1">
              <Clock size={10} /> {displayDate} {displayTime}
            </span>
          )}
          {training.location && (
            <span className="flex items-center gap-1">
              <MapPin size={10} /> {training.location}
            </span>
          )}
        </div>

        {/* Attendee avatars */}
        {avatarUids.length > 0 && (
          <div className="flex items-center mt-2 -space-x-2">
            {avatarUids.map(uid => {
              const photo = training.rsvpPhotos?.[uid]
              const name = training.rsvpNames?.[uid] ?? '?'
              return photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={uid} src={photo} alt={name} className="w-6 h-6 rounded-full border-2 border-[var(--app-surface)] object-cover" />
              ) : (
                <span key={uid} className="w-6 h-6 rounded-full border-2 border-[var(--app-surface)] bg-brand-green/20 flex items-center justify-center text-[9px] font-bold text-white">
                  {name.charAt(0)}
                </span>
              )
            })}
            {extraCount > 0 && (
              <span className="w-6 h-6 rounded-full border-2 border-[var(--app-surface)] bg-white/10 flex items-center justify-center text-[9px] text-white/60">
                +{extraCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Carousel */}
      <div className="mb-3">
        <TrainingPhotoCarousel
          photos={photos}
          canAddPhoto={canAddPhoto}
          onAddPhoto={() => fileRef.current?.click()}
          myUid={myUid}
          isSuperAdmin={isSuperAdmin}
          onDeletePhoto={photo => handleDeletePhoto(photo)}
          onDeleteAll={() => setDeleteTarget({ mode: 'all' })}
        />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Upload indicator */}
      {uploading && (
        <div className="mb-3">
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-brand-green animate-pulse w-2/3 rounded-full" />
          </div>
        </div>
      )}

      {/* Reactions + Comment toggle */}
      <div className="flex items-center gap-2 flex-wrap mt-1">
        {['💪', '❤️'].map(e => {
          const count = (reactionCounts[e] ?? []).length
          return (
            <button key={e} onClick={() => handleReaction(e)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                myReaction === e ? 'bg-brand-green/20 border-brand-green/50 text-brand-green' : 'bg-white/8 border-white/12 text-white/60'
              }`}>
              {e} {count > 0 && count}
            </button>
          )
        })}
        {['🔥', '👏', '😮'].map(e => {
          const count = (reactionCounts[e] ?? []).length
          if (count === 0 && myReaction !== e && !showReactionPicker) return null
          return (
            <button key={e} onClick={() => { handleReaction(e); setShowReactionPicker(false) }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                myReaction === e ? 'bg-brand-green/20 border-brand-green/50 text-brand-green' : 'bg-white/8 border-white/12 text-white/60'
              }`}>
              {e} {count > 0 && count}
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
          {(showComments ? comments.length : (training.commentsCount ?? 0)) > 0 && (
            <span>{showComments ? comments.length : training.commentsCount}</span>
          )}
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-3 border-t border-white/8 pt-3">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2 mb-2">
              <div className="mt-0.5 w-6 h-6 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/20">
                {c.authorPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.authorPhotoUrl} alt={c.authorName} className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <span className="text-[9px] font-bold text-white">{c.authorName.trim().charAt(0).toUpperCase()}</span>
                )}
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
                      aria-label="Edit comment"
                      className="text-white/40 hover:text-white/70 transition-colors p-0.5">
                      <Pencil size={11} />
                    </button>
                  )}
                  <button onClick={() => deleteComment(c.id)} aria-label="Delete comment"
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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <PhotoDeleteModal
          mode={deleteTarget.mode}
          photo={deleteTarget.photo}
          photoCount={photos.length}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
