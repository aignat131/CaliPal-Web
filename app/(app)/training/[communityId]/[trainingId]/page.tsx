'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  doc, getDoc, onSnapshot, updateDoc, deleteField, getDocs, collection, serverTimestamp, increment, arrayUnion,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { createNotification } from '@/lib/firebase/notifications'
import { awardTrainingAttendancePoints } from '@/lib/gamification/coins'
import type { PlannedTraining, CommunityDoc, CommunityMember } from '@/types'
import {
  Calendar, Clock, MapPin, Dumbbell, Users, User, Check, Pencil, X, Search, UserPlus, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import TrainingPhotoCard from '@/components/training/TrainingPhotoCard'
import ExerciseCard from '@/components/exercise/ExerciseCard'

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDateTime(str: string, fallbackDate?: string): Date | null {
  if (!str) return null
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}`)
  }
  if (fallbackDate && /^\d{2}:\d{2}$/.test(str)) return new Date(`${fallbackDate}T${str}`)
  try { return new Date(str) } catch { return null }
}

function formatDate(timeStart: string, legacyDate?: string): string {
  const d = parseDateTime(timeStart, legacyDate)
  if (!d || isNaN(d.getTime())) return legacyDate ?? ''
  return d.toLocaleDateString('ro', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Member Avatar ─────────────────────────────────────────────────────────────

function MemberAvatar({ photoUrl, name, size = 32 }: { photoUrl?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: 'rgba(var(--accent-rgb), 0.13)', border: '2px solid rgba(var(--accent-rgb), 0.27)' }}
    >
      {photoUrl && !imgError
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photoUrl} alt={name} width={size} height={size} className="object-cover w-full h-full" onError={() => setImgError(true)} />
        : <span className="font-bold text-brand-green" style={{ fontSize: size * 0.38 }}>{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}

// ── Guest Avatar ──────────────────────────────────────────────────────────────

function GuestAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)' }}
    >
      <User size={size * 0.45} className="text-white/50" />
    </div>
  )
}

// ── Edit helpers ──────────────────────────────────────────────────────────────

function toDateInputValue(str: string): string {
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return ''
}

function toTimeInputValue(str: string): string {
  const m = str.match(/(\d{2}:\d{2})$/)
  return m ? m[1] : ''
}

function toAndroidDateTime(date: string, time: string): string {
  if (!date || !time) return ''
  const [yyyy, mm, dd] = date.split('-')
  return `${dd}/${mm}/${yyyy} ${time}`
}

function isPast(training: PlannedTraining): boolean {
  const end = parseDateTime(training.timeEnd) ?? parseDateTime(training.timeStart, training.date)
  return !!end && end.getTime() < Date.now()
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PublicTrainingPage() {
  const { user, isSuperAdmin } = useAuth()
  const { displayName: myDisplayName, photoUrl: myPhotoUrl } = useMyProfile()
  const router = useRouter()
  const params = useParams()
  const communityId = params.communityId as string
  const trainingId = params.trainingId as string

  const [training, setTraining] = useState<PlannedTraining | null>(null)
  const [community, setCommunity] = useState<CommunityDoc | null>(null)
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [isMember, setIsMember] = useState(false)
  const [loading, setLoading] = useState(true)

  const [profiles, setProfiles] = useState<Record<string, { name: string; photoUrl: string | null }>>({})

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTimeStart, setEditTimeStart] = useState('')
  const [editTimeEnd, setEditTimeEnd] = useState('')
  const [saving, setSaving] = useState(false)

  // Close training state
  const [showClosePanel, setShowClosePanel] = useState(false)
  const [attendedUids, setAttendedUids] = useState<Set<string>>(new Set())
  const [closing, setClosing] = useState(false)
  const [closeResult, setCloseResult] = useState<{ awarded: number } | null>(null)

  // Add Members state
  const [showAddMembersPanel, setShowAddMembersPanel] = useState(false)
  const [addMembersSearch, setAddMembersSearch] = useState('')
  const [selectedMemberUids, setSelectedMemberUids] = useState<Set<string>>(new Set())
  const [addingMembers, setAddingMembers] = useState(false)
  const [addMembersResult, setAddMembersResult] = useState<{ added: number } | null>(null)
  const [addMembersError, setAddMembersError] = useState<string | null>(null)

  // Guest state
  const [guestId, setGuestId] = useState<string>('')
  const [guestName, setGuestName] = useState('')
  const [guestInput, setGuestInput] = useState('')
  const [savingGuest, setSavingGuest] = useState(false)
  const [guestConfirmed, setGuestConfirmed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Init guest ID from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    let id = localStorage.getItem('calipal_guest_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('calipal_guest_id', id)
    }
    setGuestId(id)
  }, [])

  // Load community
  useEffect(() => {
    getDoc(doc(db, 'communities', communityId)).then(snap => {
      if (snap.exists()) setCommunity({ id: snap.id, ...snap.data() } as CommunityDoc)
    })
  }, [communityId])

  // Load members (for enriching RSVP display + membership check)
  useEffect(() => {
    getDocs(collection(db, 'communities', communityId, 'members')).then(snap => {
      const list = snap.docs.map(d => d.data() as CommunityMember)
      setMembers(list)
      if (user) setIsMember(list.some(m => m.userId === user.uid))
    }).catch(() => {})
  }, [communityId, user])

  // Fetch profiles for all attendees (name + photo) — auth-only, silent fail
  useEffect(() => {
    if (!training || !user) return
    const goingUids = Object.entries(training.rsvps ?? {})
      .filter(([, s]) => s === 'GOING')
      .map(([uid]) => uid)
    const uidsToFetch = goingUids.filter(uid =>
      uid !== training.authorId && !profiles[uid]
    )
    if (!uidsToFetch.length) return
    Promise.all(
      uidsToFetch.map(uid =>
        getDoc(doc(db, 'users', uid)).then(snap => ({
          uid,
          name: (snap.data()?.displayName as string | undefined) ?? '',
          photoUrl: (snap.data()?.photoUrl as string | null | undefined) ?? null,
        }))
      )
    ).then(results => {
      setProfiles(prev => {
        const next = { ...prev }
        results.forEach(r => { next[r.uid] = { name: r.name, photoUrl: r.photoUrl } })
        return next
      })
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training?.id, training?.rsvps, user])

  // Patch missing rsvpNames/rsvpPhotos so non-auth users can see participant names and photos
  useEffect(() => {
    if (!training || !user || !members.length) return
    const goingUids = Object.entries(training.rsvps ?? {})
      .filter(([, s]) => s === 'GOING')
      .map(([uid]) => uid)
    const patch: Record<string, string> = {}
    goingUids.forEach(uid => {
      const m = members.find(mem => mem.userId === uid)
      if (!training.rsvpNames?.[uid] && m?.displayName) patch[`rsvpNames.${uid}`] = m.displayName
      if (!training.rsvpPhotos?.[uid] && m?.photoUrl) patch[`rsvpPhotos.${uid}`] = m.photoUrl
    })
    if (!Object.keys(patch).length) return
    updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), patch).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training?.id, training?.rsvps, members])

  // Load training (real-time)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'communities', communityId, 'trainings', trainingId),
      snap => {
        if (snap.exists() && !snap.data().deletedAt) {
          setTraining({ id: snap.id, ...snap.data() } as PlannedTraining)
        } else {
          setTraining(null)
        }
        setLoading(false)
      },
      () => setLoading(false)
    )
    return unsub
  }, [communityId, trainingId])

  // Sync guest RSVP state from training
  useEffect(() => {
    if (!training || !guestId) return
    const g = training.guestRsvps?.[guestId]
    if (g) {
      setGuestConfirmed(true)
      setGuestName(g.name)
    } else {
      setGuestConfirmed(false)
    }
  }, [training, guestId])

  async function confirmGuestRsvp() {
    const name = guestInput.trim()
    if (!name || !guestId || savingGuest || !training) return
    setSavingGuest(true)
    try {
      await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
        [`guestRsvps.${guestId}`]: { name, status: 'GOING' },
      })
      const now = Date.now()
      const lastAt = training.lastRsvpNotifAt?.toDate?.()?.getTime() ?? 0
      if (now - lastAt >= 60 * 60 * 1000) {
        await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
          lastRsvpNotifAt: serverTimestamp(),
        })
        await createNotification(
          training.authorId,
          'TRAINING_RSVP',
          'Cineva participă la antrenamentul tău! 💪',
          `${name} a confirmat că merge la „${training.name}".`,
          trainingId,
          user?.uid,
        )
        // Also send FCM push to creator's device (fire-and-forget)
        fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toUid: training.authorId,
            title: 'Cineva participă la antrenamentul tău! 💪',
            body: `${name} a confirmat că merge la „${training.name}".`,
            url: `/training/${communityId}/${trainingId}`,
          }),
        }).catch(() => {})
      }
      setGuestName(name)
      setGuestConfirmed(true)
      setGuestInput('')
    } catch (e) {
      console.error(e)
    } finally {
      setSavingGuest(false)
    }
  }

  async function cancelGuestRsvp() {
    if (!guestId || savingGuest) return
    setSavingGuest(true)
    try {
      await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
        [`guestRsvps.${guestId}`]: deleteField(),
      })
      setGuestConfirmed(false)
      setGuestName('')
    } catch (e) {
      console.error(e)
    } finally {
      setSavingGuest(false)
    }
  }

  function openEdit() {
    if (!training) return
    setEditName(training.name)
    setEditDesc(training.description ?? '')
    setEditDate(toDateInputValue(training.timeStart))
    setEditTimeStart(toTimeInputValue(training.timeStart))
    setEditTimeEnd(training.timeEnd ? toTimeInputValue(training.timeEnd) : '')
    setEditing(true)
  }

  async function saveEdit() {
    if (!training || saving || !editName.trim() || !editDate || !editTimeStart) return
    setSaving(true)
    try {
      const newTimeStart = toAndroidDateTime(editDate, editTimeStart)
      const newTimeEnd = editTimeEnd ? toAndroidDateTime(editDate, editTimeEnd) : ''
      await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
        name: editName.trim(),
        description: editDesc.trim(),
        timeStart: newTimeStart,
        ...(newTimeEnd ? { timeEnd: newTimeEnd } : {}),
      })
      setEditing(false)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  function openClosePanel() {
    if (!training) return
    const goingUids = Object.entries(training.rsvps ?? {})
      .filter(([, s]) => s === 'GOING').map(([uid]) => uid)
    setAttendedUids(new Set(goingUids))
    setShowClosePanel(true)
  }

  async function closeTraining() {
    if (!user || !training || closing) return
    setClosing(true)
    try {
      const uidsArr = Array.from(attendedUids)
      await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
        isClosed: true,
        attendedBy: uidsArr,
        closedAt: serverTimestamp(),
        closedByUid: user.uid,
      })

      // Award training points to all attendees + the creator
      const uidsToAward = new Set(uidsArr)
      if (training.authorId) uidsToAward.add(training.authorId)
      const allUids = Array.from(uidsToAward)
      const results = await Promise.allSettled(
        allUids.map(uid => awardTrainingAttendancePoints(uid, communityId))
      )
      const awarded = results.filter(r => r.status === 'fulfilled').length

      // Increment global totalTrainings on each attendee's user profile
      await Promise.allSettled(
        allUids.map(uid => updateDoc(doc(db, 'users', uid), { totalTrainings: increment(1) }))
      )

      setCloseResult({ awarded })
      setShowClosePanel(false)
    } catch (e) {
      console.error(e)
    } finally {
      setClosing(false)
    }
  }

  function openAddMembersPanel() {
    if (!training) return
    const goingSet = new Set(
      Object.entries(training.rsvps ?? {})
        .filter(([, s]) => s === 'GOING')
        .map(([uid]) => uid)
    )
    setSelectedMemberUids(goingSet)
    setAddMembersSearch('')
    setAddMembersError(null)
    setShowAddMembersPanel(true)
  }

  async function addSelectedMembers() {
    if (!user || !training || addingMembers) return
    setAddingMembers(true)
    try {
      const existingGoingUids = new Set(
        Object.entries(training.rsvps ?? {}).filter(([, s]) => s === 'GOING').map(([uid]) => uid)
      )
      const newUids = Array.from(selectedMemberUids).filter(uid => !existingGoingUids.has(uid))
      if (newUids.length === 0) {
        setShowAddMembersPanel(false)
        return
      }

      const rsvpUpdate: Record<string, unknown> = {}
      for (const uid of newUids) {
        const m = members.find(mem => mem.userId === uid)
        rsvpUpdate[`rsvps.${uid}`] = 'GOING'
        if (m?.displayName) rsvpUpdate[`rsvpNames.${uid}`] = m.displayName
        if (m?.photoUrl) rsvpUpdate[`rsvpPhotos.${uid}`] = m.photoUrl
      }

      const trainingRef = doc(db, 'communities', communityId, 'trainings', trainingId)

      if (training.isClosed) {
        if (isSuperAdmin) {
          await updateDoc(trainingRef, { ...rsvpUpdate, attendedBy: arrayUnion(...newUids) })
        } else {
          await updateDoc(trainingRef, rsvpUpdate)
          await updateDoc(trainingRef, { attendedBy: arrayUnion(...newUids) })
        }
        await Promise.allSettled(
          newUids.map(uid => awardTrainingAttendancePoints(uid, communityId))
        )
        await Promise.allSettled(
          newUids.map(uid => updateDoc(doc(db, 'users', uid), { totalTrainings: increment(1) }))
        )
      } else {
        await updateDoc(trainingRef, rsvpUpdate)
      }

      setAddMembersResult({ added: newUids.length })
      setShowAddMembersPanel(false)
    } catch (e) {
      console.error('Failed to add members:', e)
      setAddMembersError('Nu s-au putut adăuga membrii. Verifică permisiunile.')
    } finally {
      setAddingMembers(false)
    }
  }

  async function memberRsvp(status: 'GOING' | 'NOT_GOING' | 'MAYBE') {
    if (!user || !training || training.isClosed) return
    const wasGoing = training.rsvps?.[user.uid] === 'GOING'
    const storedName = members.find(m => m.userId === user.uid)?.displayName || myDisplayName
    const storedPhoto = members.find(m => m.userId === user.uid)?.photoUrl || myPhotoUrl || null
    const nameUpdate = status === 'GOING'
      ? { [`rsvpNames.${user.uid}`]: storedName }
      : { [`rsvpNames.${user.uid}`]: deleteField() }
    const photoUpdate = status === 'GOING' && storedPhoto
      ? { [`rsvpPhotos.${user.uid}`]: storedPhoto }
      : { [`rsvpPhotos.${user.uid}`]: deleteField() }
    await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
      [`rsvps.${user.uid}`]: status,
      ...nameUpdate,
      ...photoUpdate,
    })
    if (status === 'GOING' && !wasGoing && user.uid !== training.authorId) {
      const now = Date.now()
      const lastAt = training.lastRsvpNotifAt?.toDate?.()?.getTime() ?? 0
      if (now - lastAt >= 60 * 60 * 1000) {
        await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
          lastRsvpNotifAt: serverTimestamp(),
        })
        await createNotification(
          training.authorId,
          'TRAINING_RSVP',
          'Cineva participă la antrenamentul tău! 💪',
          `${storedName} a confirmat că merge la „${training.name}".`,
          trainingId,
          user.uid,
        )
      }
    }
  }

  async function removeUserFromTraining(uid: string) {
    if (!isSuperAdmin || !training) return
    try {
      const update: Record<string, unknown> = {
        [`rsvps.${uid}`]: deleteField(),
        [`rsvpNames.${uid}`]: deleteField(),
        [`rsvpPhotos.${uid}`]: deleteField(),
      }
      await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), update)
    } catch (e) {
      console.error('Failed to remove user:', e)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!training) return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6 text-center" style={{ backgroundColor: 'var(--app-bg)' }}>
      <p className="text-4xl mb-4">🏚️</p>
      <p className="text-base font-bold text-white mb-2">Antrenament negăsit</p>
      <p className="text-sm text-white/50 mb-6">Acest antrenament nu mai există sau a expirat.</p>
      <button onClick={() => router.replace('/community')}
        className="h-11 px-6 rounded-2xl bg-brand-green text-black text-sm font-bold">
        Explorează comunități
      </button>
    </div>
  )

  const goingUids = Object.entries(training.rsvps ?? {}).filter(([, s]) => s === 'GOING').map(([uid]) => uid)
  const maybeUids = Object.entries(training.rsvps ?? {}).filter(([, s]) => s === 'MAYBE').map(([uid]) => uid)
  const guestGoing = Object.entries(training.guestRsvps ?? {}).filter(([, g]) => g.status === 'GOING')
  const totalGoing = goingUids.length + guestGoing.length

  const myMemberStatus = user ? training.rsvps?.[user.uid] : undefined
  const isAuthor = user?.uid === training.authorId
  const myMember = members.find(m => m.userId === user?.uid)
  const isStaff = myMember && ['ADMIN', 'MODERATOR', 'TRAINER'].includes(myMember.role)
  const canManageTraining = isAuthor || !!isStaff
  const trainingIsPast = isPast(training)
  const canAddMembers = isSuperAdmin || (myMember?.role === 'ADMIN' && (trainingIsPast || !!training.isClosed))

  const officialStyle = training.official ? {
    background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.08) 0%, var(--app-surface) 100%)',
    borderColor: 'rgba(var(--accent-rgb), 0.25)',
  } : {}

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 py-4">

        {/* Community link */}
        {community && (
          <Link href={`/community/${communityId}`}>
            <div className="flex items-center gap-2 mb-4 text-brand-green/80 hover:text-brand-green transition-colors">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)' }}>
                <span className="text-[10px] font-black text-brand-green">{community.name.charAt(0)}</span>
              </div>
              <span className="text-sm font-semibold truncate">{community.name}</span>
              {community.verified && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.145)', color: 'var(--accent)' }}>✓</span>
              )}
            </div>
          </Link>
        )}

        {/* Training card */}
        <div
          className="rounded-3xl p-5 mb-4 border"
          style={training.official ? { ...officialStyle, borderColor: 'rgba(var(--accent-rgb), 0.25)' } : { backgroundColor: 'var(--app-surface)', borderColor: 'transparent' }}
        >
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {training.official && (
              <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest"
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.25)' }}>
                ⭐ OFICIAL
              </span>
            )}
            {training.isClosed && (
              <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest"
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.25)' }}>
                ✓ FINALIZAT
              </span>
            )}
          </div>

          <h1 className="text-xl font-black text-white mb-1">{training.name}</h1>
          {training.authorName && (
            <p className="text-xs text-white/40 mb-4">de {training.authorName}</p>
          )}

          {/* Meta */}
          <div className="flex flex-col gap-2 mb-4">
            {(training.timeStart || training.date) && (
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Calendar size={14} className="text-brand-green flex-shrink-0" />
                <span>{formatDate(training.timeStart, training.date)}</span>
              </div>
            )}
            {(training.timeStart || training.timeEnd) && (
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Clock size={14} className="text-brand-green flex-shrink-0" />
                <span>
                  {training.timeStart?.slice(-5)}
                  {training.timeEnd ? ` – ${training.timeEnd.slice(-5)}` : ''}
                </span>
              </div>
            )}
            {training.location && (
              <div className="flex items-center gap-2 text-sm text-white/70">
                <MapPin size={14} className="text-brand-green flex-shrink-0" />
                <span>{training.location}</span>
              </div>
            )}
          </div>

          {training.description && (
            <p className="text-sm text-white/60 leading-relaxed mb-4">{training.description}</p>
          )}

          {/* Exercises */}
          {(training.exercises?.length ?? 0) > 0 && (
            <div className="p-3 rounded-2xl mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Dumbbell size={12} className="text-brand-green" />
                <p className="text-[10px] font-bold text-white/40 tracking-widest">EXERCIȚII</p>
              </div>
              <div className="flex flex-col gap-2">
                {training.exercises.map((ex, i) => (
                  <ExerciseCard
                    key={i}
                    index={i + 1}
                    name={ex.name}
                    sets={ex.sets}
                    repsPerSet={ex.repsPerSet}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Equipment */}
          {(training.equipment?.length ?? 0) > 0 && (
            <div className="p-3 rounded-2xl mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">ECHIPAMENT</p>
              <div className="flex flex-wrap gap-2">
                {training.equipment!.map(eq => (
                  <span key={eq} className="text-sm text-white/70 bg-white/8 rounded-xl px-3 py-1">
                    {eq === 'rings' ? '🪢 Inele' : eq === 'elastic_bands' ? '🔁 Benzi elastice' : eq === 'parallels' ? '⚙️ Paralele' : eq === 'jump_rope' ? '🪝 Coardă de sărit' : eq}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Attendees summary */}
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Users size={14} className="text-brand-green flex-shrink-0" />
            {totalGoing > 0
              ? <span><span className="text-brand-green font-bold">{totalGoing}</span> {totalGoing === 1 ? 'persoană merge' : 'persoane merg'}</span>
              : <span>Nimeni nu a confirmat încă</span>}
            {maybeUids.length > 0 && (
              <span className="text-white/30">· {maybeUids.length} poate</span>
            )}
          </div>
        </div>

        {/* Training photos */}
        {user && training && (
          <TrainingPhotoCard
            training={training}
            communityId={communityId}
            myUid={user.uid}
            myName={myDisplayName ?? user.displayName ?? 'Utilizator'}
            myPhoto={myPhotoUrl ?? null}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {/* Attendees list */}
        {(goingUids.length > 0 || guestGoing.length > 0) && (
          <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-3">PARTICIPANȚI ({totalGoing})</p>
            <div className="flex flex-col gap-2">
              {goingUids.map(uid => {
                const isMe = user?.uid === uid
                const m = members.find(mem => mem.userId === uid)
                const name = training.rsvpNames?.[uid]
                  ?? (uid === training.authorId ? training.authorName : undefined)
                  ?? (isMe ? myDisplayName : undefined)
                  ?? m?.displayName
                  ?? profiles[uid]?.name
                  ?? 'Participant'
                const photo = profiles[uid]?.photoUrl || (isMe ? myPhotoUrl || null : null) || training.rsvpPhotos?.[uid] || m?.photoUrl || null
                return (
                  <div key={uid} className="flex items-center gap-2.5">
                    <MemberAvatar photoUrl={photo} name={name} size={32} />
                    <span className="text-sm font-semibold text-white/80 flex-1">{name}</span>
                    {isMe && <span className="text-[10px] text-brand-green">Tu</span>}
                    {isSuperAdmin && !isMe && (
                      <button
                        onClick={() => removeUserFromTraining(uid)}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors"
                        aria-label="Elimină participantul"
                      >
                        <Trash2 size={13} className="text-red-400/60" />
                      </button>
                    )}
                  </div>
                )
              })}
              {guestGoing.map(([gid, g]) => {
                const displayName = g.name.length > 15 ? g.name.slice(0, 15) + '…' : g.name
                return (
                  <div key={gid} className="flex items-center gap-2.5">
                    <GuestAvatar size={32} />
                    <span className="text-sm font-semibold text-white/70 flex-1">{displayName}</span>
                    <span className="text-[10px] text-white/30 flex items-center gap-1">
                      <User size={9} /> invitat
                    </span>
                    {isSuperAdmin && (
                      <button
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
                              [`guestRsvps.${gid}`]: deleteField(),
                            })
                          } catch (e) { console.error(e) }
                        }}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors"
                        aria-label="Elimină invitatul"
                      >
                        <Trash2 size={13} className="text-red-400/60" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Confirmed attendance (closed training) */}
        {training.isClosed && (training.attendedBy?.length ?? 0) > 0 && (
          <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-3">
              AU PARTICIPAT ({training.attendedBy!.length})
            </p>
            <div className="flex flex-col gap-2">
              {training.attendedBy!.map(uid => {
                const isMe = user?.uid === uid
                const m = members.find(mem => mem.userId === uid)
                const name = training.rsvpNames?.[uid] ?? m?.displayName ?? profiles[uid]?.name ?? 'Participant'
                const photo = profiles[uid]?.photoUrl || (isMe ? myPhotoUrl || null : null) || training.rsvpPhotos?.[uid] || m?.photoUrl || null
                return (
                  <div key={uid} className="flex items-center gap-2.5">
                    <MemberAvatar photoUrl={photo} name={name} size={32} />
                    <span className="text-sm font-semibold text-white/80 flex-1">{name}</span>
                    {isMe && <span className="text-[10px] text-brand-green">Tu</span>}
                    {isSuperAdmin && !isMe && (
                      <button
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
                              attendedBy: training.attendedBy!.filter(id => id !== uid),
                              [`rsvps.${uid}`]: deleteField(),
                              [`rsvpNames.${uid}`]: deleteField(),
                              [`rsvpPhotos.${uid}`]: deleteField(),
                            })
                          } catch (e) { console.error(e) }
                        }}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors"
                        aria-label="Elimină participantul"
                      >
                        <Trash2 size={13} className="text-red-400/60" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Close result toast */}
        {closeResult && (
          <div className="rounded-2xl p-4 mb-4 flex items-center gap-3"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid rgba(var(--accent-rgb), 0.19)' }}>
            <Check size={18} className="text-brand-green flex-shrink-0" />
            <p className="text-sm font-semibold text-white">
              Antrenament finalizat! {closeResult.awarded > 0
                ? `${closeResult.awarded} participanți înregistrați.`
                : 'Participanții au fost înregistrați.'}
            </p>
          </div>
        )}

        {/* Add members result toast */}
        {addMembersResult && (
          <div className="rounded-2xl p-4 mb-4 flex items-center gap-3"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid rgba(var(--accent-rgb), 0.19)' }}>
            <UserPlus size={18} className="text-brand-green flex-shrink-0" />
            <p className="text-sm font-semibold text-white">
              {addMembersResult.added} {addMembersResult.added === 1 ? 'membru adăugat' : 'membri adăugați'} cu succes!
            </p>
          </div>
        )}

        {/* Add members error toast */}
        {addMembersError && (
          <div className="rounded-2xl p-4 mb-4 flex items-center gap-3"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.19)' }}>
            <X size={18} className="text-red-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-white">{addMembersError}</p>
          </div>
        )}

        {/* RSVP section */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          {training.isClosed ? (
            <p className="text-sm text-white/40 text-center py-1">Antrenament finalizat — înregistrarea participanților este închisă.</p>
          ) : (
          <>
          <p className="text-sm font-black text-white mb-3">Participi?</p>

          {/* Authenticated member RSVP */}
          {user && isMember && (
            <div className="flex gap-2">
              {(['GOING', 'MAYBE', 'NOT_GOING'] as const).map(status => (
                <button key={status}
                  onClick={() => memberRsvp(status)}
                  className={`flex-1 h-10 rounded-xl text-sm font-bold transition-colors border ${
                    myMemberStatus === status
                      ? 'bg-brand-green text-black border-brand-green'
                      : 'border-white/15 text-white/60 hover:bg-white/8'
                  }`}>
                  {status === 'GOING' ? 'Merg' : status === 'MAYBE' ? 'Poate' : 'Nu merg'}
                </button>
              ))}
            </div>
          )}

          {/* Guest RSVP (not logged in, or logged in but not a member) */}
          {(!user || !isMember) && (
            <div>
              {guestConfirmed ? (
                <div>
                  <div className="flex items-center gap-3 p-3 rounded-xl mb-3"
                    style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid rgba(var(--accent-rgb), 0.19)' }}>
                    <div className="w-8 h-8 rounded-full bg-brand-green/20 flex items-center justify-center flex-shrink-0">
                      <Check size={16} className="text-brand-green" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">Participi ca invitat!</p>
                      <p className="text-xs text-white/50">Înregistrat ca: {guestName}</p>
                    </div>
                  </div>
                  <button
                    onClick={cancelGuestRsvp}
                    disabled={savingGuest}
                    className="w-full h-9 rounded-xl border border-white/15 text-sm text-white/50 hover:text-white/70 transition-colors disabled:opacity-40"
                  >
                    {savingGuest ? '...' : 'Anulează participarea'}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-white/45 mb-3">
                    Nu ai un cont? Participă ca invitat cu numele tău.
                  </p>
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      value={guestInput}
                      onChange={e => setGuestInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && confirmGuestRsvp()}
                      placeholder="Numele tău *"
                      maxLength={15}
                      className="flex-1 h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
                    />
                    <button
                      onClick={confirmGuestRsvp}
                      disabled={savingGuest || !guestInput.trim()}
                      className="h-11 px-4 rounded-xl bg-brand-green text-black text-sm font-black flex items-center gap-1.5 disabled:opacity-40 flex-shrink-0"
                    >
                      <Check size={14} />
                      {savingGuest ? '...' : 'Merg'}
                    </button>
                  </div>
                  {guestInput.length >= 12 && (
                    <p className="text-[10px] text-white/30 text-right mt-1 mb-2">{guestInput.length}/15</p>
                  )}
                  <p className="text-[11px] text-white/30 text-center mt-3">sau</p>
                  <div className="flex gap-2 mt-3">
                    <Link href="/login" className="flex-1">
                      <span className="flex items-center justify-center h-10 rounded-xl border border-white/15 text-sm text-white/60 font-semibold">
                        Intru în cont
                      </span>
                    </Link>
                    <Link href="/register" className="flex-1">
                      <span className="flex items-center justify-center h-10 rounded-xl bg-brand-green text-black text-sm font-black">
                        Creează cont
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Authenticated user who is not yet a member */}
          {user && !isMember && (
            <div className="mt-3 pt-3 border-t border-white/8">
              <p className="text-xs text-white/40 mb-2">Intră în comunitate pentru a confirma ca membru.</p>
              <Link href={`/community/${communityId}`}>
                <span className="flex items-center justify-center h-10 rounded-xl bg-brand-green/15 text-brand-green text-sm font-bold border border-brand-green/30 hover:bg-brand-green/20 transition-colors">
                  Alătură-te comunității
                </span>
              </Link>
            </div>
          )}
          </>
          )}
        </div>

        {/* Edit panel (author only) */}
        {isAuthor && editing && (
          <div className="rounded-2xl p-4 mt-4 border border-brand-green/20" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-sm font-black text-white mb-3">Editează antrenamentul</p>

            <div className="mb-3">
              <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">NUME</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                maxLength={120}
                className="w-full h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
              />
            </div>

            <div className="mb-3">
              <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">DESCRIERE</label>
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                maxLength={1000}
                rows={3}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors resize-none"
              />
            </div>

            <div className="mb-3">
              <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">DATA</label>
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="w-full h-11 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
              />
            </div>

            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">ORA START</label>
                <input
                  type="time"
                  value={editTimeStart}
                  onChange={e => setEditTimeStart(e.target.value)}
                  className="w-full h-11 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">ORA FINAL</label>
                <input
                  type="time"
                  value={editTimeEnd}
                  onChange={e => setEditTimeEnd(e.target.value)}
                  className="w-full h-11 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditing(false)}
                className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60 font-semibold hover:bg-white/8 transition-colors">
                Anulează
              </button>
              <button onClick={saveEdit} disabled={saving || !editName.trim() || !editDate || !editTimeStart}
                className="flex-1 h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
                {saving ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </div>
        )}

        {/* Edit button (author only) */}
        {isAuthor && !editing && !training.isClosed && (
          <button
            onClick={openEdit}
            className="mt-4 w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-brand-green/30 text-brand-green text-sm font-bold hover:bg-brand-green/10 transition-colors"
          >
            <Pencil size={15} />
            Editează antrenamentul
          </button>
        )}

        {/* Close Training button (staff/author, past trainings only) */}
        {canManageTraining && !training.isClosed && isPast(training) && (
          <button
            onClick={openClosePanel}
            className="mt-4 w-full flex items-center justify-center gap-2 h-11 rounded-2xl border text-sm font-bold transition-colors"
            style={{ borderColor: 'rgba(var(--accent-rgb), 0.25)', color: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.06)' }}
          >
            <Check size={15} />
            Închide antrenamentul
          </button>
        )}

        {/* Add Members button */}
        {canAddMembers && (
          <button
            onClick={openAddMembersPanel}
            className="mt-4 w-full flex items-center justify-center gap-2 h-11 rounded-2xl border text-sm font-bold transition-colors"
            style={{ borderColor: 'rgba(var(--accent-rgb), 0.25)', color: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.06)' }}
          >
            <UserPlus size={15} />
            Adaugă membri
          </button>
        )}

        {/* Close Training panel */}
        {showClosePanel && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-lg mx-auto rounded-t-3xl p-5 pb-8"
              style={{ backgroundColor: 'var(--app-surface)', maxHeight: '80vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-base font-black text-white">Închide antrenamentul</p>
                <button onClick={() => setShowClosePanel(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <X size={16} className="text-white/60" />
                </button>
              </div>
              <p className="text-xs text-white/45 mb-4">Selectează persoanele care au participat efectiv.</p>

              <div className="flex flex-col gap-2 mb-5">
                {goingUids.map(uid => {
                  const m = members.find(mem => mem.userId === uid)
                  const name = training.rsvpNames?.[uid] ?? m?.displayName ?? profiles[uid]?.name ?? 'Participant'
                  const photo = training.rsvpPhotos?.[uid] || m?.photoUrl || profiles[uid]?.photoUrl || null
                  const checked = attendedUids.has(uid)
                  return (
                    <button key={uid}
                      onClick={() => setAttendedUids(prev => {
                        const next = new Set(prev)
                        if (next.has(uid)) next.delete(uid)
                        else next.add(uid)
                        return next
                      })}
                      className="flex items-center gap-3 p-3 rounded-2xl transition-colors text-left"
                      style={{
                        backgroundColor: checked ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(255,255,255,0.05)',
                        border: checked ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid rgba(255,255,255,0.08)',
                      }}>
                      <MemberAvatar photoUrl={photo} name={name} size={36} />
                      <span className="flex-1 text-sm font-semibold text-white/80">{name}</span>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: checked ? 'var(--accent)' : 'rgba(255,255,255,0.12)' }}>
                        {checked && <Check size={11} className="text-black" strokeWidth={3} />}
                      </div>
                    </button>
                  )
                })}
                {goingUids.length === 0 && (
                  <p className="text-sm text-white/40 text-center py-4">Niciun participant GOING înregistrat.</p>
                )}
              </div>

              <button
                onClick={closeTraining}
                disabled={closing || attendedUids.size === 0}
                className="w-full h-12 rounded-2xl text-sm font-black disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
              >
                {closing ? 'Se procesează...' : `Confirmă și închide (${attendedUids.size} participanți)`}
              </button>
            </div>
          </div>
        )}

        {/* Add Members panel */}
        {showAddMembersPanel && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-lg mx-auto rounded-t-3xl p-5 pb-8"
              style={{ backgroundColor: 'var(--app-surface)', maxHeight: '80vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-base font-black text-white">Adaugă membri</p>
                <button onClick={() => setShowAddMembersPanel(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <X size={16} className="text-white/60" />
                </button>
              </div>
              <p className="text-xs text-white/45 mb-4">
                {training.isClosed
                  ? 'Selectează membri care au participat — li se vor acorda puncte.'
                  : 'Selectează membri care vor participa la antrenament.'}
              </p>

              {/* Search */}
              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={addMembersSearch}
                  onChange={e => setAddMembersSearch(e.target.value)}
                  placeholder="Caută membru..."
                  className="w-full h-11 rounded-xl pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
                />
              </div>

              {/* Member list */}
              <div className="flex flex-col gap-2 mb-5">
                {[...members]
                  .sort((a, b) => (b.trainingPoints ?? 0) - (a.trainingPoints ?? 0))
                  .filter(m => m.displayName.toLowerCase().includes(addMembersSearch.toLowerCase()))
                  .map(m => {
                    const checked = selectedMemberUids.has(m.userId)
                    const alreadyGoing = training.rsvps?.[m.userId] === 'GOING'
                    return (
                      <button key={m.userId}
                        onClick={() => setSelectedMemberUids(prev => {
                          const next = new Set(prev)
                          if (next.has(m.userId)) next.delete(m.userId)
                          else next.add(m.userId)
                          return next
                        })}
                        className="flex items-center gap-3 p-3 rounded-2xl transition-colors text-left"
                        style={{
                          backgroundColor: checked ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(255,255,255,0.05)',
                          border: checked ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid rgba(255,255,255,0.08)',
                        }}>
                        <MemberAvatar photoUrl={m.photoUrl} name={m.displayName} size={36} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-white/80 block truncate">{m.displayName}</span>
                          {alreadyGoing && <span className="text-[10px] text-brand-green">deja înscris</span>}
                        </div>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: checked ? 'var(--accent)' : 'rgba(255,255,255,0.12)' }}>
                          {checked && <Check size={11} className="text-black" strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                {members.length > 0 && members.filter(m => m.displayName.toLowerCase().includes(addMembersSearch.toLowerCase())).length === 0 && (
                  <p className="text-sm text-white/40 text-center py-4">Niciun membru găsit.</p>
                )}
              </div>

              <button
                onClick={addSelectedMembers}
                disabled={addingMembers || selectedMemberUids.size === 0}
                className="w-full h-12 rounded-2xl text-sm font-black disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
              >
                {addingMembers
                  ? 'Se procesează...'
                  : `Adaugă (${Math.max(0, selectedMemberUids.size - goingUids.length)} noi)`}
              </button>
            </div>
          </div>
        )}

        {/* Back to Home */}
        <Link href="/home" className="mt-4 block">
          <span className="flex items-center justify-center w-full h-11 rounded-2xl bg-white/8 text-white/60 text-sm font-semibold hover:bg-white/12 transition-colors">
            Înapoi acasă
          </span>
        </Link>

      </div>
    </div>
  )
}
