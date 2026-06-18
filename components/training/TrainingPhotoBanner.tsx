'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useRouter } from 'next/navigation'
import { Camera, X } from 'lucide-react'
import type { PlannedTraining } from '@/types'

const SUPERADMIN = process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? ''
const DISMISS_KEY = 'calipal_training_photo_banner_dismissed'

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

export default function TrainingPhotoBanner() {
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [activeTraining, setActiveTraining] = useState<{ communityId: string; training: PlannedTraining } | null>(null)

  const isSuperAdmin = user?.email === SUPERADMIN

  // Find ongoing/recently-ended training in favorite community
  useEffect(() => {
    if (!user || !isSuperAdmin) return
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

          setActiveTraining({ communityId: favCommunityId, training: t })
          return
        }
        setActiveTraining(null)
      }
    )
    return unsub
  }, [user, isSuperAdmin, profile?.favoriteCommunityId])

  if (!isSuperAdmin || !activeTraining || dismissed) return null

  // Check sessionStorage for dismissal
  if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY)) return null

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation()
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <button
      onClick={() => router.push(`/community/${activeTraining.communityId}`)}
      className="fixed top-0 left-0 right-0 z-[300] flex items-center justify-center gap-2 px-4 py-2.5 text-black text-sm font-bold"
      style={{ backgroundColor: 'var(--accent)' }}
    >
      <Camera size={16} />
      <span>Adaugă o poză la antrenamentul de azi!</span>
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/15 flex items-center justify-center"
        aria-label="Închide"
      >
        <X size={12} className="text-black" />
      </button>
    </button>
  )
}
