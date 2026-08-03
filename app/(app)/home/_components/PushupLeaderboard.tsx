'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  collection, query, orderBy, limit, onSnapshot, doc, getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { getWeekId } from '@/lib/gamification/leaderboard'
import { useT } from '@/lib/context/LanguageContext'
import type { LeaderboardEntry } from '@/types'
import type { User } from 'firebase/auth'
import { Trophy } from 'lucide-react'

const MEDAL = ['#E3B24C', '#C3C9D1', '#C5824A'] // gold, silver, bronze

export function PushupLeaderboard({ user }: { user: User }) {
  const t = useT()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)

  const weekId = getWeekId()

  useEffect(() => {
    const entriesRef = collection(db, 'weekly_leaderboard', weekId, 'entries')
    const q = query(entriesRef, orderBy('totalPushupReps', 'desc'), limit(10))

    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ ...d.data() }) as LeaderboardEntry))
      setLoading(false)
    }, () => setLoading(false))

    // Also fetch own entry
    getDoc(doc(db, 'weekly_leaderboard', weekId, 'entries', user.uid))
      .then(snap => {
        if (snap.exists()) setMyEntry({ ...snap.data() } as LeaderboardEntry)
      })
      .catch(() => {})

    return unsub
  }, [weekId, user.uid])

  if (loading) {
    return (
      <div className="mb-4">
        <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">{t('home.leaderboard_title')}</p>
        <div className="app-card p-3 animate-pulse">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2.5 py-2">
              <div className="w-5 h-4 rounded bg-white/8" />
              <div className="w-7 h-7 rounded-full bg-white/8" />
              <div className="flex-1 h-3.5 rounded bg-white/8" />
              <div className="w-10 h-3.5 rounded bg-white/6" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const myInTop = entries.some(e => e.uid === user.uid)

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-white/40 tracking-widest">{t('home.leaderboard_title')}</p>
        <span className="text-[10px] text-white/30">{t('home.leaderboard_week')}</span>
      </div>

      <div className="app-card overflow-hidden">
        {entries.length === 0 && !myEntry ? (
          <div className="p-5 flex flex-col items-center gap-2 text-center">
            <Trophy size={24} className="text-white/20" />
            <p className="text-xs text-white/40">{t('home.leaderboard_empty')}</p>
            <Link href="/workout" className="text-xs text-brand-green font-semibold mt-1">
              Start workout →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {entries.map((entry, i) => (
              <LeaderboardRow
                key={entry.uid}
                entry={entry}
                rank={i + 1}
                isMe={entry.uid === user.uid}
              />
            ))}

            {/* Show own entry below separator if not in top 10 */}
            {!myInTop && myEntry && (
              <>
                <div className="flex items-center gap-2 px-3 py-1">
                  <span className="text-[10px] text-white/20">···</span>
                </div>
                <LeaderboardRow
                  entry={myEntry}
                  rank={null}
                  isMe
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LeaderboardRow({ entry, rank, isMe }: {
  entry: LeaderboardEntry
  rank: number | null
  isMe: boolean
}) {
  const t = useT()

  return (
    <Link href={`/profile/${entry.uid}`}>
      <div
        className="flex items-center gap-2.5 px-3 py-2 transition-colors active:opacity-70"
        style={isMe ? { backgroundColor: 'rgba(var(--accent-rgb), 0.08)' } : undefined}
      >
        {/* Rank */}
        <div className="w-5 text-center flex-shrink-0">
          {rank && rank <= 3 ? (
            <span className="text-sm font-black" style={{ color: MEDAL[rank - 1] }}>
              {rank}
            </span>
          ) : rank ? (
            <span className="text-xs font-bold text-white/40">{rank}</span>
          ) : (
            <span className="text-[10px] font-semibold text-brand-green">
              {t('home.leaderboard_you')}
            </span>
          )}
        </div>

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-white/8">
          {entry.photoUrl ? (
            <Image src={entry.photoUrl} alt="" width={28} height={28} className="object-cover w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-[10px] font-black text-white/40">
                {entry.displayName?.charAt(0) ?? '?'}
              </span>
            </div>
          )}
        </div>

        {/* Name */}
        <span className={`flex-1 text-sm truncate ${isMe ? 'font-bold text-white' : 'font-medium text-white/80'}`}>
          {entry.displayName || 'User'}
          {isMe && rank && <span className="text-white/40 font-normal"> ({t('home.leaderboard_you')})</span>}
        </span>

        {/* Reps */}
        <span
          className="text-sm font-black flex-shrink-0"
          style={{ color: rank && rank <= 3 ? MEDAL[rank - 1] : 'var(--accent)' }}
        >
          {entry.totalPushupReps} <span className="text-[10px] font-semibold text-white/40">{t('home.leaderboard_reps')}</span>
        </span>
      </div>
    </Link>
  )
}
