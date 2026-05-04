'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  doc, getDoc, onSnapshot, updateDoc, deleteField, getDocs, collection,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { PlannedTraining, CommunityDoc, CommunityMember } from '@/types'
import {
  ArrowLeft, Calendar, Clock, MapPin, Dumbbell, Users, User, Check,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

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
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: '#1ED75F22', border: '2px solid #1ED75F44' }}
    >
      {photoUrl
        ? <Image src={photoUrl} alt={name} width={size} height={size} className="object-cover" />
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PublicTrainingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const communityId = params.communityId as string
  const trainingId = params.trainingId as string

  const [training, setTraining] = useState<PlannedTraining | null>(null)
  const [community, setCommunity] = useState<CommunityDoc | null>(null)
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [isMember, setIsMember] = useState(false)
  const [loading, setLoading] = useState(true)

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

  // Load training (real-time)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'communities', communityId, 'trainings', trainingId),
      snap => {
        if (snap.exists()) {
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
    if (!name || !guestId || savingGuest) return
    setSavingGuest(true)
    try {
      await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
        [`guestRsvps.${guestId}`]: { name, status: 'GOING' },
      })
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

  async function memberRsvp(status: 'GOING' | 'NOT_GOING' | 'MAYBE') {
    if (!user) return
    await updateDoc(doc(db, 'communities', communityId, 'trainings', trainingId), {
      [`rsvps.${user.uid}`]: status,
    })
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

  const officialStyle = training.official ? {
    background: 'linear-gradient(135deg, #0D3D28 0%, #164742 100%)',
    borderColor: '#1ED75F40',
  } : {}

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 py-4">

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-5 text-sm"
        >
          <ArrowLeft size={16} /> Înapoi
        </button>

        {/* Community link */}
        {community && (
          <Link href={`/community/${communityId}`}>
            <div className="flex items-center gap-2 mb-4 text-brand-green/80 hover:text-brand-green transition-colors">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1ED75F22' }}>
                <span className="text-[10px] font-black text-brand-green">{community.name.charAt(0)}</span>
              </div>
              <span className="text-sm font-semibold truncate">{community.name}</span>
              {community.verified && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#3B82F625', color: '#3B82F6' }}>✓</span>
              )}
            </div>
          </Link>
        )}

        {/* Training card */}
        <div
          className="rounded-3xl p-5 mb-4 border"
          style={training.official ? { ...officialStyle, borderColor: '#1ED75F40' } : { backgroundColor: 'var(--app-surface)', borderColor: 'transparent' }}
        >
          {training.official && (
            <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest mb-3"
              style={{ backgroundColor: '#1ED75F22', color: '#1ED75F', border: '1px solid #1ED75F40' }}>
              ⭐ OFICIAL
            </span>
          )}

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

        {/* Attendees list */}
        {(goingUids.length > 0 || guestGoing.length > 0) && (
          <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-3">PARTICIPANȚI ({totalGoing})</p>
            <div className="flex flex-col gap-2">
              {goingUids.map(uid => {
                const m = members.find(mem => mem.userId === uid)
                const name = m?.displayName ?? uid.slice(0, 8)
                const photo = m?.photoUrl ?? null
                const isMe = user?.uid === uid
                return (
                  <div key={uid} className="flex items-center gap-2.5">
                    <MemberAvatar photoUrl={photo} name={name} size={32} />
                    <span className="text-sm font-semibold text-white/80 flex-1">{name}</span>
                    {isMe && <span className="text-[10px] text-brand-green">Tu</span>}
                  </div>
                )
              })}
              {guestGoing.map(([gid, g]) => (
                <div key={gid} className="flex items-center gap-2.5">
                  <GuestAvatar size={32} />
                  <span className="text-sm font-semibold text-white/70 flex-1">{g.name}</span>
                  <span className="text-[10px] text-white/30 flex items-center gap-1">
                    <User size={9} /> invitat
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RSVP section */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
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
                    style={{ backgroundColor: '#1ED75F15', border: '1px solid #1ED75F30' }}>
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
                  <div className="flex gap-2 mb-3">
                    <input
                      ref={inputRef}
                      value={guestInput}
                      onChange={e => setGuestInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && confirmGuestRsvp()}
                      placeholder="Numele tău *"
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
                  <p className="text-[11px] text-white/30 text-center">sau</p>
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
        </div>

      </div>
    </div>
  )
}
