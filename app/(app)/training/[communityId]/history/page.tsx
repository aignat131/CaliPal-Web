'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { collection, getDocs, getDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { PlannedTraining, CommunityDoc } from '@/types'
import { ArrowLeft, Calendar, Clock, MapPin, Dumbbell, Users, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/context/LanguageContext'

function parseDateTime(str: string | undefined, fallbackDate?: string): Date | null {
  if (!str) {
    // No timeStart — try parsing the date field alone
    if (fallbackDate) {
      try {
        const d = new Date(fallbackDate)
        return isNaN(d.getTime()) ? null : d
      } catch { return null }
    }
    return null
  }
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}`)
  }
  if (fallbackDate && /^\d{2}:\d{2}$/.test(str)) return new Date(`${fallbackDate}T${str}`)
  try { return new Date(str) } catch { return null }
}

function formatDate(timeStart: string, fallbackDate?: string): string {
  const d = parseDateTime(timeStart, fallbackDate)
  if (!d || isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ro', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function formatTime(str: string): string {
  return str?.slice(-5) ?? ''
}

type TrainingWithId = PlannedTraining & { id: string }

function TrainingCard({
  training,
  communityId,
}: {
  training: TrainingWithId
  communityId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()
  const memberGoing = Object.values(training.rsvps ?? {}).filter(s => s === 'GOING').length
  const guestGoing = Object.values(training.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
  const total = memberGoing + guestGoing

  return (
    <Link href={`/training/${communityId}/${training.id}`} onClick={e => { if (expanded) e.preventDefault() }}>
      <div
        className="rounded-2xl p-4 border border-white/8 cursor-pointer"
        style={{ backgroundColor: 'var(--app-surface)' }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-bold text-white leading-tight flex-1">{training.name}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v) }}
              className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center"
            >
              {expanded
                ? <ChevronUp size={14} className="text-white/60" />
                : <ChevronDown size={14} className="text-white/60" />}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
          <span className="flex items-center gap-1 text-xs text-white/50">
            <Calendar size={11} />
            {formatDate(training.timeStart, training.date)}
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
              {total === 1
                ? t('training.participant_1')
                : t('training.participant_n', { n: String(total) })}
            </span>
          )}
        </div>

        {training.authorName && (
          <p className="text-xs text-white/35 mb-2">
            {t('training.organized_by')} <span className="text-white/60 font-semibold">{training.authorName}</span>
            {training.official && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                style={{ backgroundColor: '#1ED75F22', color: '#1ED75F' }}>{t('training.official_badge')}</span>
            )}
          </p>
        )}

        {expanded && (
          <div onClick={e => e.preventDefault()}>
            {training.description ? (
              <p className="text-xs text-white/60 mb-3 leading-relaxed">{training.description}</p>
            ) : null}

            {training.exercises && training.exercises.length > 0 && (
              <div className="mb-3">
                <p className="text-[9px] font-bold text-brand-green/70 tracking-widest mb-1.5">{t('training.exercises_section')}</p>
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
                <p className="text-[9px] font-bold text-brand-green/70 tracking-widest mb-1.5">{t('training.equipment_section')}</p>
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

export default function CommunityTrainingHistoryPage() {
  const { communityId } = useParams() as { communityId: string }
  const router = useRouter()
  const t = useT()

  const [community, setCommunity] = useState<CommunityDoc | null>(null)
  const [trainings, setTrainings] = useState<TrainingWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    async function load() {
      setFetchError(false)
      try {
        // Fetch community info and all trainings in parallel.
        // No orderBy — Firestore excludes docs that don't have the ordered field,
        // which would silently drop trainings without createdAt (common in Android-created docs).
        console.log('[TrainingHistory] loading communityId:', communityId)
        const [commSnap, trainSnap] = await Promise.all([
          getDoc(doc(db, 'communities', communityId)),
          getDocs(collection(db, 'communities', communityId, 'trainings')),
        ])

        console.log('[TrainingHistory] community exists:', commSnap.exists(), '| community name:', commSnap.data()?.name)
        console.log('[TrainingHistory] total training docs returned:', trainSnap.size)
        trainSnap.docs.forEach((d, i) => {
          const data = d.data()
          console.log(`[TrainingHistory] doc[${i}] id=${d.id} name="${data.name}" timeStart="${data.timeStart}" isClosed=${data.isClosed} createdAt=${data.createdAt?.toDate?.()}`)
        })

        if (commSnap.exists()) setCommunity({ id: commSnap.id, ...(commSnap.data() as object) } as CommunityDoc)

        const all = trainSnap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as TrainingWithId)).filter(t => !t.deletedAt)
        const sorted = all
          .sort((a, b) => {
            const da = parseDateTime(a.timeStart, a.date)
            const db2 = parseDateTime(b.timeStart, b.date)
            // Undated trainings go to the bottom
            if (!da && !db2) return 0
            if (!da) return 1
            if (!db2) return -1
            return (db2?.getTime() ?? 0) - (da?.getTime() ?? 0)
          })
        console.log('[TrainingHistory] sorted count:', sorted.length)
        setTrainings(sorted)
      } catch (e) {
        console.error('[TrainingHistory] failed to load:', e)
        setFetchError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [communityId, retryKey])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10"
        style={{ backgroundColor: 'var(--app-bg)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{t('training.history_title')}</p>
            {community && <p className="text-[10px] text-white/40 truncate">{community.name}</p>}
          </div>
          {community && (
            <Link href={`/community/${communityId}`}
              className="text-xs text-brand-green font-semibold flex-shrink-0">
              {t('training.community_link')}
            </Link>
          )}
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
            ))}
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Dumbbell size={36} className="text-white/15" />
            <p className="text-sm text-white/35 text-center">Nu s-au putut încărca antrenamentele.</p>
            <button onClick={() => { setLoading(true); setRetryKey(k => k + 1) }}
              className="mt-2 h-9 px-5 rounded-full bg-brand-green text-black text-xs font-bold">
              Încearcă din nou
            </button>
          </div>
        ) : trainings.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Dumbbell size={36} className="text-white/15" />
            <p className="text-sm text-white/35 text-center whitespace-pre-line">{t('training.no_past')}</p>
            <button onClick={() => router.back()}
              className="mt-2 h-9 px-5 rounded-full bg-brand-green text-black text-xs font-bold">
              {t('training.back')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/35 mb-1">
              {trainings.length === 1
                ? t('training.n_past_1')
                : t('training.n_past_n', { n: String(trainings.length) })}
            </p>
            {trainings.map(tr => (
              <TrainingCard
                key={tr.id}
                training={tr}
                communityId={communityId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
