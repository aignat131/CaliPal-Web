'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  collection, onSnapshot, query, orderBy, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import type { FormCheckRequest } from '@/types'
import { ArrowLeft, Video, MessageSquare, Check, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_COLORS = {
  PENDING: '#F59E0B',
  REVIEWED: '#1ED75F',
}

const STATUS_LABELS = {
  PENDING: 'În așteptare',
  REVIEWED: 'Recenzat',
}

export default function CoachPage() {
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const isCoach = profile?.isCoach ?? false
  const router = useRouter()

  const [requests, setRequests] = useState<FormCheckRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'form_check_requests'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }) as FormCheckRequest))
      setLoading(false)
    })
    return unsub
  }, [])

  async function submitFeedback(reqId: string) {
    const feedback = feedbacks[reqId]?.trim()
    if (!feedback || submitting) return
    setSubmitting(reqId)
    try {
      await updateDoc(doc(db, 'form_check_requests', reqId), {
        status: 'REVIEWED',
        feedback,
        reviewedAt: serverTimestamp(),
        reviewedBy: user?.uid,
      })
      setExpandedId(null)
    } finally { setSubmitting(null) }
  }

  if (!isCoach) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center gap-4 px-6"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        <p className="text-4xl">🔒</p>
        <p className="text-white font-bold text-base">Acces restricționat</p>
        <p className="text-white/50 text-sm text-center">Această secțiune este disponibilă doar antrenorilor verificați.</p>
        <button onClick={() => router.back()}
          className="mt-2 h-10 px-6 rounded-full border border-white/20 text-sm text-white/70">
          Înapoi
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Coach Hub</h1>
          <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-brand-green/20 text-brand-green">
            Antrenor
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <Video size={48} className="text-white/15 mx-auto mb-4" />
            <p className="text-white/50 font-semibold text-sm">Nicio cerere de analiză formă</p>
            <p className="text-white/30 text-xs mt-1">Cererile utilizatorilor vor apărea aici.</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4 text-xs text-white/50">
              <span className="font-bold text-brand-green">{requests.filter(r => r.status === 'PENDING').length}</span> în așteptare ·
              <span className="font-bold text-white/60">{requests.filter(r => r.status === 'REVIEWED').length}</span> recenzate
            </div>

            <div className="flex flex-col gap-3">
              {requests.map(req => {
                const isExpanded = expandedId === req.id
                const statusColor = STATUS_COLORS[req.status]
                const isPending = req.status === 'PENDING'

                return (
                  <div key={req.id} className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-bold text-white text-sm">{req.userName}</p>
                          <p className="text-xs text-white/40 mt-0.5">{req.exerciseName}</p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${statusColor}20`, color: statusColor }}>
                          {STATUS_LABELS[req.status]}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-white/40">🪙 {req.coinsSpent} monede</span>
                        {req.status === 'REVIEWED' && (
                          <span className="text-xs text-brand-green flex items-center gap-1">
                            <Check size={11} /> Recenzat
                          </span>
                        )}
                      </div>

                      {req.notes && (
                        <div className="bg-white/5 rounded-xl p-3 mb-3">
                          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">NOTE UTILIZATOR</p>
                          <p className="text-xs text-white/70">{req.notes}</p>
                        </div>
                      )}

                      {req.status === 'REVIEWED' && req.feedback && (
                        <div className="bg-brand-green/10 border border-brand-green/20 rounded-xl p-3 mb-3">
                          <p className="text-[10px] font-bold text-brand-green/70 tracking-widest mb-1">FEEDBACK TĂU</p>
                          <p className="text-xs text-white/70">{req.feedback}</p>
                        </div>
                      )}

                      {isPending && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : req.id)}
                          className="flex items-center gap-2 text-xs font-bold text-brand-green">
                          <MessageSquare size={13} />
                          {isExpanded ? 'Ascunde feedback' : 'Scrie feedback'}
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      )}
                    </div>

                    {isExpanded && isPending && (
                      <div className="px-4 pb-4 border-t border-white/8 pt-3">
                        <textarea
                          value={feedbacks[req.id] ?? ''}
                          onChange={e => setFeedbacks(prev => ({ ...prev, [req.id]: e.target.value }))}
                          placeholder="Scrie feedback detaliat despre forma utilizatorului..."
                          rows={4}
                          className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/5 resize-none mb-3"
                        />
                        <button
                          onClick={() => submitFeedback(req.id)}
                          disabled={!feedbacks[req.id]?.trim() || submitting === req.id}
                          className="w-full h-10 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40">
                          {submitting === req.id ? 'Se trimite...' : 'Trimite feedback'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
