// Shared exercise catalogue used by both workout page and admin hub

export interface CatalogueEntry {
  name: string
  category: string
  metric: 'reps' | 'seconds'
}

/** Default catalogue (used as fallback when Firestore collection is empty) */
export const DEFAULT_EXERCISE_CATALOGUE: CatalogueEntry[] = [
  // ── Trageri ──────────────────────────────────────────────────────────────────
  { name: 'Tracțiuni',          category: 'Trageri',   metric: 'reps'    },
  { name: 'Chin-up',            category: 'Trageri',   metric: 'reps'    },
  { name: 'Australian Pull-up', category: 'Trageri',   metric: 'reps'    },
  { name: 'Chest-to-Bar',       category: 'Trageri',   metric: 'reps'    },
  { name: 'Muscle-Up',          category: 'Trageri',   metric: 'reps'    },
  { name: 'One-Arm Pull-up',    category: 'Trageri',   metric: 'reps'    },
  // ── Împingeri ────────────────────────────────────────────────────────────────
  { name: 'Flotări',            category: 'Împingeri', metric: 'reps'    },
  { name: 'Diamond Push-up',    category: 'Împingeri', metric: 'reps'    },
  { name: 'Pike Push-up',       category: 'Împingeri', metric: 'reps'    },
  { name: 'Handstand Push-up',  category: 'Împingeri', metric: 'reps'    },
  { name: 'One-Arm Push-up',    category: 'Împingeri', metric: 'reps'    },
  { name: 'Dips',               category: 'Împingeri', metric: 'reps'    },
  { name: 'Ring Dip',           category: 'Împingeri', metric: 'reps'    },
  // ── Core ─────────────────────────────────────────────────────────────────────
  { name: 'L-Sit',              category: 'Core',      metric: 'seconds' },
  { name: 'Dragon Flag',        category: 'Core',      metric: 'seconds' },
  { name: 'Hollow Body Hold',   category: 'Core',      metric: 'seconds' },
  { name: 'Arch Body Hold',     category: 'Core',      metric: 'seconds' },
  { name: 'Leg Raises',         category: 'Core',      metric: 'reps'    },
  { name: 'Plank',              category: 'Core',      metric: 'seconds' },
  // ── Picioare ─────────────────────────────────────────────────────────────────
  { name: 'Squaturi',           category: 'Picioare',  metric: 'reps'    },
  { name: 'Lunges',             category: 'Picioare',  metric: 'reps'    },
  { name: 'Pistol Squat',       category: 'Picioare',  metric: 'reps'    },
  { name: 'Box Jump',           category: 'Picioare',  metric: 'reps'    },
  { name: 'Calf Raise',         category: 'Picioare',  metric: 'reps'    },
  // ── Statice ──────────────────────────────────────────────────────────────────
  { name: 'Front Lever',        category: 'Statice',   metric: 'seconds' },
  { name: 'Back Lever',         category: 'Statice',   metric: 'seconds' },
  { name: 'Planche',            category: 'Statice',   metric: 'seconds' },
  { name: 'Tuck Planche',       category: 'Statice',   metric: 'seconds' },
  { name: 'Handstand Hold',     category: 'Statice',   metric: 'seconds' },
  { name: 'Dead Hang',          category: 'Statice',   metric: 'seconds' },
  // ── Cardio ───────────────────────────────────────────────────────────────────
  { name: 'Burpees',            category: 'Cardio',    metric: 'reps'    },
  { name: 'Mountain Climbers',  category: 'Cardio',    metric: 'reps'    },
  { name: 'Jumping Jacks',      category: 'Cardio',    metric: 'reps'    },
  { name: 'Sprint 100m',        category: 'Cardio',    metric: 'seconds' },
]

/** Group entries by category for display */
export function groupByCategoryByCatalogue(entries: CatalogueEntry[]): { category: string; exercises: CatalogueEntry[] }[] {
  const map = new Map<string, CatalogueEntry[]>()
  for (const e of entries) {
    const arr = map.get(e.category) ?? []
    arr.push(e)
    map.set(e.category, arr)
  }
  return Array.from(map.entries()).map(([category, exercises]) => ({ category, exercises }))
}

/** Look up the metric for an exercise name from a catalogue (falls back to 'reps') */
export function getMetric(name: string, catalogue: CatalogueEntry[]): 'reps' | 'seconds' {
  return catalogue.find(e => e.name === name)?.metric ?? 'reps'
}

/** Look up the category for an exercise name from a catalogue (falls back to 'Altele') */
export function getCategory(name: string, catalogue: CatalogueEntry[]): string {
  return catalogue.find(e => e.name === name)?.category ?? 'Altele'
}
