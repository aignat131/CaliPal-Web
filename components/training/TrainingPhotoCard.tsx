'use client'

import { useEffect, useState, useRef } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { uploadTrainingPhoto } from '@/lib/firebase/storage'
import { MapPin, Clock, Camera } from 'lucide-react'
import type { PlannedTraining, TrainingPhoto } from '@/types'
import TrainingPhotoCarousel from './TrainingPhotoCarousel'

interface Props {
  training: PlannedTraining
  communityId: string
  myUid: string
  myName: string
  myPhoto: string | null
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

export default function TrainingPhotoCard({ training, communityId, myUid, myName, myPhoto }: Props) {
  const [photos, setPhotos] = useState<TrainingPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Subscribe to photos subcollection
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'communities', communityId, 'trainings', training.id, 'photos'),
      snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainingPhoto))
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0
          const tb = b.createdAt?.toMillis?.() ?? 0
          return ta - tb
        })
        setPhotos(items)
      }
    )
    return unsub
  }, [communityId, training.id])

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
    <div className="mb-4 rounded-2xl overflow-hidden border border-white/8" style={{ backgroundColor: 'var(--app-surface)' }}>
      {/* Header */}
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <Camera size={14} className="text-brand-green" />
          <span className="text-sm font-bold text-white">{training.name}</span>
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
      <div className="px-2 pb-3">
        <TrainingPhotoCarousel
          photos={photos}
          canAddPhoto={canAddPhoto}
          onAddPhoto={() => fileRef.current?.click()}
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
        <div className="px-3 pb-3">
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-brand-green animate-pulse w-2/3 rounded-full" />
          </div>
        </div>
      )}
    </div>
  )
}
