'use client'

import { useMemo } from 'react'
import { computeActivation, type MuscleGroup } from '@/lib/data/musclemap'
import type { WorkoutExercise } from '@/types'

interface Props {
  exercises: WorkoutExercise[]
}

function opacity(intensity: number): number {
  if (intensity <= 0) return 0
  if (intensity === 1) return 0.25
  if (intensity === 2) return 0.50
  if (intensity === 3) return 0.75
  return 1.0
}

const GREEN = '#1ED75F'
const BODY_FILL = 'rgba(255,255,255,0.06)'
const BODY_STROKE = 'rgba(255,255,255,0.15)'

export default function MuscleMap({ exercises }: Props) {
  const activation = useMemo(() => computeActivation(exercises), [exercises])

  function fill(m: MuscleGroup) {
    const o = opacity(activation.get(m) ?? 0)
    if (o === 0) return 'transparent'
    return `rgba(30,215,95,${o})`
  }

  const hasAny = activation.size > 0

  return (
    <div>
      <p className="text-[11px] font-bold text-white/40 tracking-widest mb-3">MUȘCHI ACTIVAȚI</p>
      {!hasAny ? (
        <p className="text-xs text-white/30 text-center py-4">Niciun exercițiu înregistrat.</p>
      ) : (
        <div className="flex gap-3">
          {/* Legend */}
          <div className="flex flex-col justify-end gap-1 pb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `rgba(30,215,95,1)` }} />
              <span className="text-[9px] text-white/40">Intens</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `rgba(30,215,95,0.5)` }} />
              <span className="text-[9px] text-white/40">Moderat</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `rgba(30,215,95,0.25)` }} />
              <span className="text-[9px] text-white/40">Ușor</span>
            </div>
          </div>

          {/* SVG bodies */}
          <div className="flex-1 flex gap-2">
            <FrontBody fill={fill} />
            <BackBody fill={fill} />
          </div>
        </div>
      )}

      {/* Active muscle labels */}
      {hasAny && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(Array.from(activation.entries()) as [MuscleGroup, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([m, count]) => (
              <span key={m} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `rgba(30,215,95,${opacity(count) * 0.3 + 0.1})`, color: GREEN }}>
                {MUSCLE_LABELS[m]}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Piept',
  triceps: 'Triceps',
  front_deltoid: 'Deltoid Ant.',
  biceps: 'Biceps',
  latissimus: 'Latissimus',
  rear_deltoid: 'Deltoid Post.',
  core: 'Core',
  hip_flexors: 'Flexori Șold',
  quadriceps: 'Cvadriceps',
  glutes: 'Fesieri',
  hamstrings: 'Ischiogambieri',
  calves: 'Gambe',
  forearms: 'Antebrațe',
}

// ── Front Body SVG ─────────────────────────────────────────────────────────────

function FrontBody({ fill }: { fill: (m: MuscleGroup) => string }) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <p className="text-[9px] text-white/30 mb-1">Față</p>
      <svg viewBox="0 0 90 200" className="w-full max-w-[80px]" style={{ overflow: 'visible' }}>
        {/* Body silhouette */}
        <g fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.8">
          {/* Head */}
          <ellipse cx="45" cy="16" rx="12" ry="13" />
          {/* Neck */}
          <rect x="39" y="27" width="12" height="10" rx="2" />
          {/* Torso */}
          <path d="M22,37 Q15,50 18,100 Q30,110 45,110 Q60,110 72,100 Q75,50 68,37 Z" />
          {/* Left arm */}
          <path d="M22,37 Q12,42 10,58 Q8,75 12,95 Q16,100 20,95 Q22,75 24,58 Q24,42 22,37 Z" />
          {/* Right arm */}
          <path d="M68,37 Q78,42 80,58 Q82,75 78,95 Q74,100 70,95 Q68,75 66,58 Q66,42 68,37 Z" />
          {/* Hips */}
          <path d="M18,100 Q18,115 24,115 Q35,118 45,118 Q55,118 66,115 Q72,115 72,100 Q60,110 45,110 Q30,110 18,100 Z" />
          {/* Left thigh */}
          <path d="M24,115 Q18,120 17,145 Q16,162 22,168 Q30,172 33,165 Q35,148 34,128 Q33,118 24,115 Z" />
          {/* Right thigh */}
          <path d="M66,115 Q72,120 73,145 Q74,162 68,168 Q60,172 57,165 Q55,148 56,128 Q57,118 66,115 Z" />
          {/* Left calf */}
          <path d="M22,168 Q18,172 18,185 Q19,197 24,200 Q29,201 32,198 Q35,195 33,182 Q32,172 33,165 Q30,172 22,168 Z" />
          {/* Right calf */}
          <path d="M68,168 Q72,172 72,185 Q71,197 66,200 Q61,201 58,198 Q55,195 57,182 Q58,172 57,165 Q60,172 68,168 Z" />
        </g>

        {/* Muscle highlights — front */}
        {/* Chest left */}
        <ellipse cx="36" cy="55" rx="9" ry="11" fill={fill('chest')} />
        {/* Chest right */}
        <ellipse cx="54" cy="55" rx="9" ry="11" fill={fill('chest')} />
        {/* Front deltoid left */}
        <ellipse cx="23" cy="45" rx="7" ry="9" fill={fill('front_deltoid')} />
        {/* Front deltoid right */}
        <ellipse cx="67" cy="45" rx="7" ry="9" fill={fill('front_deltoid')} />
        {/* Biceps left */}
        <ellipse cx="14" cy="68" rx="5" ry="11" fill={fill('biceps')} />
        {/* Biceps right */}
        <ellipse cx="76" cy="68" rx="5" ry="11" fill={fill('biceps')} />
        {/* Forearms left */}
        <ellipse cx="13" cy="87" rx="4" ry="9" fill={fill('forearms')} />
        {/* Forearms right */}
        <ellipse cx="77" cy="87" rx="4" ry="9" fill={fill('forearms')} />
        {/* Triceps left (partial front view) */}
        <ellipse cx="19" cy="68" rx="4" ry="10" fill={fill('triceps')} />
        {/* Triceps right */}
        <ellipse cx="71" cy="68" rx="4" ry="10" fill={fill('triceps')} />
        {/* Core */}
        <ellipse cx="45" cy="80" rx="10" ry="13" fill={fill('core')} />
        {/* Hip flexors */}
        <ellipse cx="45" cy="98" rx="13" ry="8" fill={fill('hip_flexors')} />
        {/* Quads left */}
        <ellipse cx="27" cy="138" rx="8" ry="19" fill={fill('quadriceps')} />
        {/* Quads right */}
        <ellipse cx="63" cy="138" rx="8" ry="19" fill={fill('quadriceps')} />
        {/* Calves left */}
        <ellipse cx="25" cy="182" rx="6" ry="12" fill={fill('calves')} />
        {/* Calves right */}
        <ellipse cx="65" cy="182" rx="6" ry="12" fill={fill('calves')} />
      </svg>
    </div>
  )
}

// ── Back Body SVG ──────────────────────────────────────────────────────────────

function BackBody({ fill }: { fill: (m: MuscleGroup) => string }) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <p className="text-[9px] text-white/30 mb-1">Spate</p>
      <svg viewBox="0 0 90 200" className="w-full max-w-[80px]" style={{ overflow: 'visible' }}>
        {/* Body silhouette (back view — same shape) */}
        <g fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.8">
          <ellipse cx="45" cy="16" rx="12" ry="13" />
          <rect x="39" y="27" width="12" height="10" rx="2" />
          <path d="M22,37 Q15,50 18,100 Q30,110 45,110 Q60,110 72,100 Q75,50 68,37 Z" />
          <path d="M22,37 Q12,42 10,58 Q8,75 12,95 Q16,100 20,95 Q22,75 24,58 Q24,42 22,37 Z" />
          <path d="M68,37 Q78,42 80,58 Q82,75 78,95 Q74,100 70,95 Q68,75 66,58 Q66,42 68,37 Z" />
          <path d="M18,100 Q18,115 24,115 Q35,118 45,118 Q55,118 66,115 Q72,115 72,100 Q60,110 45,110 Q30,110 18,100 Z" />
          <path d="M24,115 Q18,120 17,145 Q16,162 22,168 Q30,172 33,165 Q35,148 34,128 Q33,118 24,115 Z" />
          <path d="M66,115 Q72,120 73,145 Q74,162 68,168 Q60,172 57,165 Q55,148 56,128 Q57,118 66,115 Z" />
          <path d="M22,168 Q18,172 18,185 Q19,197 24,200 Q29,201 32,198 Q35,195 33,182 Q32,172 33,165 Q30,172 22,168 Z" />
          <path d="M68,168 Q72,172 72,185 Q71,197 66,200 Q61,201 58,198 Q55,195 57,182 Q58,172 57,165 Q60,172 68,168 Z" />
        </g>

        {/* Muscle highlights — back */}
        {/* Rear deltoid left */}
        <ellipse cx="23" cy="45" rx="7" ry="9" fill={fill('rear_deltoid')} />
        {/* Rear deltoid right */}
        <ellipse cx="67" cy="45" rx="7" ry="9" fill={fill('rear_deltoid')} />
        {/* Latissimus left */}
        <ellipse cx="28" cy="65" rx="9" ry="20" fill={fill('latissimus')} />
        {/* Latissimus right */}
        <ellipse cx="62" cy="65" rx="9" ry="20" fill={fill('latissimus')} />
        {/* Triceps left */}
        <ellipse cx="13" cy="68" rx="5" ry="13" fill={fill('triceps')} />
        {/* Triceps right */}
        <ellipse cx="77" cy="68" rx="5" ry="13" fill={fill('triceps')} />
        {/* Forearms left */}
        <ellipse cx="13" cy="87" rx="4" ry="9" fill={fill('forearms')} />
        {/* Forearms right */}
        <ellipse cx="77" cy="87" rx="4" ry="9" fill={fill('forearms')} />
        {/* Core / lower back */}
        <ellipse cx="45" cy="83" rx="8" ry="14" fill={fill('core')} />
        {/* Glutes */}
        <ellipse cx="37" cy="107" rx="12" ry="10" fill={fill('glutes')} />
        <ellipse cx="53" cy="107" rx="12" ry="10" fill={fill('glutes')} />
        {/* Hamstrings left */}
        <ellipse cx="27" cy="138" rx="8" ry="19" fill={fill('hamstrings')} />
        {/* Hamstrings right */}
        <ellipse cx="63" cy="138" rx="8" ry="19" fill={fill('hamstrings')} />
        {/* Calves back left */}
        <ellipse cx="25" cy="182" rx="6" ry="12" fill={fill('calves')} />
        {/* Calves back right */}
        <ellipse cx="65" cy="182" rx="6" ry="12" fill={fill('calves')} />
      </svg>
    </div>
  )
}
