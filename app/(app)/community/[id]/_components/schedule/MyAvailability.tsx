'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp, deleteField } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import {
  resolveWeek, sanitizeWeek, setSlots, staleWeekKeys, weeksFollowingTypical, configHours,
  type AvailabilityDoc, type ScheduleConfig, type WeekMask,
} from '@/lib/schedule/availability'
import { currentWeekStart, relativeTimeRo, weekRangeLabel } from '@/lib/schedule/week'
import { AvailabilityGrid, type GridCell } from './AvailabilityGrid'
import { Check, RotateCcw, Repeat, CalendarDays } from 'lucide-react'

const SAVE_DEBOUNCE_MS = 700

interface Pending {
  typical?: WeekMask
  weeks: Record<string, WeekMask>
}

/**
 * The member's own availability editor.
 * Edits are applied to a local overlay instantly (optimistic) and written to
 * Firestore in a debounced batch; the snapshot listener is the source of truth.
 */
export function MyAvailability({ communityId, uid, weekKey, config }: {
  communityId: string
  uid: string
  weekKey: string
  config: ScheduleConfig
}) {
  const { showToast } = useToast()
  const ref = useMemo(() => doc(db, 'communities', communityId, 'availability', uid), [communityId, uid])

  const [serverDoc, setServerDoc] = useState<AvailabilityDoc | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'week' | 'typical'>('week')
  const [pending, setPending] = useState<Pending>({ weeks: {} })
  const [saving, setSaving] = useState(false)

  const pendingRef = useRef<Pending>(pending)
  const serverDocRef = useRef<AvailabilityDoc | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return onSnapshot(ref, snap => {
      const d = snap.exists() ? (snap.data() as AvailabilityDoc) : null
      serverDocRef.current = d
      setServerDoc(d)
      setLoaded(true)
    }, () => setLoaded(true))
  }, [ref])

  const updatePending = useCallback((p: Pending) => {
    pendingRef.current = p
    setPending(p)
  }, [])

  // ── Save ────────────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const sent = pendingRef.current
    if (!sent.typical && Object.keys(sent.weeks).length === 0) return

    const weeksPayload: Record<string, unknown> = { ...sent.weeks }
    for (const k of staleWeekKeys(serverDocRef.current, currentWeekStart())) {
      if (!(k in weeksPayload)) weeksPayload[k] = deleteField()
    }
    setSaving(true)
    try {
      await setDoc(ref, {
        ...(sent.typical ? { typical: sent.typical } : {}),
        weeks: weeksPayload,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    } catch (e) {
      console.error('[availability] save failed', e)
      showToast('Nu am putut salva orarul. Încearcă din nou.', 'error')
    } finally {
      // Drop only what we sent and hasn't been edited again meanwhile.
      const cur = pendingRef.current
      const weeks = { ...cur.weeks }
      for (const k of Object.keys(sent.weeks)) if (weeks[k] === sent.weeks[k]) delete weeks[k]
      updatePending({ typical: cur.typical === sent.typical ? undefined : cur.typical, weeks })
      setSaving(false)
    }
  }, [ref, showToast, updatePending])

  const queue = useCallback((patch: Pending) => {
    const cur = pendingRef.current
    updatePending({
      typical: patch.typical ?? cur.typical,
      weeks: { ...cur.weeks, ...patch.weeks },
    })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flush() }, SAVE_DEBOUNCE_MS)
  }, [flush, updatePending])

  // Flush pending edits when leaving the tab/page or hiding the app.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush() }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      void flush()
    }
  }, [flush])

  // ── View model ──────────────────────────────────────────────────────────────
  const merged: AvailabilityDoc = useMemo(() => ({
    typical: pending.typical ?? serverDoc?.typical,
    weeks: { ...(serverDoc?.weeks ?? {}), ...pending.weeks },
    updatedAt: serverDoc?.updatedAt ?? null,
  }), [serverDoc, pending])

  const thisWeek = currentWeekStart()
  const isPast = weekKey < thisWeek
  const resolved = resolveWeek(merged, weekKey)
  const typical = sanitizeWeek(merged.typical)
  const shown = mode === 'typical' ? typical : resolved.mask
  const hours = configHours(config)

  function onChange(cells: GridCell[], on: boolean) {
    if (mode === 'typical') {
      const next = setSlots(typical, cells, on)
      queue({ typical: next, weeks: weeksFollowingTypical(merged, next, thisWeek) })
    } else {
      if (isPast) return
      queue({ weeks: { [weekKey]: setSlots(resolved.mask, cells, on) } })
    }
  }

  function confirmTypical() {
    queue({ weeks: { [weekKey]: typical.slice() } })
  }

  const updatedMs = merged.updatedAt?.toMillis?.() ?? null

  if (!loaded) {
    return <div className="h-72 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Mode switch */}
      <div className="flex p-1 rounded-xl bg-white/5" role="tablist" aria-label="Ce editezi">
        {([
          { k: 'week', label: `Săptămâna ${weekRangeLabel(weekKey)}`, Icon: CalendarDays },
          { k: 'typical', label: 'Program tipic', Icon: Repeat },
        ] as const).map(({ k, label, Icon }) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
            className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              mode === k ? 'bg-brand-green text-black' : 'text-white/50'
            }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Status banner */}
      {mode === 'typical' ? (
        <Banner tone="info">
          Programul tipic se aplică automat fiecărei săptămâni noi. Săptămânile pe care le-ai personalizat nu se schimbă.
        </Banner>
      ) : isPast ? (
        <Banner tone="muted">Săptămânile trecute nu se mai pot modifica.</Banner>
      ) : resolved.source === 'none' ? (
        <Banner tone="info">
          Bifează orele în care poți veni la antrenament. Setează și un <button className="underline font-bold" onClick={() => setMode('typical')}>program tipic</button> ca să nu o iei de la zero în fiecare săptămână.
        </Banner>
      ) : !resolved.completed ? (
        <Banner tone="warn" action={
          <button onClick={confirmTypical}
            className="h-8 px-3 rounded-lg bg-brand-green text-black text-xs font-black flex items-center gap-1 flex-shrink-0">
            <Check size={13} /> Confirmă
          </button>
        }>
          Folosești programul tipic. Confirmă că e valabil și săptămâna asta sau modifică orele.
        </Banner>
      ) : resolved.customized ? (
        <Banner tone="ok" action={
          <button onClick={confirmTypical}
            className="h-8 px-3 rounded-lg border border-white/15 text-white/80 text-xs font-bold flex items-center gap-1 flex-shrink-0">
            <RotateCcw size={12} /> Program tipic
          </button>
        }>
          Orar personalizat pentru săptămâna asta.
        </Banner>
      ) : (
        <Banner tone="ok">Confirmat: programul tipic e valabil săptămâna asta.</Banner>
      )}

      <AvailabilityGrid
        mode="edit"
        weekKey={weekKey}
        hours={hours}
        isOn={(d, h) => ((shown[d] >> h) & 1) === 1}
        onChange={onChange}
        disabled={mode === 'week' && isPast}
      />

      <div className="flex items-center justify-between text-[11px] text-white/40 px-1">
        <span>Ultima actualizare: {relativeTimeRo(updatedMs)}</span>
        <span aria-live="polite">
          {saving || Object.keys(pending.weeks).length > 0 || pending.typical ? 'Se salvează…' : updatedMs ? 'Salvat ✓' : ''}
        </span>
      </div>
    </div>
  )
}

function Banner({ tone, children, action }: {
  tone: 'info' | 'warn' | 'ok' | 'muted'
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const style = {
    info: { backgroundColor: 'rgba(var(--accent-rgb), 0.08)' },
    ok: { backgroundColor: 'rgba(var(--accent-rgb), 0.12)' },
    warn: { backgroundColor: 'rgba(255, 184, 0, 0.12)' },
    muted: {},
  }[tone]
  return (
    <div className={`rounded-xl px-3 py-2.5 flex items-center gap-3 ${tone === 'muted' ? 'bg-white/5' : ''}`} style={style}>
      <p className="text-xs text-white/75 flex-1 leading-relaxed">{children}</p>
      {action}
    </div>
  )
}
