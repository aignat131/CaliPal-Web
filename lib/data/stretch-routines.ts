import type { StretchExerciseType } from '@/lib/ml/stretch-detector'

export interface StretchRoutineStep {
  exercise: StretchExerciseType
  holdSeconds: number
  /** For asymmetric stretches (pigeon, front split): auto-repeat for other side */
  bilateral: boolean
}

export interface StretchRoutine {
  id: string
  name: string
  nameRO: string
  emoji: string
  description: string
  estimatedMinutes: number
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  steps: StretchRoutineStep[]
}

export const STRETCH_ROUTINES: StretchRoutine[] = [
  {
    id: 'full_body_15',
    name: 'Full Body Stretch',
    nameRO: 'Stretching complet',
    emoji: '🧘',
    description: 'Rutină completă de flexibilitate pentru tot corpul',
    estimatedMinutes: 15,
    difficulty: 'beginner',
    steps: [
      { exercise: 'forward_fold',  holdSeconds: 45, bilateral: false },
      { exercise: 'pike_stretch',  holdSeconds: 45, bilateral: false },
      { exercise: 'side_split',    holdSeconds: 60, bilateral: false },
      { exercise: 'pigeon_pose',   holdSeconds: 45, bilateral: true },
      { exercise: 'bridge',        holdSeconds: 30, bilateral: false },
    ],
  },
  {
    id: 'leg_flexibility',
    name: 'Leg Flexibility',
    nameRO: 'Flexibilitate picioare',
    emoji: '🦵',
    description: 'Focus pe mobilitatea picioarelor și spagat',
    estimatedMinutes: 20,
    difficulty: 'intermediate',
    steps: [
      { exercise: 'forward_fold',    holdSeconds: 60, bilateral: false },
      { exercise: 'pike_stretch',    holdSeconds: 60, bilateral: false },
      { exercise: 'pancake_stretch', holdSeconds: 60, bilateral: false },
      { exercise: 'front_split',     holdSeconds: 90, bilateral: true },
      { exercise: 'side_split',      holdSeconds: 90, bilateral: false },
    ],
  },
  {
    id: 'splits_focus',
    name: 'Splits Training',
    nameRO: 'Antrenament spagat',
    emoji: '✨',
    description: 'Rutină dedicată pentru spagat frontal și lateral',
    estimatedMinutes: 25,
    difficulty: 'advanced',
    steps: [
      { exercise: 'forward_fold',    holdSeconds: 45,  bilateral: false },
      { exercise: 'pigeon_pose',     holdSeconds: 60,  bilateral: true },
      { exercise: 'pike_stretch',    holdSeconds: 45,  bilateral: false },
      { exercise: 'pancake_stretch', holdSeconds: 60,  bilateral: false },
      { exercise: 'front_split',     holdSeconds: 120, bilateral: true },
      { exercise: 'side_split',      holdSeconds: 120, bilateral: false },
    ],
  },
]
