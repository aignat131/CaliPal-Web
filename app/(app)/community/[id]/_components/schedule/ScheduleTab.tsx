'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import type { MemberRole } from '@/types'
import { can } from '@/lib/schedule/permissions'
import { DEFAULT_SCHEDULE_CONFIG, sanitizeConfig, type ScheduleConfig } from '@/lib/schedule/availability'
import { addWeeks, currentWeekStart, weekRangeLabel, weeksBetween } from '@/lib/schedule/week'
import { MyAvailability } from './MyAvailability'
import { AvailabilityOverview } from './AvailabilityOverview'
import { ChevronLeft, ChevronRight, Settings2, X } from 'lucide-react'

type View = 'mine' | 'overview'

export function ScheduleTab({ communityId, uid, role, isSuperAdmin }: {
  communityId: string
  uid: string
  role: MemberRole
  isSuperAdmin: boolean
}) {
  const thisWeek = currentWeekStart()
  const [weekKey, setWeekKey] = useState(thisWeek)
  const [view, setView] = useState<View>('mine')
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_SCHEDULE_CONFIG)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    return onSnapshot(
      doc(db, 'communities', communityId, 'config', 'plan'),
      snap => setConfig(sanitizeConfig(snap.data())),
      () => setConfig(DEFAULT_SCHEDULE_CONFIG),
    )
  }, [communityId])

  const canConfigure = can(role, 'configureSchedule', isSuperAdmin)
  const canRemind = can(role, 'sendReminders', isSuperAdmin)
  const offset = weeksBetween(thisWeek, weekKey)
  const weekTitle = offset === 0 ? 'Săptămâna curentă' : offset === 1 ? 'Săptămâna viitoare' : offset === -1 ? 'Săptămâna trecută' : offset > 0 ? `Peste ${offset} săptămâni` : `Acum ${-offset} săptămâni`

  return (
    <div className="flex flex-col gap-3">
      {/* View switch */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 p-1 rounded-xl bg-white/5" role="tablist" aria-label="Orar">
          {([['mine', 'Disponibilitatea mea'], ['overview', 'Overview']] as const).map(([k, label]) => (
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

      {showSettings && canConfigure && (
        <ScheduleSettings communityId={communityId} uid={uid} config={config} onClose={() => setShowSettings(false)} />
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

      {view === 'mine' ? (
        <MyAvailability communityId={communityId} uid={uid} weekKey={weekKey} config={config} />
      ) : (
        <AvailabilityOverview communityId={communityId} weekKey={weekKey} config={config} canRemind={canRemind} />
      )}
    </div>
  )
}

function ScheduleSettings({ communityId, uid, config, onClose }: {
  communityId: string
  uid: string
  config: ScheduleConfig
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [start, setStart] = useState(config.startHour)
  const [end, setEnd] = useState(config.endHour)
  const [saving, setSaving] = useState(false)
  const valid = end > start

  async function save() {
    if (!valid) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'communities', communityId, 'config', 'plan'), {
        startHour: start,
        endHour: end,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      }, { merge: true })
      showToast('Intervalul orar a fost salvat', 'success')
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
        <p className="text-sm font-bold text-white flex-1">Interval orar al comunității</p>
        <button onClick={onClose} aria-label="Închide" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
          <X size={13} className="text-white/50" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select aria-label="De la ora" value={start} onChange={e => setStart(+e.target.value)} className={selectCls}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
        <span className="text-white/40">–</span>
        <select aria-label="Până la ora" value={end} onChange={e => setEnd(+e.target.value)} className={selectCls}>
          {Array.from({ length: 24 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
      </div>
      {!valid && <p className="text-xs text-red-400">Ora de final trebuie să fie după ora de început.</p>}
      <p className="text-[11px] text-white/40">Orele bifate în afara intervalului se păstrează, doar nu mai apar în grilă.</p>
      <button disabled={!valid || saving} onClick={() => void save()}
        className="h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-50">
        {saving ? 'Se salvează…' : 'Salvează'}
      </button>
    </div>
  )
}
