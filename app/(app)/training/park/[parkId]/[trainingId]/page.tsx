'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  doc, onSnapshot, updateDoc, deleteField, getDoc, serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { createNotification } from '@/lib/firebase/notifications'
import type { PlannedTraining } from '@/types'
import {
  Calendar, Clock, MapPin, Dumbbell, Users, User, Check, Trash2, Pencil,
} from 'lucide-react'
import Link from 'next/link'

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDateTime(str: string): Date | null {
  if (!str) return null
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}`)
  }
  try { return new Date(str) } catch { return null }
}

function formatDate(timeStart: string): string {
  const d = parseDateTime(timeStart)
  if (!d || isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ro', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Avatars ───────────────────────────────────────────────────────────────────

function MemberAvatar({ photoUrl, name, size = 32 }: { photoUrl?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: '#1ED75F22', border: '2px solid #1ED75F44' }}
    >
      {photoUrl && !imgError
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photoUrl} alt={name} width={size} height={size} className="object-cover w-full h-full" onError={() => setImgError(true)} />
        : <span className="font-bold text-brand-green" style={{ fontSize: size * 0.38 }}>{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}

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

// ── Anti-spam: 1-hour cooldown per training ───────────────────────────────────

async function maybeNotifyAuthor(
  training: PlannedTraining,
  parkId: string,
  joinerName: string,
  authorUid: string,
) {
  const now = Date.now()
  const lastAt = training.lastRsvpNotifAt?.toDate?.()?.getTime() ?? 0
  const ONE_HOUR = 60 * 60 * 1000
  if (now - lastAt < ONE_HOUR) return          // cooldown active — skip
  await updateDoc(doc(db, 'parks', parkId, 'trainings', training.id), {
    lastRsvpNotifAt: serverTimestamp(),
  })
  await createNotification(
    authorUid,
    'TRAINING_RSVP',
    'Cineva participă la antrenamentul tău! 💪',
    `${joinerName} a confirmat că merge la „${training.name}".`,
    training.id,
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StandaloneParkTrainingPage() {
  const { user } = useAuth()
  const { displayName: myDisplayName, photoUrl: myPhotoUrl } = useMyProfile()
  const router = useRouter()
  const params = useParams()
  const parkId = params.parkId as string
  const trainingId = params.trainingId as string

  const [training, setTraining] = useState<PlannedTraining | null>(null)
  const [parkName, setParkName] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const isSuperAdmin = user?.email === (process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? '')
  const [profiles, setProfiles] = useState<Record<string, { name: string; photoUrl: string | null }>>({})

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTimeStart, setEditTimeStart] = useState('')
  const [editTimeEnd, setEditTimeEnd] = useState('')
  const [saving, setSaving] = useState(false)

  // Guest state
  const [guestId, setGuestId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestInput, setGuestInput] = useState('')
  const [savingGuest, setSavingGuest] = useState(false)
  const [guestConfirmed, setGuestConfirmed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Init guest ID
  useEffect(() => {
    if (typeof window === 'undefined') return
    let id = localStorage.getItem('calipal_guest_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('calipal_guest_id', id)
    }
    setGuestId(id)
  }, [])

  // Load park name
  useEffect(() => {
    getDoc(doc(db, 'parks', parkId)).then(snap => {
      if (snap.exists()) setParkName(snap.data().name ?? '')
    })
  }, [parkId])

  // Real-time training
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'parks', parkId, 'trainings', trainingId),
      snap => {
        if (snap.exists() && !snap.data().deletedAt) setTraining({ id: snap.id, ...snap.data() } as PlannedTraining)
        else setTraining(null)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [parkId, trainingId])

  // Sync guest RSVP
  useEffect(() => {
    if (!training || !guestId) return
    const g = training.guestRsvps?.[guestId]
    if (g) { setGuestConfirmed(true); setGuestName(g.name) }
    else { setGuestConfirmed(false) }
  }, [training, guestId])

  // Fetch profiles for attendees without rsvpNames (old RSVPs) — auth-only, silent fail
  useEffect(() => {
    if (!training || !user) return
    const goingUids = Object.entries(training.rsvps ?? {})
      .filter(([, s]) => s === 'GOING')
      .map(([uid]) => uid)
    const uidsToFetch = goingUids.filter(uid =>
      (!training.rsvpNames?.[uid] || !training.rsvpPhotos?.[uid]) && uid !== training.authorId
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
      // Patch rsvpNames/rsvpPhotos so non-auth users can see participant names and photos
      const patch: Record<string, string> = {}
      results.forEach(r => {
        if (r.name && !training.rsvpNames?.[r.uid]) patch[`rsvpNames.${r.uid}`] = r.name
        if (r.photoUrl && !training.rsvpPhotos?.[r.uid]) patch[`rsvpPhotos.${r.uid}`] = r.photoUrl
      })
      if (Object.keys(patch).length) {
        updateDoc(doc(db, 'parks', parkId, 'trainings', trainingId), patch).catch(() => {})
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training?.id, training?.rsvpNames, user?.uid])

  async function memberRsvp(status: 'GOING' | 'NOT_GOING' | 'MAYBE') {
    if (!user || !training) return
    const wasGoing = training.rsvps?.[user.uid] === 'GOING'
    const nameUpdate = status === 'GOING'
      ? { [`rsvpNames.${user.uid}`]: myDisplayName }
      : { [`rsvpNames.${user.uid}`]: deleteField() }
    const photoUpdate = status === 'GOING' && myPhotoUrl
      ? { [`rsvpPhotos.${user.uid}`]: myPhotoUrl }
      : { [`rsvpPhotos.${user.uid}`]: deleteField() }
    await updateDoc(doc(db, 'parks', parkId, 'trainings', trainingId), {
      [`rsvps.${user.uid}`]: status,
      ...nameUpdate,
      ...photoUpdate,
    })
    if (status === 'GOING' && !wasGoing && user.uid !== training.authorId) {
      await maybeNotifyAuthor(training, parkId, myDisplayName, training.authorId)
    }
  }

  async function confirmGuestRsvp() {
    const name = guestInput.trim()
    if (!name || !guestId || savingGuest || !training) return
    setSavingGuest(true)
    try {
      await updateDoc(doc(db, 'parks', parkId, 'trainings', trainingId), {
        [`guestRsvps.${guestId}`]: { name, status: 'GOING' },
      })
      await maybeNotifyAuthor(training, parkId, name, training.authorId)
      setGuestName(name)
      setGuestConfirmed(true)
      setGuestInput('')
    } catch (e) { console.error(e) }
    finally { setSavingGuest(false) }
  }

  async function cancelGuestRsvp() {
    if (!guestId || savingGuest) return
    setSavingGuest(true)
    try {
      await updateDoc(doc(db, 'parks', parkId, 'trainings', trainingId), {
        [`guestRsvps.${guestId}`]: deleteField(),
      })
      setGuestConfirmed(false)
      setGuestName('')
    } catch (e) { console.error(e) }
    finally { setSavingGuest(false) }
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
      await updateDoc(doc(db, 'parks', parkId, 'trainings', trainingId), {
        name: editName.trim(),
        description: editDesc.trim(),
        timeStart: newTimeStart,
        ...(newTimeEnd ? { timeEnd: newTimeEnd } : {}),
      })
      setEditing(false)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function deleteTraining() {
    if (!training || deleting) return
    if (!window.confirm('Ești sigur că vrei să ștergi acest antrenament?')) return
    setDeleting(true)
    try {
      await updateDoc(doc(db, 'parks', parkId, 'trainings', trainingId), {
        deletedAt: serverTimestamp(), deletedByUid: user?.uid,
      })
      const d = parseDateTime(training.timeStart)
      if (!d || d >= new Date()) {
        await updateDoc(doc(db, 'parks', parkId), { upcomingTrainingCount: increment(-1) })
      }
      router.replace('/map')
    } catch (e) { console.error(e); setDeleting(false) }
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
      <button onClick={() => router.replace('/map')}
        className="h-11 px-6 rounded-2xl bg-brand-green text-black text-sm font-bold">
        Înapoi la hartă
      </button>
    </div>
  )

  const goingUids = Object.entries(training.rsvps ?? {}).filter(([, s]) => s === 'GOING').map(([uid]) => uid)
  const maybeUids = Object.entries(training.rsvps ?? {}).filter(([, s]) => s === 'MAYBE').map(([uid]) => uid)
  const guestGoing = Object.entries(training.guestRsvps ?? {}).filter(([, g]) => g.status === 'GOING')
  const totalGoing = goingUids.length + guestGoing.length
  const myStatus = user ? training.rsvps?.[user.uid] : undefined
  const isAuthor = user?.uid === training.authorId

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 py-4">

        {/* Park link */}
        {parkName && (
          <Link href="/map">
            <div className="flex items-center gap-2 mb-4 text-brand-green/80 hover:text-brand-green transition-colors">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1ED75F22' }}>
                <MapPin size={12} className="text-brand-green" />
              </div>
              <span className="text-sm font-semibold truncate">{parkName}</span>
            </div>
          </Link>
        )}

        {/* Training card */}
        <div className="rounded-3xl p-5 mb-4 border"
          style={{ backgroundColor: 'var(--app-surface)', borderColor: 'transparent' }}>

          <h1 className="text-xl font-black text-white mb-1">{training.name}</h1>
          {training.authorName && (
            <p className="text-xs text-white/40 mb-4">de {training.authorName}</p>
          )}

          <div className="flex flex-col gap-2 mb-4">
            {training.timeStart && (
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Calendar size={14} className="text-brand-green flex-shrink-0" />
                <span>{formatDate(training.timeStart)}</span>
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

          {(training.exercises?.length ?? 0) > 0 && (
            <div className="p-3 rounded-2xl mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Dumbbell size={12} className="text-brand-green" />
                <p className="text-[10px] font-bold text-white/40 tracking-widest">EXERCIȚII</p>
              </div>
              <div className="flex flex-col gap-1.5">
                {training.exercises.map((ex, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white/80">{ex.name}</span>
                    <span className="text-xs text-white/40">{ex.sets} × {ex.repsPerSet}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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

        {/* Attendees list */}
        {(goingUids.length > 0 || guestGoing.length > 0) && (
          <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-3">PARTICIPANȚI ({totalGoing})</p>
            <div className="flex flex-col gap-2">
              {goingUids.map(uid => {
                const isMe = user?.uid === uid
                const profile = profiles[uid]
                const name = training.rsvpNames?.[uid]
                  ?? (uid === training.authorId ? training.authorName : undefined)
                  ?? (isMe ? myDisplayName : undefined)
                  ?? profile?.name
                  ?? 'Participant'
                const photoUrl = profile?.photoUrl || (isMe ? myPhotoUrl || null : null) || training.rsvpPhotos?.[uid] || null
                return (
                  <div key={uid} className="flex items-center gap-2.5">
                    <MemberAvatar photoUrl={photoUrl} name={name} size={32} />
                    <span className="text-sm font-semibold text-white/80 flex-1">{name}</span>
                    {isMe && <span className="text-[10px] text-brand-green">Tu</span>}
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
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* RSVP section */}
        <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <p className="text-sm font-black text-white mb-3">Participi?</p>

          {/* Authenticated user RSVP (any logged-in user can join standalone trainings) */}
          {user && (
            <div className="flex gap-2">
              {(['GOING', 'MAYBE', 'NOT_GOING'] as const).map(status => (
                <button key={status}
                  onClick={() => memberRsvp(status)}
                  className={`flex-1 h-10 rounded-xl text-sm font-bold transition-colors border ${
                    myStatus === status
                      ? 'bg-brand-green text-black border-brand-green'
                      : 'border-white/15 text-white/60 hover:bg-white/8'
                  }`}>
                  {status === 'GOING' ? 'Merg' : status === 'MAYBE' ? 'Poate' : 'Nu merg'}
                </button>
              ))}
            </div>
          )}

          {/* Guest RSVP (not logged in) */}
          {!user && (
            <div>
              {guestConfirmed ? (
                <div>
                  <div className="flex items-center gap-3 p-3 rounded-xl mb-3"
                    style={{ backgroundColor: '#1ED75F15', border: '1px solid #1ED75F30' }}>
                    <div className="w-8 h-8 rounded-full bg-brand-green/20 flex items-center justify-center flex-shrink-0">
                      <Check size={16} className="text-brand-green" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">Participi ca invitat!</p>
                      <p className="text-xs text-white/50">Înregistrat ca: {guestName}</p>
                    </div>
                  </div>
                  <button onClick={cancelGuestRsvp} disabled={savingGuest}
                    className="w-full h-9 rounded-xl border border-white/15 text-sm text-white/50 hover:text-white/70 transition-colors disabled:opacity-40">
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
                    <button onClick={confirmGuestRsvp} disabled={savingGuest || !guestInput.trim()}
                      className="h-11 px-4 rounded-xl bg-brand-green text-black text-sm font-black flex items-center gap-1.5 disabled:opacity-40 flex-shrink-0">
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
        </div>

        {/* Edit panel (author only) */}
        {isAuthor && editing && (
          <div className="rounded-2xl p-4 mb-4 border border-brand-green/20" style={{ backgroundColor: 'var(--app-surface)' }}>
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

        {/* Edit button (author only) + Delete button (superadmin only) */}
        {(isAuthor || isSuperAdmin) && !editing && (
          <div className="flex gap-2 mb-4">
            {isAuthor && (
              <button
                onClick={openEdit}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl border border-brand-green/30 text-brand-green text-sm font-bold hover:bg-brand-green/10 transition-colors"
              >
                <Pencil size={15} />
                Editează
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={deleteTraining}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/10 transition-colors disabled:opacity-40"
              >
                <Trash2 size={15} />
                {deleting ? 'Se șterge...' : 'Șterge'}
              </button>
            )}
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
