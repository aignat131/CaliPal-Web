'use client'

import { useState } from 'react'
import { Flame, Trash2, X } from 'lucide-react'
import type { WorkoutDoc, WorkoutExercise } from '@/types'
import { formatDate, formatDuration, exerciseOneLiner, circuitSummaryLine, formatCircuitRounds, circuitAverage, circuitTotal } from '../_helpers'

function workoutTitle(exercises: WorkoutExercise[]): string {
  if (exercises.length === 0) return 'Antrenament'
  if (exercises.length <= 3) return exercises.map(e => e.name).join(', ')
  return exercises.slice(0, 2).map(e => e.name).join(', ') + ` și încă ${exercises.length - 2}`
}

function computePRs(history: WorkoutDoc[]): Record<string, number> {
  const prs: Record<string, number> = {}
  for (const w of history) {
    for (const ex of w.exercises) {
      if (ex.sets.length === 0) continue
      const maxReps = Math.max(...ex.sets.map(s => s.reps ?? 0))
      if (maxReps > (prs[ex.name] ?? 0)) prs[ex.name] = maxReps
    }
  }
  return prs
}

function computeDurationPRs(history: WorkoutDoc[]): Record<string, number> {
  const prs: Record<string, number> = {}
  for (const w of history) {
    for (const ex of w.exercises) {
      if (ex.sets.length === 0) continue
      const maxSecs = Math.max(...ex.sets.map(s => s.durationSeconds ?? 0))
      if (maxSecs > 0 && maxSecs > (prs[ex.name] ?? 0)) prs[ex.name] = maxSecs
    }
  }
  return prs
}

export function WorkoutHistory({ history, loading, onDelete }: {
  history: WorkoutDoc[]
  loading: boolean
  onDelete: (id: string) => Promise<void>
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDoc | null>(null)

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="h-4 rounded-lg bg-white/8 animate-pulse mb-2 w-3/4" />
            <div className="h-3 rounded-lg bg-white/8 animate-pulse mb-3 w-1/3" />
            <div className="flex gap-4">
              <div className="h-3 rounded-lg bg-white/8 animate-pulse w-16" />
              <div className="h-3 rounded-lg bg-white/8 animate-pulse w-16" />
              <div className="h-3 rounded-lg bg-white/8 animate-pulse w-12" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-16">
        <Flame size={48} className="text-white/15 mx-auto mb-4" />
        <p className="text-white/50 font-semibold text-sm mb-1">Niciun antrenament înregistrat</p>
        <p className="text-white/30 text-xs">Apasă &ldquo;Începe antrenamentul&rdquo; pentru primul tău workout!</p>
      </div>
    )
  }

  const allTimePRs = computePRs(history)
  const allTimeDurationPRs = computeDurationPRs(history)

  async function handleDelete(id: string) {
    setDeletingId(id)
    try { await onDelete(id) } finally { setDeletingId(null) }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {history.map((w, wi) => {
          const prsBefore = computePRs(history.slice(wi + 1))
          const durationPRsBefore = computeDurationPRs(history.slice(wi + 1))
          const newPRs = w.exercises
            .flatMap(ex => {
              const results: { name: string; value: string }[] = []
              if (ex.sets.length > 0) {
                const best = Math.max(...ex.sets.map(s => s.reps ?? 0))
                if (best > 0 && best >= (allTimePRs[ex.name] ?? 0) && best > (prsBefore[ex.name] ?? 0)) {
                  results.push({ name: ex.name, value: `${best} rep` })
                }
                const bestSecs = Math.max(...ex.sets.map(s => s.durationSeconds ?? 0))
                if (bestSecs > 0 && bestSecs >= (allTimeDurationPRs[ex.name] ?? 0) && bestSecs > (durationPRsBefore[ex.name] ?? 0)) {
                  results.push({ name: ex.name, value: `${bestSecs}s` })
                }
              }
              return results
            })

          return (
            <div
              key={w.id}
              className="rounded-2xl p-4 cursor-pointer active:opacity-80 transition-opacity"
              style={{ backgroundColor: 'var(--app-surface)' }}
              onClick={() => setSelectedWorkout(w)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-sm font-bold text-white truncate">{workoutTitle(w.exercises)}</p>
                  <span className="text-xs text-white/35">{formatDate(w.createdAt)}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(w.id) }}
                  disabled={deletingId === w.id}
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                >
                  {deletingId === w.id
                    ? <div className="w-3 h-3 border border-white/30 border-t-transparent rounded-full animate-spin" />
                    : <Trash2 size={13} />}
                </button>
              </div>
              <div className="flex gap-4 mb-1.5">
                <span className="text-xs text-white/50">⏱ {formatDuration(w.durationSeconds)}</span>
                <span className="text-xs text-white/50">🔁 {w.totalReps} rep</span>
                <span className="text-xs text-white/50">🪙 +{w.coinsEarned}</span>
              </div>
              {newPRs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {newPRs.map(pr => (
                    <span key={`${pr.name}-${pr.value}`}
                      className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: '#FFB80020', color: '#FFB800', border: '1px solid #FFB80040' }}>
                      🏆 PR {pr.name} · {pr.value}
                    </span>
                  ))}
                </div>
              )}
              {w.note ? <p className="text-xs text-white/40 mt-1.5 italic">&ldquo;{w.note}&rdquo;</p> : null}
            </div>
          )
        })}
      </div>

      {/* Workout detail modal */}
      {selectedWorkout && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedWorkout(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl p-5 pb-8"
            style={{ backgroundColor: 'var(--app-bg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-base font-bold text-white">{workoutTitle(selectedWorkout.exercises)}</p>
                <span className="text-xs text-white/35">{formatDate(selectedWorkout.createdAt)}</span>
              </div>
              <button
                onClick={() => setSelectedWorkout(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {selectedWorkout.note && (
              <p className="text-[15px] text-white/90 leading-snug mb-3 whitespace-pre-line font-medium">
                &ldquo;{selectedWorkout.note}&rdquo;
              </p>
            )}

            <div className="rounded-xl border border-white/10 bg-white/4 p-3 mb-3">
              <div className="flex items-center gap-3 mb-2.5">
                <span className="text-xs font-semibold text-white/60">⏱ {formatDuration(selectedWorkout.durationSeconds)}</span>
                {selectedWorkout.totalReps > 0 && (
                  <span className="text-xs font-semibold text-white/60">🔁 {selectedWorkout.totalReps} rep</span>
                )}
                <span className="text-xs font-semibold text-white/60">🪙 +{selectedWorkout.coinsEarned}</span>
              </div>
              <div className="flex flex-col gap-1">
                {selectedWorkout.exercises.map((ex, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-brand-green/60 flex-shrink-0" />
                    <span className="text-xs text-white/70">{exerciseOneLiner(ex)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Circuits */}
            {selectedWorkout.circuits && selectedWorkout.circuits.length > 0 && (
              <div className="rounded-xl border border-brand-green/20 bg-brand-green/5 p-3 mt-3">
                <p className="text-[10px] font-bold text-brand-green/60 tracking-widest mb-2">CIRCUITE</p>
                {selectedWorkout.circuits.map((circuit, ci) => (
                  <div key={ci} className={ci > 0 ? 'mt-2 pt-2 border-t border-brand-green/10' : ''}>
                    <p className="text-xs font-bold text-white/80 mb-0.5">
                      {circuitSummaryLine(circuit, selectedWorkout.exercises)}
                    </p>
                    <p className="text-[11px] text-white/50">
                      {circuit.rounds.length} runde: {formatCircuitRounds(circuit)}
                    </p>
                    <div className="flex gap-3 text-[11px] text-white/35 mt-0.5">
                      <span>Media: {formatDuration(circuitAverage(circuit))}</span>
                      <span>Total: {formatDuration(circuitTotal(circuit))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
