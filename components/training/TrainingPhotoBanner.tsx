'use client'

import { useEffect, useState, useRef } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { uploadTrainingPhoto } from '@/lib/firebase/storage'
import { useToast } from '@/lib/context/ToastContext'
import ImageCropModal from '@/components/ui/ImageCropModal'
import { Camera, X, Upload, Eye, EyeOff } from 'lucide-react'
import type { PlannedTraining } from '@/types'

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

function getDismissKey(trainingId: string) {
  return `calipal_photo_popup_dismissed_${trainingId}`
}

export default function TrainingPhotoBanner() {
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const { showToast } = useToast()
  const [activeTraining, setActiveTraining] = useState<{ communityId: string; training: PlannedTraining } | null>(null)
  // Track dismissed training IDs in a ref so onSnapshot re-fires never re-show the popup
  const dismissedIds = useRef<Set<string>>(new Set())
  const [privateOnly, setPrivateOnly] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Find ongoing/recently-ended training in favorite community
  useEffect(() => {
    if (!user) return
    const favCommunityId = profile?.favoriteCommunityId
    if (!favCommunityId) return

    const unsub = onSnapshot(
      collection(db, 'communities', favCommunityId, 'trainings'),
      snap => {
        const now = new Date()
        const fourHoursMs = 4 * 60 * 60 * 1000
        const trainings = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as PlannedTraining))
          .filter(t => !t.deletedAt)

        for (const t of trainings) {
          const start = t.timeStart ? parseTrainingDateTime(t.timeStart, t.date) : null
          const end = t.timeEnd ? parseTrainingDateTime(t.timeEnd, t.date) : null
          if (!start) continue
          const isOngoing = end ? start <= now && now < end : false
          const isRecent = end ? now >= end && now < new Date(end.getTime() + fourHoursMs) : false
          if (!isOngoing && !isRecent) continue

          // Check if user is attendee/RSVP'd
          const isAttendee = t.attendedBy?.includes(user.uid) || t.rsvps?.[user.uid] === 'GOING'
          if (!isAttendee) continue

          // Check if already dismissed for this training (localStorage persists across sessions,
          // dismissedIds ref persists across onSnapshot re-fires within the same mount)
          if (dismissedIds.current.has(t.id)) continue
          if (typeof window !== 'undefined' && localStorage.getItem(getDismissKey(t.id))) {
            dismissedIds.current.add(t.id)
            continue
          }

          setActiveTraining({ communityId: favCommunityId, training: t })
          return
        }
        setActiveTraining(null)
      }
    )
    return unsub
  }, [user, profile?.favoriteCommunityId])

  if (!activeTraining) return null

  function handleDismiss() {
    if (activeTraining) {
      localStorage.setItem(getDismissKey(activeTraining.training.id), '1')
      dismissedIds.current.add(activeTraining.training.id)
    }
    setActiveTraining(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user || !activeTraining) return
    const url = URL.createObjectURL(file)
    setCropSrc(url)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleCropConfirm(croppedFile: File) {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    if (!user || !activeTraining) return
    setUploading(true)
    try {
      const { communityId, training } = activeTraining
      const photoUrl = await uploadTrainingPhoto(communityId, training.id, user.uid, croppedFile)
      await addDoc(collection(db, 'communities', communityId, 'trainings', training.id, 'photos'), {
        authorId: user.uid,
        authorName: profile?.displayName ?? 'Anonim',
        authorPhotoUrl: profile?.photoUrl ?? null,
        photoUrl,
        visibility: privateOnly ? 'private' : 'public',
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'communities', communityId, 'trainings', training.id), {
        photoCount: increment(1),
      })
      setUploaded(true)
      // Auto-dismiss after short delay
      setTimeout(handleDismiss, 1500)
    } catch (err) {
      console.error('Failed to upload training photo:', err)
      showToast('Eroare la încărcarea pozei. Încearcă din nou.', 'error')
    } finally {
      setUploading(false)
    }
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  return (
    <>
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-6"
        onClick={handleDismiss}>
        <div
          className="relative w-full max-w-sm rounded-3xl p-6"
          style={{ backgroundColor: 'var(--app-surface)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"
            aria-label="Închide"
          >
            <X size={14} className="text-white/60" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(76,175,80,0.15)' }}>
              <Camera size={28} className="text-brand-green" />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-base font-black text-white text-center mb-1">
            Adaugă o poză la antrenament!
          </h3>
          <p className="text-sm text-white/45 text-center mb-5">
            {activeTraining.training.name}
          </p>

          {uploaded ? (
            <div className="text-center py-4">
              <p className="text-brand-green font-bold text-sm">Poza a fost încărcată! ✓</p>
            </div>
          ) : (
            <>
              {/* Private toggle */}
              <button
                onClick={() => setPrivateOnly(v => !v)}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl mb-4 transition-colors"
                style={{ backgroundColor: privateOnly ? 'var(--accent-muted, rgba(76,175,80,0.1))' : 'rgba(255,255,255,0.05)' }}
              >
                {privateOnly ? <EyeOff size={14} className="text-brand-green" /> : <Eye size={14} className="text-white/40" />}
                <span className={`text-sm ${privateOnly ? 'text-brand-green font-semibold' : 'text-white/50'}`}>
                  Doar pentru mine
                </span>
              </button>

              {/* Upload button */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full h-12 rounded-2xl text-sm font-bold text-black flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {uploading ? (
                  <span>Se încarcă...</span>
                ) : (
                  <>
                    <Upload size={16} />
                    Încarcă o poză
                  </>
                )}
              </button>

              {/* Skip button */}
              <button
                onClick={handleDismiss}
                className="w-full h-10 mt-2 rounded-2xl text-sm text-white/40 font-medium hover:text-white/60 transition-colors"
              >
                Sari peste
              </button>
            </>
          )}

          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Crop modal — above the banner (z-300) */}
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          mode="training"
          zIndex={400}
        />
      )}
    </>
  )
}
