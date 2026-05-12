// Muscle group identifiers
export type MuscleGroup =
  | 'chest'
  | 'triceps'
  | 'front_deltoid'
  | 'biceps'
  | 'latissimus'
  | 'rear_deltoid'
  | 'core'
  | 'hip_flexors'
  | 'quadriceps'
  | 'glutes'
  | 'hamstrings'
  | 'calves'
  | 'forearms'

/** Maps exercise categories to primary muscle groups */
export const CATEGORY_MUSCLE_MAP: Record<string, MuscleGroup[]> = {
  'Împingeri':   ['chest', 'triceps', 'front_deltoid'],
  'Trageri':     ['latissimus', 'biceps', 'rear_deltoid'],
  'Core':        ['core', 'hip_flexors'],
  'Picioare':    ['quadriceps', 'glutes', 'hamstrings', 'calves'],
  'Statice':     ['core', 'latissimus', 'triceps', 'front_deltoid'],
  'Cardio':      ['quadriceps', 'glutes', 'hamstrings', 'core'],
  'Cu Greutate': ['chest', 'triceps', 'biceps', 'latissimus', 'quadriceps'],
  'Cu Bandă':    ['biceps', 'latissimus', 'rear_deltoid', 'chest'],
  'Altele':      ['core'],
}

/** Per-exercise overrides (match by substring of normalized name) */
const NAME_OVERRIDES: Array<{ pattern: string; muscles: MuscleGroup[] }> = [
  { pattern: 'flotari',       muscles: ['chest', 'triceps', 'front_deltoid'] },
  { pattern: 'push-up',       muscles: ['chest', 'triceps', 'front_deltoid'] },
  { pattern: 'pushup',        muscles: ['chest', 'triceps', 'front_deltoid'] },
  { pattern: 'one-arm push',  muscles: ['chest', 'triceps', 'front_deltoid'] },
  { pattern: 'dips',          muscles: ['triceps', 'chest', 'front_deltoid'] },
  { pattern: 'pike push',     muscles: ['front_deltoid', 'triceps'] },
  { pattern: 'handstand push',muscles: ['front_deltoid', 'triceps', 'core'] },
  { pattern: 'diamond',       muscles: ['triceps', 'chest'] },
  { pattern: 'tractiuni',     muscles: ['latissimus', 'biceps', 'rear_deltoid'] },
  { pattern: 'pull-up',       muscles: ['latissimus', 'biceps', 'rear_deltoid'] },
  { pattern: 'chin-up',       muscles: ['biceps', 'latissimus'] },
  { pattern: 'australian',    muscles: ['latissimus', 'biceps', 'rear_deltoid'] },
  { pattern: 'muscle-up',     muscles: ['latissimus', 'triceps', 'chest', 'biceps'] },
  { pattern: 'chest-to-bar',  muscles: ['latissimus', 'biceps', 'rear_deltoid'] },
  { pattern: 'one-arm pull',  muscles: ['latissimus', 'biceps', 'core'] },
  { pattern: 'typewriter',    muscles: ['latissimus', 'biceps', 'core'] },
  { pattern: 'squat',         muscles: ['quadriceps', 'glutes', 'hamstrings'] },
  { pattern: 'lunges',        muscles: ['quadriceps', 'glutes', 'hamstrings'] },
  { pattern: 'pistol',        muscles: ['quadriceps', 'glutes', 'hamstrings'] },
  { pattern: 'box jump',      muscles: ['quadriceps', 'glutes', 'calves'] },
  { pattern: 'calf',          muscles: ['calves'] },
  { pattern: 'l-sit',         muscles: ['core', 'hip_flexors', 'triceps'] },
  { pattern: 'v-sit',         muscles: ['core', 'hip_flexors'] },
  { pattern: 'plank',         muscles: ['core'] },
  { pattern: 'hollow',        muscles: ['core', 'hip_flexors'] },
  { pattern: 'arch body',     muscles: ['glutes', 'hamstrings', 'rear_deltoid'] },
  { pattern: 'dragon flag',   muscles: ['core', 'hip_flexors'] },
  { pattern: 'leg raises',    muscles: ['core', 'hip_flexors'] },
  { pattern: 'front lever',   muscles: ['latissimus', 'core', 'biceps'] },
  { pattern: 'back lever',    muscles: ['latissimus', 'rear_deltoid', 'glutes'] },
  { pattern: 'planche',       muscles: ['chest', 'front_deltoid', 'triceps', 'core'] },
  { pattern: 'handstand',     muscles: ['front_deltoid', 'triceps', 'core'] },
  { pattern: 'human flag',    muscles: ['latissimus', 'core', 'front_deltoid'] },
  { pattern: 'manna',         muscles: ['core', 'hip_flexors', 'triceps'] },
  { pattern: 'burpees',       muscles: ['quadriceps', 'chest', 'core', 'glutes'] },
  { pattern: 'mountain',      muscles: ['core', 'quadriceps', 'front_deltoid'] },
  { pattern: 'jumping',       muscles: ['quadriceps', 'calves'] },
  { pattern: 'sprint',        muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'] },
  { pattern: 'dead hang',     muscles: ['latissimus', 'forearms', 'biceps'] },
]

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function getMusclesForExercise(name: string, category: string): MuscleGroup[] {
  const n = normalize(name)
  for (const { pattern, muscles } of NAME_OVERRIDES) {
    if (n.includes(normalize(pattern))) return muscles
  }
  return CATEGORY_MUSCLE_MAP[category] ?? ['core']
}

/**
 * Returns a map of MuscleGroup -> intensity (0–4+ sets).
 * Used by MuscleMap component to determine fill opacity.
 */
export function computeActivation(
  exercises: { name: string; category: string; sets: unknown[] }[]
): Map<MuscleGroup, number> {
  const activation = new Map<MuscleGroup, number>()
  for (const ex of exercises) {
    const muscles = getMusclesForExercise(ex.name, ex.category)
    const setCount = ex.sets.length
    for (const m of muscles) {
      activation.set(m, (activation.get(m) ?? 0) + setCount)
    }
  }
  return activation
}
