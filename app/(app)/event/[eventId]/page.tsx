'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useT } from '@/lib/context/LanguageContext'
import { useEvent } from '@/lib/event/useEvent'
import { COUNTDOWN_DURATION_MS } from '@/lib/event/types'
import EventLobby from '@/components/event/EventLobby'
import EventCountdown from '@/components/event/EventCountdown'
import EventActiveView from '@/components/event/EventActiveView'
import EventPodium from '@/components/event/EventPodium'

type Screen = 'loading' | 'lobby' | 'countdown' | 'active' | 'results' | 'cancelled' | 'error'

export default function EventRoomPage() {
  const params = useParams()
  const eventId = params.eventId as string
  const router = useRouter()
  const { user } = useAuth()
  const { displayName, photoUrl, profile, profileLoaded } = useMyProfile()
  const t = useT()

  const {
    event, participants, myParticipant, isHost, loading, error,
    sortedParticipants, winner,
    joinEvent,
    startEvent, activateEvent, finishEvent, cancelEvent, leaveEvent,
    incrementExerciseReps, markFinished,
  } = useEvent(eventId)

  const [screen, setScreen] = useState<Screen>('loading')

  const isSpectator = !user || !myParticipant

  // ── Determine screen from event status ───────────────────────────────────
  useEffect(() => {
    if (loading) { setScreen('loading'); return }
    if (error || !event) { setScreen('error'); return }

    switch (event.status) {
      case 'LOBBY': setScreen('lobby'); break
      case 'COUNTDOWN': setScreen('countdown'); break
      case 'ACTIVE': setScreen('active'); break
      case 'FINISHED': setScreen('results'); break
      case 'CANCELLED': setScreen('cancelled'); break
    }
  }, [event?.status, loading, error])

  // ── Auto-join if not already a participant ─────────────────────────────────
  useEffect(() => {
    if (!user || !event || loading || !profileLoaded) return
    if (event.status !== 'LOBBY' && event.status !== 'ACTIVE') return
    if (myParticipant) return
    if (participants.length >= event.maxParticipants) return

    joinEvent(displayName, photoUrl, {
      nameColor: profile?.nameColor,
      emojiBadge: profile?.emojiBadge,
      titleBadge: profile?.titleBadge,
      profileFrame: profile?.profileFrame,
    })
  }, [user, event, myParticipant, participants.length, loading, profileLoaded, displayName, photoUrl, profile, joinEvent])

  // ── Countdown → Active transition (host only) ────────────────────────────
  useEffect(() => {
    if (screen !== 'countdown' || !isHost) return
    const timer = setTimeout(() => activateEvent(), COUNTDOWN_DURATION_MS)
    return () => clearTimeout(timer)
  }, [screen, isHost, activateEvent])

  // Suppress unused
  void winner

  // ── Handle leave/cancel ───────────────────────────────────────────────────
  const handleLeave = useCallback(async () => {
    await leaveEvent()
    router.push('/event')
  }, [leaveEvent, router])

  const handleCancel = useCallback(async () => {
    await cancelEvent()
  }, [cancelEvent])

  const handleFinish = useCallback(async () => {
    await finishEvent()
  }, [finishEvent])

  // ── Render ────────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <div className="w-6 h-6 border-2 border-white/30 border-t-amber-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (screen === 'error' || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <p className="text-white/60">{error || t('event.not_found')}</p>
        <button
          onClick={() => router.push('/event')}
          className="px-4 py-2 rounded-lg text-sm font-medium text-black"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {t('event.home')}
        </button>
      </div>
    )
  }

  if (screen === 'cancelled') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <p className="text-white/60">{t('event.cancelled')}</p>
        <button
          onClick={() => router.push('/event')}
          className="px-4 py-2 rounded-lg text-sm font-medium text-black"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {t('event.home')}
        </button>
      </div>
    )
  }

  if (screen === 'lobby') {
    return (
      <div className="min-h-screen pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <EventLobby
          event={event}
          participants={participants}
          isHost={isHost}
          isSpectator={isSpectator}
          onStart={startEvent}
          onCancel={handleCancel}
          onLeave={handleLeave}
          currentUid={user?.uid ?? ''}
        />
      </div>
    )
  }

  if (screen === 'countdown') {
    return <EventCountdown onComplete={activateEvent} />
  }

  if (screen === 'active') {
    return (
      <div className="min-h-screen pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <EventActiveView
          event={event}
          sortedParticipants={sortedParticipants}
          myParticipant={myParticipant}
          isHost={isHost}
          isSpectator={isSpectator}
          currentUid={user?.uid ?? ''}
          onIncrementReps={incrementExerciseReps}
          onFinish={handleFinish}
        />
      </div>
    )
  }

  if (screen === 'results') {
    return (
      <div className="min-h-screen pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <EventPodium
          event={event}
          sortedParticipants={sortedParticipants}
          myParticipant={myParticipant}
          currentUid={user?.uid ?? ''}
          onHome={() => router.push('/event')}
          onMarkFinished={markFinished}
        />
      </div>
    )
  }

  return null
}
