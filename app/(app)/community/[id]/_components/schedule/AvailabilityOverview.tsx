'use client'

import { useEffect, useMemo, useState } from 'react'
import { auth } from '@/lib/firebase/auth'
import { useAvailabilityOverview } from './useAvailabilityOverview'
import { useToast } from '@/lib/context/ToastContext'
import type { AvailabilityMemberRow } from '@/lib/schedule/api-types'
import {
  computeHeatmap, configHours, topSlots, type ScheduleConfig,
} from '@/lib/schedule/availability'
import { DAY_NAMES, relativeTimeRo, slotLabel, weekDays, weekRangeLabel } from '@/lib/schedule/week'
import { ROLE_LABELS } from '@/types'
import { AvailabilityGrid, type GridCell } from './AvailabilityGrid'
import { RoleAvatar } from '../Avatars'
import { ROLE_COLORS } from '../shared'
import { BellRing, Filter, RefreshCw, Trophy, X, Check, Clock, CalendarPlus } from 'lucide-react'

export function AvailabilityOverview({ communityId, weekKey, config, canRemind, onSchedule, sessionSlots }: {
  communityId: string
  weekKey: string
  config: ScheduleConfig
  canRemind: boolean
  /** Present when the viewer can create sessions. */
  onSchedule?: (cell: GridCell) => void
  /** "day:hour" keys of slots that already have a session this week. */
  sessionSlots?: Set<string>
}) {
  const { showToast } = useToast()
  const { data, loading, error, reload: load } = useAvailabilityOverview(communityId, weekKey)
  const [selected, setSelected] = useState<GridCell | null>(null)
  const [filter, setFilter] = useState<Set<string> | null>(null) // null = toți
  const [showFilter, setShowFilter] = useState(false)
  const [reminding, setReminding] = useState(false)

  useEffect(() => { setSelected(null) }, [weekKey])

  const hours = configHours(config)
  const rows = data?.members ?? null
  const filteredRows = useMemo(
    () => rows ? rows.filter(r => !filter || filter.has(r.uid)) : null,
    [rows, filter],
  )

  // Staff: recompute client-side so the filter applies. Members: server counts.
  const heat = useMemo(() => {
    if (filteredRows) return computeHeatmap(filteredRows.map(r => ({ uid: r.uid, mask: r.mask })), config)
    if (data) return { counts: data.counts, uids: null, respondents: data.respondents, max: 0 }
    return null
  }, [filteredRows, data, config])

  const top = useMemo(() => heat ? topSlots(heat.counts, config, 5) : [], [heat, config])
  const byUid = useMemo(() => new Map((rows ?? []).map(r => [r.uid, r])), [rows])

  async function sendReminder(uids: string[] | null, kind: 'availability' | 'journal' | 'test' = 'availability') {
    if (uids && !uids.length) return
    setReminding(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/community/${communityId}/availability/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ week: weekKey, kind, ...(uids ? { uids } : {}) }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 429 && json.retryAt) {
        showToast(`Ai trimis deja un reminder. Poți retrimite ${relativeFuture(json.retryAt)}.`, 'info')
      } else if (!res.ok) {
        throw new Error(String(res.status))
      } else {
        showToast(json.sent === 0 ? 'Toți membrii sunt la zi — nimeni de anunțat.' : `Reminder trimis către ${json.sent} ${json.sent === 1 ? 'membru' : 'membri'}`, 'success')
      }
    } catch {
      showToast('Nu am putut trimite reminder-ul.', 'error')
    } finally {
      setReminding(false)
    }
  }

  if (loading && !data) {
    return <div className="h-72 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
  }
  if (error || !data || !heat) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-white/50 mb-3">Nu am putut încărca disponibilitatea.</p>
        <button onClick={() => void load()} className="h-9 px-4 rounded-xl border border-white/15 text-white text-xs font-bold">Reîncearcă</button>
      </div>
    )
  }

  const totalShown = filteredRows ? filteredRows.length : null
  const days = weekDays(weekKey)
  const selCount = selected ? heat.counts[selected.day][selected.hour] : 0
  const selUids = selected && heat.uids ? heat.uids[selected.day][selected.hour] : []

  const completed = filteredRows?.filter(r => r.completed) ?? []
  const notCompleted = filteredRows?.filter(r => !r.completed) ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* Summary + actions */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-white/50 flex-1">
          <span className="text-white font-bold">{heat.respondents}</span>
          {totalShown !== null ? ` din ${totalShown}` : ''} membri și-au setat orarul
        </p>
        {rows && (
          <button onClick={() => setShowFilter(v => !v)}
            className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 border ${
              filter ? 'border-brand-green/50 text-brand-green' : 'border-white/10 text-white/60'
            }`}>
            <Filter size={12} /> {filter ? `Filtru (${filter.size})` : 'Filtru'}
          </button>
        )}
        <button onClick={() => void load()} aria-label="Reîncarcă"
          className="h-8 w-8 rounded-lg border border-white/10 text-white/60 flex items-center justify-center">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {showFilter && rows && (
        <MemberFilter rows={rows} value={filter} onChange={setFilter} onClose={() => setShowFilter(false)} />
      )}

      <AvailabilityGrid
        mode="heat"
        weekKey={weekKey}
        hours={hours}
        count={(d, h) => heat.counts[d][h]}
        respondents={heat.respondents}
        selected={selected}
        onSelect={setSelected}
        marked={sessionSlots ? (d, h) => sessionSlots.has(`${d}:${h}`) : undefined}
      />

      {/* Selected cell detail */}
      {selected && (
        <div className="rounded-2xl p-3" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-bold text-white flex-1">
              {days[selected.day].name} {days[selected.day].dayMonth} · {slotLabel(selected.hour)}
            </p>
            <button onClick={() => setSelected(null)} aria-label="Închide" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
              <X size={13} className="text-white/50" />
            </button>
          </div>
          <p className="text-xs text-white/50 mb-2">
            {selCount} din {heat.respondents} {heat.respondents === 1 ? 'membru poate' : 'membri pot'}
            {sessionSlots?.has(`${selected.day}:${selected.hour}`) && ' · are deja un antrenament programat'}
          </p>
          {onSchedule && (
            <button onClick={() => onSchedule(selected)}
              className="w-full h-10 mb-3 rounded-xl bg-brand-green text-black text-sm font-black flex items-center justify-center gap-1.5">
              <CalendarPlus size={15} /> Programează antrenament
            </button>
          )}
          {heat.uids && (
            selUids.length === 0
              ? <p className="text-xs text-white/35">Nimeni nu e disponibil.</p>
              : <div className="flex flex-wrap gap-1.5">
                  {selUids.map(uid => {
                    const r = byUid.get(uid)
                    return (
                      <span key={uid} className="text-xs px-2 py-1 rounded-full bg-white/8 text-white/80">
                        {r?.name ?? 'Membru'}
                      </span>
                    )
                  })}
                </div>
          )}
        </div>
      )}

      {/* Top 5 */}
      <section>
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1 flex items-center gap-1">
          <Trophy size={11} /> TOP 5 INTERVALE
        </p>
        {top.length === 0 ? (
          <p className="text-xs text-white/40 px-1">Încă nu și-a setat nimeni orarul pentru săptămâna asta.</p>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
            {top.map((s, i) => (
              <button key={`${s.day}-${s.hour}`} onClick={() => setSelected({ day: s.day, hour: s.hour })}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5 relative">
                {i < top.length - 1 && <span className="absolute bottom-0 right-0 left-12 h-px" style={{ background: 'var(--app-divider)' }} />}
                <span className="w-6 text-center text-[13px] font-bold text-white/40">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-white">{DAY_NAMES[s.day]} {days[s.day].dayMonth}</p>
                  <p className="text-[12px] text-white/45">{slotLabel(s.hour)}</p>
                </div>
                <div className="flex flex-col items-end leading-tight">
                  <span className="text-[17px] font-medium text-brand-green">{s.count}</span>
                  <span className="text-[11px] text-white/25">din {heat.respondents}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Completion status — staff only */}
      {filteredRows && (
        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <p className="text-[10px] font-bold text-white/35 tracking-widest flex-1">
              STATUS COMPLETARE · {completed.length}/{filteredRows.length}
            </p>
            {canRemind && notCompleted.length > 0 && (
              <button disabled={reminding} onClick={() => void sendReminder(notCompleted.map(r => r.uid))}
                className="h-8 px-3 rounded-lg bg-brand-green text-black text-xs font-black flex items-center gap-1 disabled:opacity-50">
                <BellRing size={12} /> {reminding ? 'Se trimite…' : `Trimite reminder (${notCompleted.length})`}
              </button>
            )}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
            {[...notCompleted, ...completed].map((r, i, arr) => (
              <MemberStatusRow key={r.uid} row={r} last={i === arr.length - 1} />
            ))}
          </div>
          <p className="text-[11px] text-white/30 mt-2 px-1">
            „Completat” = membrul a confirmat sau a personalizat orarul pentru săptămâna selectată.
          </p>
        </section>
      )}

      {canRemind && (
        <section>
          <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">ALTE REMINDERE</p>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={reminding} onClick={() => void sendReminder(filteredRows ? filteredRows.map(r => r.uid) : null, 'journal')}
              className="h-auto py-2.5 px-3 rounded-xl text-left disabled:opacity-50" style={{ backgroundColor: 'var(--app-surface)' }}>
              <span className="block text-xs font-bold text-white">📓 Jurnal</span>
              <span className="block text-[11px] text-white/45">cine n-a completat {weekRangeLabel(weekKey)}</span>
            </button>
            <button disabled={reminding} onClick={() => void sendReminder(filteredRows ? filteredRows.map(r => r.uid) : null, 'test')}
              className="h-auto py-2.5 px-3 rounded-xl text-left disabled:opacity-50" style={{ backgroundColor: 'var(--app-surface)' }}>
              <span className="block text-xs font-bold text-white">💪 Test de progres</span>
              <span className="block text-[11px] text-white/45">cui îi e scadent testul</span>
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function MemberStatusRow({ row, last }: { row: AvailabilityMemberRow; last: boolean }) {
  const roleColor = ROLE_COLORS[row.role] ?? 'var(--accent)'
  const status = row.completed
    ? { label: row.customized ? 'Personalizat' : 'Confirmat', cls: 'text-brand-green', Icon: Check }
    : row.source === 'typical'
      ? { label: 'Doar program tipic', cls: 'text-[#FFB800]', Icon: Clock }
      : { label: 'Necompletat', cls: 'text-white/35', Icon: X }
  return (
    <div className="relative flex items-center gap-3 px-4" style={{ minHeight: 60 }}>
      {!last && <span className="absolute bottom-0 right-0 h-px" style={{ left: 64, background: 'var(--app-divider)' }} />}
      <RoleAvatar photoUrl={row.photoUrl ?? ''} name={row.name} roleColor={roleColor} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-white truncate">{row.name}</p>
        <p className="text-[11.5px] text-white/40">
          {ROLE_LABELS[row.role]} · actualizat {relativeTimeRo(row.updatedAt)}
        </p>
      </div>
      <span className={`text-[11.5px] font-bold flex items-center gap-1 flex-shrink-0 ${status.cls}`}>
        <status.Icon size={12} /> {status.label}
      </span>
    </div>
  )
}

function MemberFilter({ rows, value, onChange, onClose }: {
  rows: AvailabilityMemberRow[]
  value: Set<string> | null
  onChange: (v: Set<string> | null) => void
  onClose: () => void
}) {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ro'))
  const isOn = (uid: string) => !value || value.has(uid)
  function toggle(uid: string) {
    const next = new Set(value ?? rows.map(r => r.uid))
    if (next.has(uid)) next.delete(uid); else next.add(uid)
    onChange(next.size === rows.length ? null : next)
  }
  return (
    <div className="rounded-2xl p-3" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-bold text-white flex-1">Arată doar membrii selectați</p>
        <button onClick={() => onChange(null)} className="text-xs font-bold text-brand-green">Toți</button>
        <button onClick={() => onChange(new Set())} className="text-xs font-bold text-white/50">Niciunul</button>
        <button onClick={onClose} aria-label="Închide filtrul" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
          <X size={13} className="text-white/50" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
        {sorted.map(r => (
          <button key={r.uid} onClick={() => toggle(r.uid)} aria-pressed={isOn(r.uid)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              isOn(r.uid) ? 'border-brand-green/50 text-brand-green bg-brand-green/10' : 'border-white/10 text-white/40'
            }`}>
            {r.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function relativeFuture(ms: number): string {
  const min = Math.max(1, Math.ceil((ms - Date.now()) / 60_000))
  if (min < 60) return `în ${min} min`
  const h = Math.ceil(min / 60)
  return h === 1 ? 'într-o oră' : `în ${h} ore`
}
