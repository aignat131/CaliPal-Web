'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useT } from '@/lib/context/LanguageContext'
import { Trophy, Plus, Hash, ChevronLeft, ChevronRight, Clock, Users, History } from 'lucide-react'
import { getRecoveredEventId } from '@/lib/event/useEvent'
import type { EventDoc } from '@/lib/event/types'
import type { UserEventHistory } from '@/lib/event/types'
import CreateEventSheet from '@/components/event/CreateEventSheet'
import JoinEventSheet from '@/components/event/JoinEventSheet'

export default function EventPage() {
  const { user } = useAuth()
  const router = useRouter()
  const t = useT()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<(EventDoc & { id: string })[]>([])
  const [activeEvents, setActiveEvents] = useState<(EventDoc & { id: string })[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [history, setHistory] = useState<(UserEventHistory & { id: string })[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Check for crash recovery
  useEffect(() => {
    const recovered = getRecoveredEventId()
    if (recovered) router.replace(`/event/${recovered}`)
  }, [router])

  // Load upcoming events (LOBBY)
  useEffect(() => {
    const q = query(
      collection(db, 'events'),
      where('status', '==', 'LOBBY'),
      orderBy('createdAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(q, (snap) => {
      setUpcomingEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as EventDoc & { id: string })))
      setEventsLoading(false)
    })
    return unsub
  }, [])

  // Load active events
  useEffect(() => {
    const q = query(
      collection(db, 'events'),
      where('status', '==', 'ACTIVE'),
      orderBy('createdAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(q, (snap) => {
      setActiveEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as EventDoc & { id: string })))
    })
    return unsub
  }, [])

  // Load event history
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'users', user.uid, 'event_history'),
      orderBy('playedAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserEventHistory & { id: string })))
      setHistoryLoading(false)
    })
    return unsub
  }, [user])

  const handleCreated = (eventId: string) => {
    setShowCreate(false)
    router.push(`/event/${eventId}`)
  }

  const handleJoined = (eventId: string) => {
    setShowJoin(false)
    router.push(`/event/${eventId}`)
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0 md:ml-16 lg:ml-48">
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/workout')} className="p-1 rounded-lg hover:bg-white/5 transition-colors">
            <ChevronLeft size={24} className="text-amber-400" />
          </button>
          <Trophy size={24} className="text-amber-400" />
          <h1 className="text-xl font-bold text-white/90 flex-1">{t('event.title')}</h1>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <History size={20} className="text-white/50" />
          </button>
        </div>

        {/* Create & Join CTAs */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            onClick={() => setShowCreate(true)}
            className="p-3.5 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-[0.97]"
            style={{ backgroundColor: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-400">
              <Plus size={20} className="text-black" />
            </div>
            <span className="font-semibold text-white/90 text-sm">{t('event.create')}</span>
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="p-3.5 rounded-2xl flex flex-col items-center gap-2 border border-white/10 hover:border-white/20 transition-all active:scale-[0.97]"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10">
              <Hash size={20} className="text-white/70" />
            </div>
            <span className="font-semibold text-white/90 text-sm">{t('event.join')}</span>
          </button>
        </div>

        {/* History panel (toggled) */}
        {showHistory && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">{t('event.history')}</h2>
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl skeleton" />)}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-6">{t('event.no_history')}</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {history.map(h => (
                  <div
                    key={h.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-white/6"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                      backgroundColor: h.placement <= 3 ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)',
                    }}>
                      <span className="text-sm font-bold" style={{ color: h.placement <= 3 ? '#FBBF24' : 'rgba(255,255,255,0.4)' }}>
                        #{h.placement}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white/85 truncate">{h.name}</div>
                      <div className="flex items-center gap-2 text-xs text-white/45">
                        <span>{h.totalPoints} {t('event.points')}</span>
                        <span>·</span>
                        <span>{h.participantCount} {t('event.participants')}</span>
                      </div>
                    </div>
                    {h.coinsEarned > 0 && (
                      <span className="text-xs font-semibold text-amber-400">+{h.coinsEarned}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Events */}
        {activeEvents.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              {t('event.active_events')}
            </h2>
            <div className="space-y-2 mb-6">
              {activeEvents.map(e => (
                <button
                  key={e.id}
                  onClick={() => router.push(`/event/${e.id}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-amber-400/15 hover:border-amber-400/30 transition-all active:scale-[0.98] text-left"
                  style={{ backgroundColor: 'rgba(251,191,36,0.04)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-400/15">
                    <Trophy size={18} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white/85 truncate">{e.name}</div>
                    <div className="flex items-center gap-2 text-xs text-white/45">
                      <Users size={11} />
                      <span>{e.participantCount}/{e.maxParticipants}</span>
                      {e.durationMinutes && (
                        <>
                          <span>·</span>
                          <Clock size={11} />
                          <span>{e.durationMinutes} {t('event.minutes')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-white/20" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* Upcoming Events */}
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          {t('event.upcoming')}
        </h2>
        {eventsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <div className="text-center py-12">
            <Trophy size={36} className="text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/40">{t('event.no_events')}</p>
            <p className="text-xs text-white/25 mt-1">{t('event.subtitle')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map(e => (
              <button
                key={e.id}
                onClick={() => router.push(`/event/${e.id}`)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/8 hover:border-white/15 transition-all active:scale-[0.98] text-left"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(251,191,36,0.1)' }}>
                  <Trophy size={18} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white/85 truncate">{e.name}</div>
                  <div className="flex items-center gap-2 text-xs text-white/45">
                    <Users size={11} />
                    <span>{e.participantCount}/{e.maxParticipants}</span>
                    <span>·</span>
                    <span>{e.exercises.length} ex.</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-white/40">{e.hostName}</span>
                  <ChevronRight size={14} className="text-white/20" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateEventSheet
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {showJoin && (
        <JoinEventSheet
          onClose={() => setShowJoin(false)}
          onJoined={handleJoined}
        />
      )}
    </div>
  )
}
