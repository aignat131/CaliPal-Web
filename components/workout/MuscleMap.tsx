'use client'

import { useMemo } from 'react'
import { computeActivation, type MuscleGroup } from '@/lib/data/musclemap'
import type { WorkoutExercise } from '@/types'

interface Props {
  exercises: WorkoutExercise[]
}

function intensityFill(intensity: number): string {
  if (intensity <= 0) return 'transparent'
  const alpha = intensity === 1 ? 0.32 : intensity === 2 ? 0.58 : intensity === 3 ? 0.78 : 0.95
  return `rgba(30,215,95,${alpha})`
}

const BODY_FILL = 'rgba(255,255,255,0.065)'
const BODY_STROKE = 'rgba(255,255,255,0.13)'
const SEP = 'rgba(255,255,255,0.08)'

// Shared silhouette paths used by both front and back views
function BodySilhouette() {
  return (
    <g fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.65" strokeLinejoin="round">
      {/* Head */}
      <ellipse cx="50" cy="14" rx="12.5" ry="13.5" />
      {/* Neck */}
      <path d="M44,26 C44,35 43,37 43,38 Q47,40 50,40 Q53,40 57,38 C57,37 56,35 56,26 Z" />
      {/* Torso */}
      <path d="M19,42 C23,58 25,74 25,90 C25,97 25,102 27,108 Q37,114 50,114 Q63,114 73,108 C75,102 75,97 75,90 C75,74 77,58 81,42 C72,37 60,36 57,38 Q50,41 43,38 C40,36 28,37 19,42 Z" />
      {/* Left upper arm */}
      <path d="M19,42 C13,46 10,60 9,74 C8,84 9,94 11,100 C13,102 15,101 17,99 C19,93 19,80 19,67 C19,55 19,44 19,42 Z" />
      {/* Right upper arm */}
      <path d="M81,42 C87,46 90,60 91,74 C92,84 91,94 89,100 C87,102 85,101 83,99 C81,93 81,80 81,67 C81,55 81,44 81,42 Z" />
      {/* Left forearm */}
      <path d="M11,100 C10,108 10,116 11,122 C12,126 15,127 17,125 C18,121 18,113 17,106 C16,101 13,99 11,100 Z" />
      {/* Right forearm */}
      <path d="M89,100 C90,108 90,116 89,122 C88,126 85,127 83,125 C82,121 82,113 83,106 C84,101 87,99 89,100 Z" />
      {/* Hips/pelvis */}
      <path d="M27,108 C23,112 21,118 23,123 C27,128 37,130 50,130 C63,130 73,128 77,123 C79,118 77,112 73,108 Q63,114 50,114 Q37,114 27,108 Z" />
      {/* Left thigh */}
      <path d="M23,123 C19,131 18,147 19,161 C20,167 23,171 27,171 C31,171 33,167 33,161 C34,147 33,131 31,123 C29,120 25,120 23,123 Z" />
      {/* Right thigh */}
      <path d="M77,123 C81,131 82,147 81,161 C80,167 77,171 73,171 C69,171 67,167 67,161 C66,147 67,131 69,123 C71,120 75,120 77,123 Z" />
      {/* Left calf */}
      <path d="M19,161 C17,167 17,181 19,192 C20,198 23,202 26,202 C29,202 31,198 31,192 C32,181 31,167 27,161 C25,159 21,159 19,161 Z" />
      {/* Right calf */}
      <path d="M81,161 C83,167 83,181 81,192 C80,198 77,202 74,202 C71,202 69,198 69,192 C68,181 69,167 73,161 C75,159 79,159 81,161 Z" />
    </g>
  )
}

// ── Front Body ─────────────────────────────────────────────────────────────────

function FrontBody({ fill }: { fill: (m: MuscleGroup) => string }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-[9px] text-white/30 mb-1 tracking-widest uppercase">Față</p>
      <svg viewBox="0 0 100 215" className="w-full max-w-[90px]" style={{ overflow: 'visible' }}>
        <defs>
          <filter id="glow-f" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <BodySilhouette />

        {/* ── Muscles ── */}
        <g filter="url(#glow-f)">
          {/* CHEST — left pec (fan shape) */}
          <path d="M27,48 C22,50 19,57 21,65 C23,71 30,75 37,75 C41,75 44,73 44,68 C45,63 44,57 41,53 C38,49 32,46 27,48 Z"
            fill={fill('chest')} />
          {/* CHEST — right pec */}
          <path d="M73,48 C78,50 81,57 79,65 C77,71 70,75 63,75 C59,75 56,73 56,68 C55,63 56,57 59,53 C62,49 68,46 73,48 Z"
            fill={fill('chest')} />
          {/* Sternum/pec separation line */}
          <line x1="50" y1="45" x2="50" y2="74" stroke={SEP} strokeWidth="0.6" />

          {/* FRONT DELTOID — left cap */}
          <path d="M19,42 C12,40 8,47 9,56 C10,63 15,67 20,66 C24,65 26,62 26,57 C26,50 24,42 19,42 Z"
            fill={fill('front_deltoid')} />
          {/* FRONT DELTOID — right cap */}
          <path d="M81,42 C88,40 92,47 91,56 C90,63 85,67 80,66 C76,65 74,62 74,57 C74,50 76,42 81,42 Z"
            fill={fill('front_deltoid')} />

          {/* BICEPS — left (two-headed elongated shape) */}
          <path d="M10,62 C7,69 6,78 7,87 C8,93 11,96 14,94 C17,92 18,83 17,74 C16,66 13,60 10,62 Z"
            fill={fill('biceps')} />
          {/* BICEPS — right */}
          <path d="M90,62 C93,69 94,78 93,87 C92,93 89,96 86,94 C83,92 82,83 83,74 C84,66 87,60 90,62 Z"
            fill={fill('biceps')} />

          {/* TRICEPS — left (partial front, behind bicep) */}
          <path d="M18,63 C21,70 22,81 20,91 C19,95 17,96 14,94 C13,90 13,80 15,70 Z"
            fill={fill('triceps')} />
          {/* TRICEPS — right */}
          <path d="M82,63 C79,70 78,81 80,91 C81,95 83,96 86,94 C87,90 87,80 85,70 Z"
            fill={fill('triceps')} />

          {/* FOREARMS — left */}
          <path d="M10,102 C9,110 9,118 11,124 C12,127 15,127 17,125 C18,121 18,113 16,106 C15,102 12,100 10,102 Z"
            fill={fill('forearms')} />
          {/* FOREARMS — right */}
          <path d="M90,102 C91,110 91,118 89,124 C88,127 85,127 83,125 C82,121 82,113 84,106 C85,102 88,100 90,102 Z"
            fill={fill('forearms')} />

          {/* CORE — upper abs pair */}
          <path d="M40,74 C38,77 38,83 40,86 C42,88 46,88 47,86 C48,84 48,78 46,74 C44,72 41,72 40,74 Z"
            fill={fill('core')} />
          <path d="M60,74 C62,77 62,83 60,86 C58,88 54,88 53,86 C52,84 52,78 54,74 C56,72 59,72 60,74 Z"
            fill={fill('core')} />
          {/* CORE — middle abs pair */}
          <path d="M40,87 C38,90 38,96 40,99 C41,101 45,101 47,99 C48,97 48,91 46,87 C44,85 41,85 40,87 Z"
            fill={fill('core')} />
          <path d="M60,87 C62,90 62,96 60,99 C59,101 55,101 53,99 C52,97 52,91 54,87 C56,85 59,85 60,87 Z"
            fill={fill('core')} />
          {/* CORE — lower abs pair */}
          <path d="M41,100 C39,103 39,108 41,111 C43,113 46,113 47,111 C48,109 48,104 46,100 C44,98 42,98 41,100 Z"
            fill={fill('core')} />
          <path d="M59,100 C61,103 61,108 59,111 C57,113 54,113 53,111 C52,109 52,104 54,100 C56,98 58,98 59,100 Z"
            fill={fill('core')} />
          {/* Abs definition lines */}
          <line x1="50" y1="74" x2="50" y2="112" stroke={SEP} strokeWidth="0.5" />
          <line x1="37" y1="86" x2="63" y2="86" stroke={SEP} strokeWidth="0.5" />
          <line x1="37" y1="99" x2="63" y2="99" stroke={SEP} strokeWidth="0.5" />

          {/* HIP FLEXORS — V-shape lower abdomen */}
          <path d="M35,111 C30,115 27,121 30,126 C33,129 40,130 50,130 C60,130 67,129 70,126 C73,121 70,115 65,111 C62,109 56,108 50,108 C44,108 38,109 35,111 Z"
            fill={fill('hip_flexors')} />

          {/* QUADRICEPS — left */}
          {/* Rectus femoris (center) */}
          <path d="M42,125 C40,133 39,149 40,162 C41,167 44,169 46,166 C48,162 48,148 47,133 C46,126 43,123 42,125 Z"
            fill={fill('quadriceps')} />
          {/* Vastus lateralis (outer) */}
          <path d="M34,126 C28,135 25,152 27,164 C29,170 32,172 34,169 C36,165 37,150 36,136 C35,128 35,124 34,126 Z"
            fill={fill('quadriceps')} />
          {/* Vastus medialis (inner teardrop near knee) */}
          <path d="M47,151 C45,158 45,165 47,169 C48,172 51,172 53,169 C55,165 54,157 51,151 C50,147 48,148 47,151 Z"
            fill={fill('quadriceps')} />
          {/* QUADRICEPS — right */}
          <path d="M58,125 C60,133 61,149 60,162 C59,167 56,169 54,166 C52,162 52,148 53,133 C54,126 57,123 58,125 Z"
            fill={fill('quadriceps')} />
          <path d="M66,126 C72,135 75,152 73,164 C71,170 68,172 66,169 C64,165 63,150 64,136 C65,128 65,124 66,126 Z"
            fill={fill('quadriceps')} />
          <path d="M53,151 C55,158 55,165 53,169 C52,172 49,172 47,169 C47,172 49,172 53,169 Z"
            fill="transparent" />

          {/* CALVES — left (front, gastrocnemius lateral head) */}
          <path d="M27,165 C24,172 22,183 24,193 C25,198 28,201 31,199 C33,197 34,187 33,176 C32,169 29,163 27,165 Z"
            fill={fill('calves')} />
          {/* CALVES — right */}
          <path d="M73,165 C76,172 78,183 76,193 C75,198 72,201 69,199 C67,197 66,187 67,176 C68,169 71,163 73,165 Z"
            fill={fill('calves')} />
        </g>
      </svg>
    </div>
  )
}

// ── Back Body ──────────────────────────────────────────────────────────────────

function BackBody({ fill }: { fill: (m: MuscleGroup) => string }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-[9px] text-white/30 mb-1 tracking-widest uppercase">Spate</p>
      <svg viewBox="0 0 100 215" className="w-full max-w-[90px]" style={{ overflow: 'visible' }}>
        <defs>
          <filter id="glow-b" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <BodySilhouette />

        <g filter="url(#glow-b)">
          {/* REAR DELTOID — left cap */}
          <path d="M19,42 C12,40 8,47 9,56 C10,63 15,67 20,66 C24,65 26,62 26,57 C26,50 24,42 19,42 Z"
            fill={fill('rear_deltoid')} />
          {/* REAR DELTOID — right cap */}
          <path d="M81,42 C88,40 92,47 91,56 C90,63 85,67 80,66 C76,65 74,62 74,57 C74,50 76,42 81,42 Z"
            fill={fill('rear_deltoid')} />
          {/* Upper trapezius stripe (shares rear_deltoid fill) */}
          <path d="M43,38 C36,38 22,42 19,50 C22,44 30,40 43,40 L50,42 L57,40 C70,40 78,44 81,50 C78,42 64,38 57,38 Z"
            fill={fill('rear_deltoid')} />

          {/* LATISSIMUS DORSI — left (wide wing) */}
          <path d="M25,55 C18,66 16,82 18,98 C20,108 25,114 31,116 C37,118 43,116 45,110 C47,104 47,92 45,78 C41,63 35,55 27,53 Z"
            fill={fill('latissimus')} />
          {/* LATISSIMUS DORSI — right */}
          <path d="M75,55 C82,66 84,82 82,98 C80,108 75,114 69,116 C63,118 57,116 55,110 C53,104 53,92 55,78 C59,63 65,55 73,53 Z"
            fill={fill('latissimus')} />

          {/* TRICEPS — left (back view, full horseshoe) */}
          <path d="M10,60 C7,68 6,80 7,92 C8,98 12,101 15,99 C18,97 18,86 17,75 C16,65 13,58 10,60 Z"
            fill={fill('triceps')} />
          {/* TRICEPS — right */}
          <path d="M90,60 C93,68 94,80 93,92 C92,98 88,101 85,99 C82,97 82,86 83,75 C84,65 87,58 90,60 Z"
            fill={fill('triceps')} />

          {/* FOREARMS — back */}
          <path d="M10,102 C9,110 9,118 11,124 C12,127 15,127 17,125 C18,121 18,113 16,106 C15,102 12,100 10,102 Z"
            fill={fill('forearms')} />
          <path d="M90,102 C91,110 91,118 89,124 C88,127 85,127 83,125 C82,121 82,113 84,106 C85,102 88,100 90,102 Z"
            fill={fill('forearms')} />

          {/* CORE — erector spinae (two columns) */}
          <path d="M40,74 C38,80 38,93 40,100 C41,104 44,105 46,103 C47,101 47,88 46,80 C45,74 41,72 40,74 Z"
            fill={fill('core')} />
          <path d="M60,74 C62,80 62,93 60,100 C59,104 56,105 54,103 C53,101 53,88 54,80 C55,74 59,72 60,74 Z"
            fill={fill('core')} />
          {/* Spine line */}
          <line x1="50" y1="38" x2="50" y2="114" stroke={SEP} strokeWidth="0.5" />

          {/* GLUTES — left */}
          <path d="M23,112 C18,118 17,128 21,136 C24,142 31,144 38,142 C44,140 46,134 45,125 C44,116 38,112 30,110 Z"
            fill={fill('glutes')} />
          {/* GLUTES — right */}
          <path d="M77,112 C82,118 83,128 79,136 C76,142 69,144 62,142 C56,140 54,134 55,125 C56,116 62,112 70,110 Z"
            fill={fill('glutes')} />
          {/* Glute crease */}
          <line x1="23" y1="126" x2="45" y2="132" stroke={SEP} strokeWidth="0.5" />
          <line x1="77" y1="126" x2="55" y2="132" stroke={SEP} strokeWidth="0.5" />

          {/* HAMSTRINGS — left (biceps femoris outer + semi inner) */}
          <path d="M33,126 C27,136 25,153 27,165 C28,170 31,172 33,170 C35,167 36,153 35,138 C34,129 34,124 33,126 Z"
            fill={fill('hamstrings')} />
          <path d="M43,128 C40,138 39,154 41,166 C42,171 45,172 47,169 C49,165 49,150 47,136 C46,128 44,125 43,128 Z"
            fill={fill('hamstrings')} />
          {/* HAMSTRINGS — right */}
          <path d="M67,126 C73,136 75,153 73,165 C72,170 69,172 67,170 C65,167 64,153 65,138 C66,129 66,124 67,126 Z"
            fill={fill('hamstrings')} />
          <path d="M57,128 C60,138 61,154 59,166 C58,171 55,172 53,169 C51,165 51,150 53,136 C54,128 56,125 57,128 Z"
            fill={fill('hamstrings')} />

          {/* CALVES — left back (gastrocnemius lateral + medial) */}
          <path d="M27,165 C23,173 21,185 23,195 C24,200 28,204 31,202 C34,199 35,188 34,177 C33,169 29,163 27,165 Z"
            fill={fill('calves')} />
          <path d="M34,167 C31,175 31,186 33,195 C35,200 38,202 40,199 C42,196 42,185 40,175 C38,168 36,164 34,167 Z"
            fill={fill('calves')} />
          {/* CALVES — right back */}
          <path d="M73,165 C77,173 79,185 77,195 C76,200 72,204 69,202 C66,199 65,188 66,177 C67,169 71,163 73,165 Z"
            fill={fill('calves')} />
          <path d="M66,167 C69,175 69,186 67,195 C65,200 62,202 60,199 C58,196 58,185 60,175 C62,168 64,164 66,167 Z"
            fill={fill('calves')} />
        </g>
      </svg>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

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

export default function MuscleMap({ exercises }: Props) {
  const activation = useMemo(() => computeActivation(exercises), [exercises])

  function fill(m: MuscleGroup): string {
    return intensityFill(activation.get(m) ?? 0)
  }

  const hasAny = activation.size > 0

  return (
    <div>
      <p className="text-[11px] font-bold text-white/40 tracking-widest mb-3">MUȘCHI ACTIVAȚI</p>
      {!hasAny ? (
        <p className="text-xs text-white/30 text-center py-4">Niciun exercițiu înregistrat.</p>
      ) : (
        <div className="flex gap-2 justify-center">
          <FrontBody fill={fill} />
          <BackBody fill={fill} />
        </div>
      )}

      {hasAny && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(Array.from(activation.entries()) as [MuscleGroup, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([m, count]) => (
              <span
                key={m}
                className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: `rgba(30,215,95,${0.07 + count * 0.06})`,
                  color: count >= 3 ? '#1ED75F' : 'rgba(30,215,95,0.72)',
                  border: `1px solid rgba(30,215,95,${count * 0.13})`,
                }}
              >
                {MUSCLE_LABELS[m]}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
