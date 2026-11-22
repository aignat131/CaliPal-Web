'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import type { CommunityMember, MemberRole, PlannedTraining } from '@/types'
import { ROLE_LABELS } from '@/types'
import { can } from '@/lib/schedule/permissions'
import { callApi, apiErrorMessage } from '@/lib/schedule/client'
import { DEFAULT_POINTS, MAX_POINTS, sanitizePoints, type PlanPoints } from '@/lib/schedule/attendance'
import { MAX_TEST_METRICS, metricId, sanitizeTestConfig, type TestConfig, type TestMetric } from '@/lib/schedule/progress'
import type { MemberProgressRow, ProgressOverviewResponse } from '@/lib/schedule/overview'
import { relativeTimeRo } from '@/lib/schedule/week'
import { MemberProgress } from '../../member/[uid]/_components/MemberProgress'
import { RoleAvatar } from '../Avatars'
import { ROLE_COLORS } from '../shared'
import {
  AlertCircle, BellRing, BookOpen, ChevronRight, Dumbbell, FlaskConical, Lightbulb, RefreshCw, Search, Settings2, Target, X,
} from 'lucide-react'

type View = 'members' | 'mine'

export function ProgressTab({ communityId, uid, role, isSuperAdmin, members, trainings, myName }: {
  communityId: string
  uid: string
  role: MemberRole
  isSuperAdmin: boolean
  members: CommunityMember[]
  trainings: PlannedTraining[]
  myName: string
}) {
  const isCoach = can(role, 'viewMemberFile', isSuperAdmin)
  const canAssign = can(role, 'assignExercises', isSuperAdmin)
  const canRemind = can(role, 'sendReminders', isSuperAdmin)
  const canConfigure = can(role, 'configureProgress', isSuperAdmin)
  const [view, setView] = useState<View>(isCoach ? 'members' : 'mine')
  const [showSettings, setShowSettings] = useState(false)
  const me = members.find(m => m.userId === uid) ?? null

  const myProgress = me ? (
    <MemberProgress communityId={communityId} member={me} isOwner canAssign={canAssign}
      coachUid={uid} coachName={myName || 'Antrenor'} trainings={trainings} />
  ) : (
    <div className="h-28 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
  )

  if (!isCoach) {
    return (
      <div className="flex flex-col gap-5">
        {canRemind && <Reminders communityId={communityId} />}
        {myProgress}
      </div>
    )
  }

  const views: [View, string][] = [['members', 'Membri'], ['mine', 'Progresul meu']]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 p-1 rounded-xl bg-white/5" role="tablist" aria-label="Progress">
          {views.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`flex-1 h-9 rounded-lg text-xs font-bold transition-colors ${view === k ? 'bg-white/10 text-white' : 'text-white/45'}`}>
              {label}
            </button>
          ))}
        </div>
        {canConfigure && (
          <button onClick={() => setShowSettings(v => !v)} aria-label="Setări progres" aria-expanded={showSettings}
            className={`h-11 w-11 rounded-xl border flex items-center justify-center ${showSettings ? 'border-brand-green/50 text-brand-green' : 'border-white/10 text-white/50'}`}>
            <Settings2 size={16} />
          </button>
        )}
      </div>

      {showSettings && canConfigure && (
        <ProgressSettings communityId={communityId} uid={uid} onClose={() => setShowSettings(false)} />
      )}

      {view === 'members'
        ? <MembersOverview communityId={communityId} myUid={uid} canRemind={canRemind} />
        : <div className="flex flex-col gap-5 mt-2">{myProgress}</div>}
    </div>
  )
}

// ── Coach overview ────────────────────────────────────────────────────────────

function MembersOverview({ communityId, myUid, canRemind }: { communityId: string; myUid: string; canRemind: boolean }) {
  const [rows, setRows] = useState<MemberProgressRow[] | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [onlyAttention, setOnlyAttention] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await callApi<ProgressOverviewResponse>(`/api/community/${communityId}/progress`)
    setLoading(false)
    if (!res.ok) { setError(true); return }
    setError(false)
    setRows(res.data.members)
  }, [communityId])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? [])
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .filter(r => !onlyAttention || r.needsAttention)
  }, [rows, query, onlyAttention])

  const attentionCount = rows?.filter(r => r.needsAttention).length ?? 0

  if (!rows && loading) {
    return <div className="flex flex-col gap-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />)}</div>
  }
  if (error && !rows) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-white/50 mb-3">Nu am putut încărca progresul membrilor.</p>
        <button onClick={() => void load()} className="h-9 px-4 rounded-xl border border-white/15 text-white text-xs font-bold">Reîncearcă</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {canRemind && <Reminders communityId={communityId} />}

      <div className="flex items-center gap-2">
        <label className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2 px-3">
          <Search size={14} className="text-white/35" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Caută membru"
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/30 outline-none" />
        </label>
        <button onClick={() => void load()} aria-label="Reîncarcă"
          className="h-10 w-10 rounded-xl border border-white/10 text-white/60 flex items-center justify-center">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {attentionCount > 0 && (
        <button onClick={() => setOnlyAttention(v => !v)}
          className={`self-start h-8 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
            onlyAttention ? 'border-[#FFB800]/60 bg-[#FFB800]/10 text-[#FFB800]' : 'border-white/10 text-white/55'
          }`}>
          <AlertCircle size={12} /> Fără goals sau exerciții ({attentionCount})
        </button>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-8">Niciun membru găsit.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(r => <MemberRow key={r.uid} row={r} communityId={communityId} isMe={r.uid === myUid} />)}
        </div>
      )}
    </div>
  )
}

function MemberRow({ row: r, communityId, isMe }: { row: MemberProgressRow; communityId: string; isMe: boolean }) {
  const pct = r.exercises.expectedThisWeek > 0 ? r.exercises.doneThisWeek / r.exercises.expectedThisWeek : 0
  const firstGoal = r.activeGoals[0]
  return (
    <Link href={`/community/${communityId}/member/${r.uid}`}
      className="rounded-2xl p-3 flex gap-3 active:bg-white/5" style={{ backgroundColor: 'var(--app-surface)' }}>
      <RoleAvatar photoUrl={r.photoUrl ?? ''} name={r.name} roleColor={ROLE_COLORS[r.role] ?? 'var(--accent)'} size={40} />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-white truncate">{r.name}{isMe && <span className="text-white/40 font-normal"> (tu)</span>}</p>
          {r.role !== 'MEMBER' && <span className="text-[10px] flex-shrink-0" style={{ color: ROLE_COLORS[r.role] }}>{ROLE_LABELS[r.role]}</span>}
          <span className="ml-auto text-xs text-brand-green flex-shrink-0">{r.points} p</span>
        </div>

        <p className="text-[12px] text-white/60 truncate flex items-center gap-1">
          <Target size={11} className="text-brand-green flex-shrink-0" />
          {firstGoal ? (
            <>
              <span className="truncate">{firstGoal.skill}{firstGoal.target && <span className="text-white/40"> → {firstGoal.target}</span>}</span>
              {r.activeGoals.length > 1 && <span className="text-white/35 flex-shrink-0">+{r.activeGoals.length - 1}</span>}
            </>
          ) : <span className="text-[#FFB800]/80">Niciun goal activ</span>}
          {r.achievedGoals > 0 && <span className="text-[#E3B24C] flex-shrink-0 ml-1">🏆 {r.achievedGoals}</span>}
        </p>

        <div className="flex items-center gap-2 text-[11px] text-white/45">
          <Dumbbell size={11} className="flex-shrink-0" />
          {r.exercises.count > 0 ? (
            <>
              <span className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                <span className="block h-full bg-brand-green rounded-full" style={{ width: `${Math.round(pct * 100)}%` }} />
              </span>
              <span>{r.exercises.doneThisWeek}/{r.exercises.expectedThisWeek} săpt.</span>
            </>
          ) : <span className="text-[#FFB800]/80">Fără exerciții extra</span>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <Chip ok={r.journalThisWeek} icon={<BookOpen size={10} />} label={r.journalThisWeek ? 'Jurnal ✓' : 'Jurnal lipsă'} />
          <Chip ok={!r.testDue} icon={<FlaskConical size={10} />} label={r.testDue ? 'Test scadent' : 'Test la zi'} />
          {r.tips > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/6 text-white/45 flex items-center gap-1">
              <Lightbulb size={10} /> {r.tips} · {relativeTimeRo(r.lastTipMs)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-white/25 self-center flex-shrink-0" />
    </Link>
  )
}

function Chip({ ok, icon, label }: { ok: boolean; icon: ReactNode; label: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 ${ok ? 'bg-brand-green/10 text-brand-green/80' : 'bg-white/6 text-white/40'}`}>
      {icon}{label}
    </span>
  )
}

// ── Reminders (journal / progress test) ───────────────────────────────────────

function Reminders({ communityId }: { communityId: string }) {
  const { showToast } = useToast()
  const [sending, setSending] = useState<'journal' | 'test' | null>(null)

  async function remind(kind: 'journal' | 'test') {
    setSending(kind)
    const res = await callApi<{ sent?: number; retryAt?: number }>(`/api/community/${communityId}/remind`, { kind })
    setSending(null)
    if (res.status === 429 && res.data.retryAt) {
      showToast(`Ai trimis deja acest reminder. Poți retrimite ${relativeFuture(res.data.retryAt)}.`, 'info')
    } else if (!res.ok) {
      showToast(apiErrorMessage(res.reason), 'error')
    } else {
      const n = res.data.sent ?? 0
      showToast(n === 0 ? 'Toți membrii sunt la zi — nimeni de anunțat.' : `Reminder trimis către ${n} ${n === 1 ? 'membru' : 'membri'}`, 'success')
    }
  }

  const btn = 'flex-1 h-9 rounded-xl border border-white/10 text-white/70 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50'
  return (
    <div className="flex gap-2">
      <button onClick={() => void remind('journal')} disabled={sending !== null} className={btn}>
        <BellRing size={12} /> {sending === 'journal' ? 'Se trimite…' : 'Reminder jurnal'}
      </button>
      <button onClick={() => void remind('test')} disabled={sending !== null} className={btn}>
        <BellRing size={12} /> {sending === 'test' ? 'Se trimite…' : 'Reminder test'}
      </button>
    </div>
  )
}

function relativeFuture(ms: number): string {
  const min = Math.max(1, Math.ceil((ms - Date.now()) / 60_000))
  if (min < 60) return `în ${min} min`
  const h = Math.ceil(min / 60)
  return h === 1 ? 'într-o oră' : `în ${h} ore`
}

// ── Settings: points + progress tests ─────────────────────────────────────────

interface LegacyHours { startHour: number; endHour: number }
const DEFAULT_HOURS: LegacyHours = { startHour: 10, endHour: 24 }

/** Keep a valid stored hour range, else the old default (rules require 0 ≤ start < end ≤ 24). */
function legacyHours(data: Record<string, unknown> | undefined): LegacyHours {
  const s = data?.startHour, e = data?.endHour
  return Number.isInteger(s) && Number.isInteger(e) && (s as number) >= 0 && (e as number) <= 24 && (s as number) < (e as number)
    ? { startHour: s as number, endHour: e as number }
    : DEFAULT_HOURS
}

function ProgressSettings({ communityId, uid, onClose }: { communityId: string; uid: string; onClose: () => void }) {
  const { showToast } = useToast()
  const [loaded, setLoaded] = useState(false)
  const [points, setPoints] = useState<PlanPoints>(DEFAULT_POINTS)
  const [testCfg, setTestCfg] = useState<TestConfig>(sanitizeTestConfig(null))
  const [hours, setHours] = useState<LegacyHours>(DEFAULT_HOURS)

  useEffect(() => onSnapshot(doc(db, 'communities', communityId, 'config', 'plan'), snap => {
    setHours(legacyHours(snap.data()))
    setPoints(sanitizePoints(snap.data()?.points))
    setTestCfg(sanitizeTestConfig(snap.data()))
    setLoaded(true)
  }, () => setLoaded(true)), [communityId])

  if (!loaded) return <div className="h-40 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
  return <SettingsForm communityId={communityId} uid={uid} points={points} testCfg={testCfg} hours={hours} onClose={onClose} showToast={showToast} />
}

function SettingsForm({ communityId, uid, points, testCfg, hours, onClose, showToast }: {
  communityId: string
  uid: string
  points: PlanPoints
  testCfg: TestConfig
  hours: LegacyHours
  onClose: () => void
  showToast: ReturnType<typeof useToast>['showToast']
}) {
  const [attendancePts, setAttendancePts] = useState(String(points.attendance))
  const [goalPts, setGoalPts] = useState(String(points.goalAchieved))
  const [interval, setInterval_] = useState(testCfg.intervalWeeks)
  const [metrics, setMetrics] = useState<TestMetric[]>(testCfg.metrics)
  const [newMetric, setNewMetric] = useState('')
  const [newUnit, setNewUnit] = useState<TestMetric['unit']>('rep')
  const [saving, setSaving] = useState(false)

  function addMetric() {
    const name = newMetric.trim().slice(0, 40)
    if (!name || metrics.length >= MAX_TEST_METRICS) return
    let id = metricId(name)
    while (metrics.some(m => m.id === id)) id = `${id}_2`
    setMetrics([...metrics, { id, name, unit: newUnit }])
    setNewMetric('')
  }

  const ptsOk = (v: string) => /^\d+$/.test(v) && +v <= MAX_POINTS
  const valid = ptsOk(attendancePts) && ptsOk(goalPts) && metrics.length > 0

  async function save() {
    if (!valid) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'communities', communityId, 'config', 'plan'), {
        // Legacy hour range (Orar was removed): older deployed rules still require it.
        startHour: hours.startHour,
        endHour: hours.endHour,
        points: { attendance: +attendancePts, goalAchieved: +goalPts },
        testIntervalWeeks: interval,
        testMetrics: metrics,
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

  const fieldCls = 'h-10 flex-1 rounded-xl bg-white/5 border border-white/10 text-white text-sm px-3'
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-center">
        <p className="text-sm font-bold text-white flex-1">Setări progres</p>
        <button onClick={onClose} aria-label="Închide" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
          <X size={13} className="text-white/50" />
        </button>
      </div>

      <p className="text-xs font-bold text-white/60">Puncte în clasament</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-white/45">Prezență la antrenament</span>
          <input inputMode="numeric" value={attendancePts} onChange={e => setAttendancePts(e.target.value)} className={fieldCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-white/45">Goal atins (bonus)</span>
          <input inputMode="numeric" value={goalPts} onChange={e => setGoalPts(e.target.value)} className={fieldCls} />
        </label>
      </div>
      <p className="text-[11px] text-white/40">Se aplică de acum înainte. Punctele deja acordate nu se recalculează.</p>

      <p className="text-xs font-bold text-white/60 mt-1">Teste de progres</p>
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-white/45 flex-1">Un test la fiecare</span>
        <select value={interval} onChange={e => setInterval_(+e.target.value)} className={`${fieldCls} max-w-32`}>
          {[1, 2, 3, 4, 6, 8].map(w => <option key={w} value={w}>{w} {w === 1 ? 'săptămână' : 'săptămâni'}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {metrics.map(m => (
          <span key={m.id} className="text-[11px] pl-2.5 pr-1 py-1 rounded-full bg-white/8 text-white/75 flex items-center gap-1">
            {m.name} ({m.unit})
            <button onClick={() => setMetrics(metrics.filter(x => x.id !== m.id))} aria-label={`Elimină ${m.name}`}
              className="w-4 h-4 rounded-full flex items-center justify-center text-white/40 hover:text-red-400"><X size={10} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={newMetric} onChange={e => setNewMetric(e.target.value)} maxLength={40} placeholder="Metrică nouă (ex: Muscle-ups max)"
          className={`${fieldCls} min-w-0`} onKeyDown={e => { if (e.key === 'Enter') addMetric() }} />
        <select value={newUnit} onChange={e => setNewUnit(e.target.value as TestMetric['unit'])} className={`${fieldCls} max-w-20 flex-none`} aria-label="Unitate">
          {['rep', 'sec', 'kg', 'cm'].map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <button onClick={addMetric} disabled={!newMetric.trim()} className="h-10 px-3 rounded-xl border border-brand-green/40 text-brand-green text-sm font-bold disabled:opacity-40">+</button>
      </div>
      <p className="text-[11px] text-white/40">Eliminarea unei metrici o ascunde din grafice; valorile salvate rămân.</p>

      <button disabled={!valid || saving} onClick={() => void save()}
        className="h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-50">
        {saving ? 'Se salvează…' : 'Salvează'}
      </button>
    </div>
  )
}
