'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useT } from '@/lib/context/LanguageContext'
import { createNotification } from '@/lib/firebase/notifications'
import { useAuth } from '@/lib/hooks/useAuth'
import type { PlannedTraining, CommunityMember } from '@/types'
import { ChevronLeft, Calendar, Clock, MapPin, Dumbbell, Users } from 'lucide-react'
import Link from 'next/link'
import { parseMapTrainingDate } from '@/components/map/parseMapTrainingDate'
import { MemberAvatar } from '@/components/map/MemberAvatar'

// ── Training Detail Panel (inline guest view) ─────────────────────────────────

export function TrainingDetailPanel({
  training, communityId, parkId, communityMembers, onBack, onClose,
}: {
  training: PlannedTraining
  communityId: string | null
  parkId: string | null
  communityMembers: CommunityMember[]
  onBack: () => void
  onClose: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const [liveTraining, setLiveTraining] = useState<PlannedTraining>(training)
  const [guestId, setGuestId] = useState('')
  const [guestInput, setGuestInput] = useState('')
  const [guestConfirmed, setGuestConfirmed] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [savingGuest, setSavingGuest] = useState(false)

  // Init guest ID from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    let id = localStorage.getItem('calipal_guest_id')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('calipal_guest_id', id) }
    setGuestId(id)
  }, [])

  // Real-time training snapshot
  useEffect(() => {
    const ref = communityId
      ? doc(db, 'communities', communityId, 'trainings', training.id)
      : doc(db, 'parks', parkId!, 'trainings', training.id)
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setLiveTraining({ id: snap.id, ...snap.data() } as PlannedTraining)
    }, () => {})
    return unsub
  }, [training.id, communityId, parkId])

  // Sync guest RSVP state
  useEffect(() => {
    if (!guestId) return
    const g = liveTraining.guestRsvps?.[guestId]
    if (g) { setGuestConfirmed(true); setGuestName(g.name) }
    else { setGuestConfirmed(false) }
  }, [liveTraining, guestId])

  const trainingRef = communityId
    ? doc(db, 'communities', communityId, 'trainings', training.id)
    : doc(db, 'parks', parkId!, 'trainings', training.id)

  async function confirmGuestRsvp() {
    const name = guestInput.trim()
    if (!name || !guestId || savingGuest) return
    setSavingGuest(true)
    try {
      await updateDoc(trainingRef, { [`guestRsvps.${guestId}`]: { name, status: 'GOING' } })
      if (communityId) {
        const now = Date.now()
        const lastAt = liveTraining.lastRsvpNotifAt?.toDate?.()?.getTime() ?? 0
        if (now - lastAt >= 60 * 60 * 1000) {
          await updateDoc(trainingRef, { lastRsvpNotifAt: serverTimestamp() })
          await createNotification(
            liveTraining.authorId, 'TRAINING_RSVP',
            'Cineva participă la antrenamentul tău! 💪',
            `${name} a confirmat că merge la „${liveTraining.name}".`,
            training.id,
            user?.uid,
          )
          fetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toUid: liveTraining.authorId,
              title: 'Cineva participă la antrenamentul tău! 💪',
              body: `${name} a confirmat că merge la „${liveTraining.name}".`,
              url: `/training/${communityId}/${training.id}`,
            }),
          }).catch(() => {})
        }
      }
      setGuestInput('')
    } catch (e) { console.error(e) }
    finally { setSavingGuest(false) }
  }

  async function cancelGuestRsvp() {
    if (!guestId || savingGuest) return
    setSavingGuest(true)
    try {
      await updateDoc(trainingRef, { [`guestRsvps.${guestId}`]: deleteField() })
      setGuestConfirmed(false); setGuestName('')
    } catch (e) { console.error(e) }
    finally { setSavingGuest(false) }
  }

  const goingUids = Object.entries(liveTraining.rsvps ?? {}).filter(([, s]) => s === 'GOING').map(([uid]) => uid)
  const guestGoing = Object.entries(liveTraining.guestRsvps ?? {}).filter(([, g]) => g.status === 'GOING')
  const totalGoing = goingUids.length + guestGoing.length

  const dateObj = parseMapTrainingDate(liveTraining)
  const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { weekday: 'long', day: '2-digit', month: 'long' }) : ''
  const timeLabel = liveTraining.timeStart?.slice(-5) ?? ''
  const timeEnd = liveTraining.timeEnd?.slice(-5) ?? ''
  const fullPageHref = communityId
    ? `/training/${communityId}/${training.id}`
    : `/training/park/${parkId}/${training.id}`

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-white/60 hover:text-white transition-colors">
          <ChevronLeft size={16} />
          <span className="text-sm font-semibold">{t('map.training_detail_back')}</span>
        </button>
        <Link href={fullPageHref} onClick={onClose}>
          <span className="text-xs font-bold text-brand-green/80 hover:text-brand-green transition-colors">
            {t('map.view_full_page')}
          </span>
        </Link>
      </div>

      {/* Official badge */}
      {liveTraining.official && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mb-2"
          style={{ backgroundColor: '#FFB80018', color: '#FFB800', border: '1px solid #FFB80030' }}>
          ⭐ OFICIAL
        </span>
      )}

      {/* Title & author */}
      <h2 className="font-black text-white text-lg leading-tight mb-0.5">{liveTraining.name}</h2>
      <p className="text-xs text-white/45 mb-3">
        {liveTraining.authorName}
        {liveTraining.authorCoach && <span className="ml-1 text-brand-green font-semibold">· Coach</span>}
      </p>

      {/* Meta */}
      <div className="flex flex-col gap-1 mb-3">
        {dateLabel && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Calendar size={12} className="text-white/35 flex-shrink-0" />
            {dateLabel}
          </div>
        )}
        {(timeLabel || timeEnd) && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Clock size={12} className="text-white/35 flex-shrink-0" />
            {timeLabel}{timeEnd && timeEnd !== timeLabel ? ` – ${timeEnd}` : ''}
          </div>
        )}
        {liveTraining.location && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <MapPin size={12} className="text-white/35 flex-shrink-0" />
            {liveTraining.location}
          </div>
        )}
      </div>

      {/* Description */}
      {liveTraining.description && (
        <p className="text-sm text-white/60 leading-relaxed mb-3">{liveTraining.description}</p>
      )}

      {/* Exercises */}
      {(liveTraining.exercises ?? []).length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Dumbbell size={12} className="text-white/35" />
            <p className="text-[9px] font-bold text-white/35 tracking-widest">EXERCIȚII</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {liveTraining.exercises.map((ex, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ backgroundColor: '#1ED75F14', color: '#1ED75F', border: '1px solid #1ED75F25' }}>
                {ex.name} {ex.sets}×{ex.repsPerSet}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Equipment */}
      {(liveTraining.equipment ?? []).length > 0 && (
        <div className="mb-3">
          <p className="text-[9px] font-bold text-white/35 tracking-widest mb-1.5">ECHIPAMENT</p>
          <div className="flex flex-wrap gap-1.5">
            {liveTraining.equipment!.map((eq, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>
                {eq}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Attendees */}
      {totalGoing > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users size={12} className="text-white/35" />
            <p className="text-[9px] font-bold text-white/35 tracking-widest">{totalGoing} PERSOANE MERG</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {goingUids.slice(0, 4).map(uid => {
              const m = communityMembers.find(cm => cm.userId === uid)
              const name = liveTraining.rsvpNames?.[uid] ?? m?.displayName ?? 'Membru'
              const photo = liveTraining.rsvpPhotos?.[uid] ?? m?.photoUrl ?? ''
              return <MemberAvatar key={uid} name={name} photoUrl={photo} />
            })}
            {guestGoing.slice(0, 2).map(([gid, g]) => (
              <div key={gid} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#ffffff12', border: '1px solid rgba(255,255,255,0.15)' }}
                title={`${g.name} (invitat)`}>
                <span className="text-[10px] font-bold text-white/50">{g.name.charAt(0).toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-white/8 my-3" />

      {/* Guest RSVP section */}
      <p className="text-[9px] font-bold text-white/35 tracking-widest mb-2">PARTICIPI?</p>
      {guestConfirmed ? (
        <div className="p-3 rounded-xl mb-2" style={{ backgroundColor: '#1ED75F12', border: '1px solid #1ED75F30' }}>
          <p className="text-sm font-semibold text-brand-green">Participi ca invitat! 🎉</p>
          <p className="text-xs text-white/50 mt-0.5">Înregistrat ca: <span className="font-bold text-white/70">{guestName}</span></p>
          <button onClick={cancelGuestRsvp} disabled={savingGuest}
            className="mt-2 text-xs text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-40">
            Anulează participarea
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={guestInput}
              onChange={e => setGuestInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmGuestRsvp()}
              placeholder="Numele tău (1–15 caractere)"
              maxLength={15}
              className="flex-1 h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
            />
            <button onClick={confirmGuestRsvp} disabled={savingGuest || guestInput.trim().length === 0}
              className="h-10 px-4 rounded-xl font-black text-sm text-black disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: '#1ED75F' }}>
              Merg 🏃
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] text-white/25">sau</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex gap-2">
            <Link href="/login" onClick={onClose} className="flex-1">
              <button className="w-full h-9 rounded-xl border border-white/15 text-xs font-semibold text-white/60">
                Intru în cont
              </button>
            </Link>
            <Link href="/register" onClick={onClose} className="flex-1">
              <button className="w-full h-9 rounded-xl text-xs font-bold text-black"
                style={{ backgroundColor: '#1ED75F' }}>
                Creează cont
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
