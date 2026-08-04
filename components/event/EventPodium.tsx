'use client'

import { useEffect, useRef } from 'react'
import { Trophy, Home } from 'lucide-react'
import { addDoc, collection, serverTimestamp, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useT } from '@/lib/context/LanguageContext'
import { awardCoins, checkEventMilestones } from '@/lib/gamification/coins'
import { PLAYER_COLORS } from '@/lib/battle/types'
import { EVENT_PLACEMENT_COINS, EVENT_PARTICIPATION_COINS } from '@/lib/event/types'
import type { EventDoc, EventParticipantDoc } from '@/lib/event/types'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  event: EventDoc
  sortedParticipants: EventParticipantDoc[]
  myParticipant: EventParticipantDoc | null
  currentUid: string
  onHome: () => void
  onMarkFinished: (placement: number, coinsEarned: number) => Promise<void>
}

export default function EventPodium({
  event, sortedParticipants, myParticipant, currentUid,
  onHome, onMarkFinished,
}: Props) {
  const t = useT()
  const processedRef = useRef(false)

  // Process results once
  useEffect(() => {
    if (processedRef.current || !myParticipant || myParticipant.placement !== null) return
    processedRef.current = true

    async function processResults() {
      const placement = sortedParticipants.findIndex(p => p.uid === currentUid) + 1
      let totalCoins = 0

      // Award placement coins
      if (placement === 1) {
        const winCoins = await awardCoins(currentUid, 'EVENT_WIN')
        totalCoins += winCoins
      }

      // Placement bonus from EVENT_PLACEMENT_COINS
      const placementIndex = placement - 1
      if (placementIndex < EVENT_PLACEMENT_COINS.length) {
        // Placement coins are included in EVENT_WIN for 1st place
        if (placement > 1) {
          totalCoins += EVENT_PLACEMENT_COINS[placementIndex]
        }
      } else {
        totalCoins += EVENT_PARTICIPATION_COINS
      }

      // Check milestones
      const historySnap = await getDocs(collection(db, 'users', currentUid, 'event_history'))
      const totalEvents = historySnap.size + 1
      await checkEventMilestones(currentUid, totalEvents)

      // Write event history
      await addDoc(collection(db, 'users', currentUid, 'event_history'), {
        eventId: event.id,
        code: event.code,
        name: event.name,
        exercises: event.exercises.map(e => e.name),
        totalPoints: myParticipant!.totalPoints,
        placement,
        participantCount: sortedParticipants.length,
        coinsEarned: totalCoins,
        playedAt: serverTimestamp(),
      })

      // Mark finished in participant doc
      await onMarkFinished(placement, totalCoins)
    }

    processResults().catch(() => {})
  }, [myParticipant, sortedParticipants, currentUid, event, onMarkFinished])

  const myCoins = myParticipant?.coinsEarned ?? 0

  return (
    <div className="max-w-md mx-auto px-4 py-8 animate-[fadeInUp_0.3s_ease-out]">
      {/* Header */}
      <div className="text-center mb-8">
        <Trophy size={40} className="text-amber-400 mx-auto mb-3" />
        <h1 className="text-2xl font-black text-white/90">{t('event.results')}</h1>
        <p className="text-sm text-white/45 mt-1">{event.name}</p>
      </div>

      {/* Podium for top 3 */}
      {sortedParticipants.length >= 3 && (
        <div className="flex items-end justify-center gap-3 mb-8 h-44">
          {/* 2nd place */}
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-white/10 mb-2 border-2 border-gray-400">
              {sortedParticipants[1].photoUrl ? (
                <img src={sortedParticipants[1].photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">
                  {sortedParticipants[1].displayName.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-2xl mb-1">🥈</span>
            <span className="text-xs font-medium text-white/70 truncate max-w-[80px]">{sortedParticipants[1].displayName}</span>
            <span className="text-sm font-bold text-gray-400">{sortedParticipants[1].totalPoints} {t('event.points')}</span>
            <div className="w-20 bg-gray-400/15 rounded-t-lg mt-2" style={{ height: '60px' }} />
          </div>

          {/* 1st place */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10 mb-2 border-2 border-amber-400">
              {sortedParticipants[0].photoUrl ? (
                <img src={sortedParticipants[0].photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-bold text-amber-400">
                  {sortedParticipants[0].displayName.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-3xl mb-1">🥇</span>
            <span className="text-xs font-bold text-white/90 truncate max-w-[80px]">{sortedParticipants[0].displayName}</span>
            <span className="text-sm font-bold text-amber-400">{sortedParticipants[0].totalPoints} {t('event.points')}</span>
            <div className="w-20 bg-amber-400/15 rounded-t-lg mt-2" style={{ height: '80px' }} />
          </div>

          {/* 3rd place */}
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 mb-2 border-2 border-orange-700">
              {sortedParticipants[2].photoUrl ? (
                <img src={sortedParticipants[2].photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-base font-bold text-orange-700">
                  {sortedParticipants[2].displayName.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-2xl mb-1">🥉</span>
            <span className="text-xs font-medium text-white/70 truncate max-w-[80px]">{sortedParticipants[2].displayName}</span>
            <span className="text-sm font-bold text-orange-600">{sortedParticipants[2].totalPoints} {t('event.points')}</span>
            <div className="w-20 bg-orange-700/15 rounded-t-lg mt-2" style={{ height: '40px' }} />
          </div>
        </div>
      )}

      {/* Full rankings */}
      <div className="space-y-2 mb-6">
        {sortedParticipants.map((participant, index) => {
          const isMe = participant.uid === currentUid
          const color = PLAYER_COLORS[index % PLAYER_COLORS.length]
          const isTop3 = index < 3

          return (
            <div
              key={participant.uid}
              className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${
                isTop3
                  ? 'border-2'
                  : isMe
                    ? 'border border-amber-400/20'
                    : 'border border-white/6'
              }`}
              style={{
                backgroundColor: isTop3
                  ? 'rgba(251,191,36,0.06)'
                  : isMe
                    ? 'rgba(251,191,36,0.03)'
                    : 'rgba(255,255,255,0.03)',
                borderColor: isTop3 ? color : undefined,
              }}
            >
              {/* Medal / rank */}
              <div className="w-10 text-center flex-shrink-0">
                {index < 3 ? (
                  <span className={`text-2xl ${index === 0 ? 'text-3xl' : ''}`}>{MEDALS[index]}</span>
                ) : (
                  <span className="text-lg font-bold text-white/40">#{index + 1}</span>
                )}
              </div>

              {/* Avatar */}
              <div className={`rounded-full overflow-hidden flex-shrink-0 bg-white/10 ${index === 0 ? 'w-12 h-12' : 'w-10 h-10'}`}>
                {participant.photoUrl ? (
                  <img src={participant.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ color }}>
                    {participant.displayName.charAt(0)}
                  </div>
                )}
              </div>

              {/* Name + per-exercise breakdown */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold text-white/90 truncate ${index === 0 ? 'text-base' : 'text-sm'}`}>
                    {participant.displayName}
                  </span>
                  {isMe && <span className="text-xs text-white/40">(tu)</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {event.exercises.map(ex => (
                    <span key={ex.name} className="text-[10px] text-white/40">
                      {ex.name}: {participant.reps[ex.name] ?? 0}
                    </span>
                  ))}
                </div>
              </div>

              {/* Total points */}
              <div className="text-right flex-shrink-0">
                <span className="text-xl font-black" style={{ color }}>{participant.totalPoints}</span>
                <p className="text-[10px] text-white/30">{t('event.points')}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Coin reward */}
      {myCoins > 0 && (
        <div
          className="mx-auto w-fit px-5 py-2.5 rounded-full mb-6 animate-[coinPop_0.5s_ease-out]"
          style={{
            background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.08))',
            border: '1px solid rgba(251,191,36,0.2)',
          }}
        >
          <span className="text-amber-400 font-bold">+{myCoins} 🪙</span>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={onHome}
        className="w-full h-11 rounded-xl border border-white/10 font-medium text-sm text-white/70 flex items-center justify-center gap-2 hover:bg-white/5 transition-all"
      >
        <Home size={16} />
        {t('event.home')}
      </button>
    </div>
  )
}
