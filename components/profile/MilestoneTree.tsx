'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Lock } from 'lucide-react'
import {
  MILESTONE_TREE, TOTAL_MILESTONES, branchProgress, sanitizeMilestones, type MilestoneBranch, type MilestoneMap,
} from '@/lib/milestones/tree'

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * The calisthenics milestone tree: one card per branch, steps in order.
 * Editable on the user's own profile (tap a step to tick / untick it).
 */
export function MilestoneTree({ milestones, editable, onToggle }: {
  milestones: Record<string, number> | undefined
  editable: boolean
  onToggle?: (id: string, done: boolean) => Promise<void>
}) {
  const done = useMemo(() => sanitizeMilestones(milestones), [milestones])
  const total = Object.keys(done).length
  const pct = Math.round((total / TOTAL_MILESTONES) * 100)

  // Open the branches the user is working on by default.
  const [open, setOpen] = useState<Set<string>>(() => {
    const started = MILESTONE_TREE.filter(b => {
      const p = branchProgress(b, done)
      return p.done > 0 && p.next
    }).map(b => b.id)
    return new Set(started.length ? started.slice(0, 2) : editable ? [MILESTONE_TREE[0].id] : [])
  })

  function toggleOpen(id: string) {
    setOpen(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="app-card">
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-sm font-bold text-white">Milestone-uri</p>
            <p className="text-[11px] text-white/45">
              {editable ? 'Bifează ce ai reușit. Pașii sunt în ordine, de la ușor la greu.' : 'Progresul în calisthenics'}
            </p>
          </div>
          <p className="text-right leading-tight">
            <span className="text-xl font-black text-brand-green">{total}</span>
            <span className="text-xs text-white/40"> / {TOTAL_MILESTONES}</span>
          </p>
        </div>
        <div className="h-2 rounded-full bg-white/8 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {MILESTONE_TREE.map(b => (
        <BranchCard key={b.id} branch={b} done={done} open={open.has(b.id)} onToggleOpen={() => toggleOpen(b.id)}
          editable={editable} onToggle={onToggle} />
      ))}
    </div>
  )
}

function BranchCard({ branch: b, done, open, onToggleOpen, editable, onToggle }: {
  branch: MilestoneBranch
  done: MilestoneMap
  open: boolean
  onToggleOpen: () => void
  editable: boolean
  onToggle?: (id: string, done: boolean) => Promise<void>
}) {
  const p = branchProgress(b, done)
  const [busy, setBusy] = useState<string | null>(null)
  const complete = p.next === null

  async function tap(id: string) {
    if (!editable || !onToggle || busy) return
    const isDone = !!done[id]
    if (isDone && !confirm('Debifezi acest milestone?')) return
    setBusy(id)
    try { await onToggle(id, !isDone) } finally { setBusy(null) }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
      <button onClick={onToggleOpen} aria-expanded={open} className="w-full flex items-center gap-3 p-3.5 text-left">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: `${b.color}22` }}>{b.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{b.name}</span>
            {complete && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${b.color}26`, color: b.color }}>COMPLET</span>}
          </span>
          <span className="block h-1.5 rounded-full bg-white/8 overflow-hidden mt-1.5">
            <span className="block h-full rounded-full transition-all" style={{ width: `${(p.done / p.total) * 100}%`, backgroundColor: b.color }} />
          </span>
          <span className="block text-[11px] text-white/45 mt-1 truncate">
            {complete ? 'Toate milestone-urile atinse 🏆' : <>Următorul: <span className="text-white/70">{p.next!.name}</span>{p.next!.target && ` · ${p.next!.target}`}</>}
          </span>
        </span>
        <span className="text-xs font-bold text-white/50 flex-shrink-0">{p.done}/{p.total}</span>
        <ChevronDown size={16} className={`text-white/30 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ol className="px-3.5 pb-3.5">
          {b.steps.map((s, i) => {
            const isDone = !!done[s.id]
            const isNext = p.next?.id === s.id
            const lastStep = i === b.steps.length - 1
            const lineDone = isDone && !!done[b.steps[i + 1]?.id]
            const Row = editable ? 'button' : 'div'
            return (
              <li key={s.id} className="relative flex gap-3">
                {/* connector */}
                {!lastStep && (
                  <span className="absolute left-[13px] top-7 bottom-0 w-0.5"
                    style={{ backgroundColor: lineDone ? b.color : 'rgba(255,255,255,0.1)' }} aria-hidden />
                )}
                <Row
                  {...(editable ? { onClick: () => void tap(s.id), disabled: busy !== null, 'aria-pressed': isDone } : {})}
                  className={`relative flex items-start gap-3 w-full text-left py-1.5 ${editable ? 'active:opacity-70' : ''}`}>
                  <span className={`relative z-[1] w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${busy === s.id ? 'animate-pulse' : ''}`}
                    style={isDone
                      ? { backgroundColor: b.color, borderColor: b.color }
                      : isNext
                        ? { backgroundColor: 'var(--app-surface)', borderColor: b.color }
                        : { backgroundColor: 'var(--app-surface)', borderColor: 'rgba(255,255,255,0.15)' }}>
                    {isDone
                      ? <Check size={14} className="text-black" strokeWidth={3} />
                      : isNext
                        ? <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                        : <Lock size={10} className="text-white/25" />}
                  </span>
                  <span className="flex-1 min-w-0 pb-2">
                    <span className={`block text-[13px] font-semibold ${isDone ? 'text-white' : isNext ? 'text-white/90' : 'text-white/45'}`}>
                      {s.name}
                    </span>
                    <span className="block text-[11px] text-white/40">
                      {s.target}
                      {isDone && <span style={{ color: b.color }}> · {shortDate(done[s.id])}</span>}
                      {isNext && editable && <span style={{ color: b.color }}> · apasă când reușești</span>}
                    </span>
                  </span>
                </Row>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
