'use client'

import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import type { CommunityMember, MemberRole, PlannedTraining } from '@/types'
import { can } from '@/lib/schedule/permissions'
import { DEFAULT_SCHEDULE_CONFIG, sanitizeConfig, type ScheduleConfig } from '@/lib/schedule/availability'
import { DEFAULT_POINTS, MAX_POINTS, sanitizePoints, type PlanPoints } from '@/lib/schedule/attendance'
import { addDays, addWeeks, currentWeekStart, todayKey, trainingSlot, weekRangeLabel, weeksBetween } from '@/lib/schedule/week'
import { MyAvailability } from './MyAvailability'
import { AvailabilityOverview } from './AvailabilityOverview'
import { PlanView } from './PlanView'
import { SessionSheet, type SessionPrefill } from './SessionSheet'
import { TemplatesManager } from './TemplatesManager'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Settings2, X, Target } from 'lucide-react'

type View = 'mine' | 'overview' | 'plan'

export function ScheduleTab({ communityId, uid, role, isSuperAdmin, trainings, members, defaultLocation }: {
  communityId: string
  uid: string
  role: MemberRole
  isSuperAdmin: boolean
  trainings: PlannedTraining[]
  members: CommunityMember[]
  defaultLocation: string
}) {
  const thisWeek = currentWeekStart()
  const [weekKey, setWeekKey] = useState(thisWeek)
  const [view, setView] = useState<View>('mine')
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_SCHEDULE_CONFIG)
  const [points, setPoints] = useState<PlanPoints>(DEFAULT_POINTS)
  const [showSettings, setShowSettings] = useState(false)
  const [sessionPrefill, setSessionPrefill] = useState<SessionPrefill | null>(null)

  useEffect(() => {
    return onSnapshot(
      doc(db, 'communities', communityId, 'config', 'plan'),
      snap => { setConfig(sanitizeConfig(snap.data())); setPoints(sanitizePoints(snap.data()?.points)) },
      () => setConfig(DEFAULT_SCHEDULE_CONFIG),
    )
  }, [communityId])

  const canConfigure = can(role, 'configureSchedule', isSuperAdmin)
  const canRemind = can(role, 'sendReminders', isSuperAdmin)
  const canCreate = can(role, 'createSessions', isSuperAdmin)
  const offset = weeksBetween(thisWeek, weekKey)
  const weekTitle = offset === 0 ? 'Săptămâna curentă' : offset === 1 ? 'Săptămâna viitoare' : offset === -1 ? 'Săptămâna trecută' : offset > 0 ? `Peste ${offset} săptămâni` : `Acum ${-offset} săptămâni`

  const sessionSlots = useMemo(() => {
    const set = new Set<string>()
    for (const t of trainings) {
      if (t.deletedAt) continue
      const s = trainingSlot(t.timeStart)
      if (s?.weekKey === weekKey) set.add(`${s.day}:${s.hour}`)
    }
    return set
  }, [trainings, weekKey])

  function scheduleAt(day: number, hour: number, availableCount?: number) {
    setSessionPrefill({ date: addDays(weekKey, day), hour, availableCount })
  }

  function scheduleDefault() {
    const today = todayKey()
    const date = weekKey === thisWeek ? addDays(today, 1) : weekKey
    setSessionPrefill({ date, hour: 18 })
  }

  const views: [View, string][] = [['mine', 'Orarul meu'], ['overview', 'Overview'], ['plan', 'Plan']]

  return (
    <div className="flex flex-col gap-3">
      {/* View switch */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 p-1 rounded-xl bg-white/5" role="tablist" aria-label="Orar">
          {views.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`flex-1 h-9 rounded-lg text-xs font-bold transition-colors ${
                view === k ? 'bg-white/10 text-white' : 'text-white/45'
              }`}>
              {label}
            </button>
          ))}
        </div>
        {canConfigure && (
          <button onClick={() => setShowSettings(v => !v)} aria-label="Setări orar" aria-expanded={showSettings}
            className={`h-11 w-11 rounded-xl border flex items-center justify-center ${showSettings ? 'border-brand-green/50 text-brand-green' : 'border-white/10 text-white/50'}`}>
            <Settings2 size={16} />
          </button>
        )}
      </div>

      <Link href={`/community/${communityId}/member/${uid}`}
        className="flex items-center gap-3 rounded-2xl px-4 py-3 active:bg-white/5" style={{ backgroundColor: 'var(--app-surface)' }}>
        <span className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-green/15"><Target size={16} className="text-brand-green" /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white">Progresul meu</span>
          <span className="block text-[11px] text-white/45">Goals, exerciții de la antrenor, jurnal, teste</span>
        </span>
        <ChevronRight size={16} className="text-white/30" />
      </Link>

      {showSettings && canConfigure && (
        <ScheduleSettings communityId={communityId} uid={uid} config={config} points={points} onClose={() => setShowSettings(false)} />
      )}

      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <button onClick={() => setWeekKey(w => addWeeks(w, -1))} aria-label="Săptămâna anterioară"
          className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-white/70 active:bg-white/10">
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => setWeekKey(thisWeek)} className="flex-1 text-center" title="Mergi la săptămâna curentă">
          <p className="text-sm font-bold text-white">{weekTitle}</p>
          <p className="text-[11px] text-white/45">{weekRangeLabel(weekKey)}</p>
        </button>
        <button onClick={() => setWeekKey(w => addWeeks(w, 1))} aria-label="Săptămâna următoare"
          className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-white/70 active:bg-white/10">
          <ChevronRight size={18} />
        </button>
      </div>

      {view === 'mine' && (
        <MyAvailability communityId={communityId} uid={uid} weekKey={weekKey} config={config} />
      )}
      {view === 'overview' && (
        <AvailabilityOverview communityId={communityId} weekKey={weekKey} config={config} canRemind={canRemind}
          sessionSlots={sessionSlots}
          onSchedule={canCreate ? cell => scheduleAt(cell.day, cell.hour) : undefined} />
      )}
      {view === 'plan' && (
        <PlanView communityId={communityId} weekKey={weekKey} trainings={trainings} members={members}
          onSchedule={canCreate ? scheduleDefault : undefined} />
      )}

      {sessionPrefill && (
        <SessionSheet communityId={communityId} prefill={sessionPrefill} defaultLocation={defaultLocation}
          onClose={() => setSessionPrefill(null)}
          onCreated={() => setView('plan')} />
      )}
    </div>
  )
}

function ScheduleSettings({ communityId, uid, config, points, onClose }: {
  communityId: string
  uid: string
  config: ScheduleConfig
  points: PlanPoints
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [start, setStart] = useState(config.startHour)
  const [end, setEnd] = useState(config.endHour)
  const [attendancePts, setAttendancePts] = useState(String(points.attendance))
  const [goalPts, setGoalPts] = useState(String(points.goalAchieved))
  const [saving, setSaving] = useState(false)
  const ptsOk = (v: string) => /^\d+$/.test(v) && +v <= MAX_POINTS
  const valid = end > start && ptsOk(attendancePts) && ptsOk(goalPts)

  async function save() {
    if (!valid) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'communities', communityId, 'config', 'plan'), {
        startHour: start,
        endHour: end,
        points: { attendance: +attendancePts, goalAchieved: +goalPts },
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      }, { merge: true })
      showToast('Setările au fost salvate', 'success')
      onClose()
    } catch {
      showToast('Nu am putut salva setările.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const selectCls = 'h-10 flex-1 rounded-xl bg-white/5 border border-white/10 text-white text-sm px-3'
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-center">
        <p className="text-sm font-bold text-white flex-1">Setări orar și antrenamente</p>
        <button onClick={onClose} aria-label="Închide" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
          <X size={13} className="text-white/50" />
        </button>
      </div>

      <p className="text-xs font-bold text-white/60">Interval orar</p>
      <div className="flex items-center gap-2">
        <select aria-label="De la ora" value={start} onChange={e => setStart(+e.target.value)} className={selectCls}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
        <span className="text-white/40">–</span>
        <select aria-label="Până la ora" value={end} onChange={e => setEnd(+e.target.value)} className={selectCls}>
          {Array.from({ length: 24 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
      </div>
      {end <= start && <p className="text-xs text-red-400">Ora de final trebuie să fie după ora de început.</p>}

      <p className="text-xs font-bold text-white/60 mt-1">Puncte în clasament</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-white/45">Prezență la antrenament</span>
          <input inputMode="numeric" value={attendancePts} onChange={e => setAttendancePts(e.target.value)} className={selectCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-white/45">Goal atins (bonus)</span>
          <input inputMode="numeric" value={goalPts} onChange={e => setGoalPts(e.target.value)} className={selectCls} />
        </label>
      </div>
      <p className="text-[11px] text-white/40">Se aplică la prezențele marcate de acum înainte. Punctele deja acordate nu se recalculează.</p>

      <button disabled={!valid || saving} onClick={() => void save()}
        className="h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-50">
        {saving ? 'Se salvează…' : 'Salvează'}
      </button>

      <div className="h-px my-1" style={{ background: 'var(--app-divider)' }} />
      <p className="text-xs font-bold text-white/60">Șabloane de antrenament</p>
      <TemplatesManager communityId={communityId} uid={uid} />
    </div>
  )
}
