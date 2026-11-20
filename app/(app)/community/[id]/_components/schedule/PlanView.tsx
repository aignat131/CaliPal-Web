'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { CommunityMember, PlannedTraining } from '@/types'
import { hasSlot } from '@/lib/schedule/availability'
import { compareRsvpToAvailability, focusLabel } from '@/lib/schedule/sessions'
import { DAY_NAMES, trainingSlot, weekDays } from '@/lib/schedule/week'
import { useAvailabilityOverview } from './useAvailabilityOverview'
import { CalendarPlus, ChevronDown, ChevronUp, MapPin, Users } from 'lucide-react'

/** Weekly calendar of trainings with RSVP vs availability comparison. */
export function PlanView({ communityId, weekKey, trainings, members, onSchedule }: {
  communityId: string
  weekKey: string
  trainings: PlannedTraining[]
  members: CommunityMember[]
  onSchedule?: () => void
}) {
  const { data } = useAvailabilityOverview(communityId, weekKey)
  const days = weekDays(weekKey)
  const nameOf = useMemo(() => {
    const m = new Map(members.map(x => [x.userId, x.displayName]))
    return (uid: string) => m.get(uid) ?? 'Membru'
  }, [members])

  const sessions = useMemo(() => trainings
    .filter(t => !t.deletedAt)
    .map(t => ({ t, slot: trainingSlot(t.timeStart) }))
    .filter((x): x is { t: PlannedTraining; slot: NonNullable<ReturnType<typeof trainingSlot>> } => x.slot?.weekKey === weekKey)
    .sort((a, b) => a.slot.day - b.slot.day || a.t.timeStart.localeCompare(b.t.timeStart)),
  [trainings, weekKey])

  return (
    <div className="flex flex-col gap-3">
      {onSchedule && (
        <button onClick={onSchedule}
          className="h-11 rounded-xl border border-brand-green/40 text-brand-green text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-green/10">
          <CalendarPlus size={16} /> Programează antrenament
        </button>
      )}
      {onSchedule && (
        <p className="text-[11px] text-white/35 px-1 -mt-1">Sfat: din Overview, apasă pe un interval din heatmap ca să programezi direct acolo.</p>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-10">
          <CalendarPlus size={32} className="text-white/15 mx-auto mb-2" />
          <p className="text-sm text-white/40">Niciun antrenament în săptămâna asta.</p>
        </div>
      ) : days.map(d => {
        const list = sessions.filter(s => s.slot.day === d.index)
        if (!list.length) return null
        return (
          <section key={d.dateKey}>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-1.5 px-1">
              {DAY_NAMES[d.index].toUpperCase()} {d.dayMonth}
            </p>
            <div className="flex flex-col gap-2">
              {list.map(({ t, slot }) => {
                const going = Object.entries(t.rsvps ?? {}).filter(([, s]) => s === 'GOING').map(([u]) => u)
                const availableUids = data?.members
                  ?.filter(r => hasSlot(r.mask, slot.day, slot.hour)).map(r => r.uid) ?? null
                const availableCount = data ? data.counts[slot.day]?.[slot.hour] ?? 0 : null
                return (
                  <SessionRow key={t.id} t={t} communityId={communityId} going={going}
                    availableUids={availableUids} availableCount={availableCount} nameOf={nameOf} />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function SessionRow({ t, communityId, going, availableUids, availableCount, nameOf }: {
  t: PlannedTraining
  communityId: string
  going: string[]
  availableUids: string[] | null
  availableCount: number | null
  nameOf: (uid: string) => string
}) {
  const [open, setOpen] = useState(false)
  const cmp = availableUids ? compareRsvpToAvailability(going, availableUids) : null
  const time = `${t.timeStart.slice(-5)}${t.timeEnd ? `–${t.timeEnd.slice(-5)}` : ''}`

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{t.name}</p>
          <p className="text-[12px] text-white/50 mt-0.5">
            {time}{t.focus ? ` · ${focusLabel(t.focus)}` : ''}
          </p>
          {t.location && <p className="text-[11.5px] text-white/40 mt-0.5 flex items-center gap-1"><MapPin size={11} /> {t.location}</p>}
        </div>
        <div className="text-right flex-shrink-0 leading-tight">
          <p className="text-[17px] font-medium text-brand-green">{going.length}{typeof t.capacity === 'number' ? `/${t.capacity}` : ''}</p>
          <p className="text-[11px] text-white/35">vin</p>
          {availableCount !== null && <p className="text-[11px] text-white/35 mt-0.5">{availableCount} disponibili</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Link href={`/training/${communityId}/${t.id}`}
          className="h-8 px-3 rounded-lg border border-white/15 text-white/70 text-xs font-bold flex items-center">
          {t.isClosed ? `Prezență (${t.attendedBy?.length ?? 0})` : 'Detalii'}
        </Link>
        {cmp && (
          <button onClick={() => setOpen(v => !v)} aria-expanded={open}
            className="h-8 px-3 rounded-lg bg-white/5 text-white/60 text-xs font-bold flex items-center gap-1">
            <Users size={12} /> Vin vs. disponibili {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {open && cmp && (
        <div className="mt-3 flex flex-col gap-2">
          <Group title="Vin și erau disponibili" uids={cmp.goingAndAvailable} nameOf={nameOf} tone="ok" />
          <Group title="Vin, deși nu și-au trecut intervalul" uids={cmp.goingNotAvailable} nameOf={nameOf} tone="warn" />
          <Group title="Disponibili, dar nu au confirmat" uids={cmp.availableNotGoing} nameOf={nameOf} tone="muted" />
        </div>
      )}
    </div>
  )
}

function Group({ title, uids, nameOf, tone }: {
  title: string; uids: string[]; nameOf: (u: string) => string; tone: 'ok' | 'warn' | 'muted'
}) {
  const cls = tone === 'ok' ? 'text-brand-green' : tone === 'warn' ? 'text-[#FFB800]' : 'text-white/45'
  return (
    <div>
      <p className={`text-[11px] font-bold mb-1 ${cls}`}>{title} ({uids.length})</p>
      {uids.length === 0
        ? <p className="text-[11px] text-white/25">—</p>
        : <div className="flex flex-wrap gap-1">{uids.map(u => (
            <span key={u} className="text-[11px] px-2 py-0.5 rounded-full bg-white/8 text-white/75">{nameOf(u)}</span>
          ))}</div>}
    </div>
  )
}
