'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { collection, getDocs, getDoc, doc, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { PlannedTraining, ParkDoc } from '@/types'
import { ArrowLeft, Calendar, Clock, MapPin, Dumbbell, Users, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'

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

function formatTime(str: string): string {
  return str?.slice(-5) ?? ''
}

type TrainingWithId = PlannedTraining & { id: string }

function TrainingCard({ training, parkId }: { training: TrainingWithId; parkId: string }) {
  const [expanded, setExpanded] = useState(false)
  const goingCount = Object.values(training.rsvps ?? {}).filter(s => s === 'GOING').length
  const guestCount = Object.values(training.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
  const total = goingCount + guestCount

  return (
    <Link href={`/training/park/${parkId}/${training.id}`} onClick={e => { if (expanded) e.preventDefault() }}>
      <div
        className="rounded-2xl p-4 border border-white/8 cursor-pointer"
        style={{ backgroundColor: 'var(--app-surface)' }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-bold text-white leading-tight flex-1">{training.name}</p>
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v) }}
            className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0"
          >
            {expanded
              ? <ChevronUp size={14} className="text-white/60" />
              : <ChevronDown size={14} className="text-white/60" />}
          </button>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
          <span className="flex items-center gap-1 text-xs text-white/50">
            <Calendar size={11} />
            {formatDate(training.timeStart)}
          </span>
          <span className="flex items-center gap-1 text-xs text-white/50">
            <Clock size={11} />
            {formatTime(training.timeStart)}{training.timeEnd ? ` – ${formatTime(training.timeEnd)}` : ''}
          </span>
          {training.location && (
            <span className="flex items-center gap-1 text-xs text-white/50">
              <MapPin size={11} />
              {training.location}
            </span>
          )}
          {total > 0 && (
            <span className="flex items-center gap-1 text-xs text-brand-green font-semibold">
              <Users size={11} />
              {total} {total === 1 ? 'participant' : 'participanți'}
            </span>
          )}
        </div>

        {training.authorName && (
          <p className="text-xs text-white/35 mb-2">
            Organizat de <span className="text-white/60 font-semibold">{training.authorName}</span>
          </p>
        )}

        {expanded && (
          <div onClick={e => e.preventDefault()}>
            {training.description ? (
              <p className="text-xs text-white/60 mb-3 leading-relaxed">{training.description}</p>
            ) : null}

            {training.exercises && training.exercises.length > 0 && (
              <div className="mb-3">
                <p className="text-[9px] font-bold text-brand-green/70 tracking-widest mb-1.5">EXERCIȚII</p>
                <div className="flex flex-col gap-1">
                  {training.exercises.map((ex, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-white/70">
                      <Dumbbell size={11} className="text-brand-green flex-shrink-0" />
                      <span>{ex.name}</span>
                      <span className="text-white/35">{ex.sets}×{ex.repsPerSet} rep</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {training.equipment && training.equipment.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-brand-green/70 tracking-widest mb-1.5">ECHIPAMENT</p>
                <div className="flex flex-wrap gap-1.5">
                  {training.equipment.map((eq, i) => (
                    <span key={i}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ backgroundColor: '#1ED75F18', color: '#1ED75F', border: '1px solid #1ED75F30' }}>
                      {eq}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

export default function ParkTrainingHistoryPage() {
  const { parkId } = useParams() as { parkId: string }
  const router = useRouter()

  const [park, setPark] = useState<ParkDoc | null>(null)
  const [trainings, setTrainings] = useState<TrainingWithId[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [parkSnap, trainSnap] = await Promise.all([
          getDoc(doc(db, 'parks', parkId)),
          getDocs(query(collection(db, 'parks', parkId, 'trainings'), orderBy('createdAt', 'desc'))),
        ])
        if (parkSnap.exists()) setPark({ id: parkSnap.id, ...parkSnap.data() } as ParkDoc)
        const now = new Date()
        const past = trainSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as TrainingWithId))
          .filter(t => {
            const d = parseDateTime(t.timeStart)
            return d && d < now
          })
          .sort((a, b) => {
            const da = parseDateTime(a.timeStart)
            const db2 = parseDateTime(b.timeStart)
            return (db2?.getTime() ?? 0) - (da?.getTime() ?? 0)
          })
        setTrainings(past)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [parkId])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: 'var(--app-bg)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
          <ArrowLeft size={18} className="text-white/80" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">Istoric antrenamente</p>
          {park && <p className="text-[10px] text-white/40 truncate">{park.name}</p>}
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
            ))}
          </div>
        ) : trainings.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Dumbbell size={36} className="text-white/15" />
            <p className="text-sm text-white/35 text-center">Niciun antrenament trecut.<br />Fii primul care planifică!</p>
            <button onClick={() => router.back()}
              className="mt-2 h-9 px-5 rounded-full bg-brand-green text-black text-xs font-bold">
              Înapoi la hartă
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/35 mb-1">{trainings.length} antrenament{trainings.length !== 1 ? 'e' : ''} trecut{trainings.length !== 1 ? 'e' : ''}</p>
            {trainings.map(t => (
              <TrainingCard key={t.id} training={t} parkId={parkId} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
