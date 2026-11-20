'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { configHours, resolveWeek, sanitizeConfig, type AvailabilityDoc, type ScheduleConfig } from '@/lib/schedule/availability'
import { currentWeekStart, relativeTimeRo, weekRangeLabel } from '@/lib/schedule/week'
import { AvailabilityGrid } from '../../../_components/schedule/AvailabilityGrid'
import { Section } from './Section'
import { CalendarDays } from 'lucide-react'

export function AvailabilitySection({ communityId, uid, isOwner }: { communityId: string; uid: string; isOwner: boolean }) {
  const [avail, setAvail] = useState<AvailabilityDoc | null | undefined>(undefined)
  const [config, setConfig] = useState<ScheduleConfig>(sanitizeConfig(null))
  const week = currentWeekStart()

  useEffect(() => onSnapshot(doc(db, 'communities', communityId, 'availability', uid),
    s => setAvail(s.exists() ? (s.data() as AvailabilityDoc) : null), () => setAvail(null)), [communityId, uid])
  useEffect(() => onSnapshot(doc(db, 'communities', communityId, 'config', 'plan'),
    s => setConfig(sanitizeConfig(s.data())), () => undefined), [communityId])

  const r = resolveWeek(avail, week)
  const status = r.completed ? (r.customized ? 'personalizat' : 'confirmat') : r.source === 'typical' ? 'doar program tipic (neconfirmat)' : 'necompletat'

  return (
    <Section title={`Disponibilitate · ${weekRangeLabel(week)}`} icon={<CalendarDays size={11} />}
      action={isOwner ? <Link href={`/community/${communityId}?tab=orar`} className="text-xs font-bold text-brand-green">Editează</Link> : undefined}>
      {avail === undefined ? (
        <div className="h-40 rounded-xl bg-white/5 animate-pulse" />
      ) : (
        <>
          <p className="text-[11px] text-white/45 mb-2">
            Status: <span className="text-white/75">{status}</span> · actualizat {relativeTimeRo(avail?.updatedAt?.toMillis?.() ?? null)}
          </p>
          <div className="-mx-2">
            <AvailabilityGrid mode="edit" readOnly weekKey={week} hours={configHours(config)}
              isOn={(d, h) => ((r.mask[d] >> h) & 1) === 1} onChange={() => undefined} />
          </div>
        </>
      )}
    </Section>
  )
}
