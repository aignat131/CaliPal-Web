'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import type { PlannedTraining } from '@/types'
import { attendanceStats } from '@/lib/schedule/goals'
import { parseTrainingMs } from '@/lib/schedule/week'
import { Section } from './Section'
import { CalendarCheck, Flame } from 'lucide-react'

export function AttendanceSection({ communityId, uid, trainings, joinedAtMs }: {
  communityId: string
  uid: string
  trainings: PlannedTraining[] | null
  joinedAtMs: number | null
}) {
  const sessions = useMemo(() => (trainings ?? [])
    .filter(t => t.isClosed && !t.deletedAt)
    .map(t => ({ t, startMs: parseTrainingMs(t.timeStart) ?? (t.closedAt?.toMillis?.() ?? 0), attended: (t.attendedBy ?? []).includes(uid) }))
    .sort((a, b) => b.startMs - a.startMs), [trainings, uid])
  const stats = attendanceStats(sessions, joinedAtMs)
  const recent = sessions.filter(s => joinedAtMs === null || s.startMs >= joinedAtMs).slice(0, 10)

  return (
    <Section title="Prezență la antrenamente" icon={<CalendarCheck size={11} />}>
      {trainings === null ? (
        <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
      ) : stats.total === 0 ? (
        <p className="text-xs text-white/40">Niciun antrenament închis de când e membru.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Stat value={`${Math.round(stats.ratio * 100)}%`} label={`${stats.attended}/${stats.total} sesiuni`} />
            <Stat value={<span className="flex items-center gap-1 justify-center"><Flame size={15} className="text-orange-400" />{stats.streak}</span>} label="streak actual" />
            <Stat value={stats.bestStreak} label="cel mai bun streak" />
          </div>
          <p className="text-[11px] text-white/40 mb-1.5">Ultimele sesiuni (cele mai noi primele)</p>
          <div className="flex flex-col gap-1">
            {recent.map(({ t, attended }) => (
              <Link key={t.id} href={`/training/${communityId}/${t.id}`} className="flex items-center gap-2 text-xs py-1">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${attended ? 'bg-brand-green' : 'bg-white/15'}`} />
                <span className="text-white/75 flex-1 truncate">{t.name}</span>
                <span className="text-white/35 tabular-nums">{t.timeStart?.slice(0, 5)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-white/5 py-2.5 text-center">
      <div className="text-lg font-black text-white leading-tight">{value}</div>
      <div className="text-[10.5px] text-white/40 mt-0.5">{label}</div>
    </div>
  )
}
