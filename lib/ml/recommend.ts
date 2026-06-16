/**
 * Rule-based daily workout recommender.
 * Runs entirely client-side — no API calls, works offline.
 */

import { CATEGORY_MUSCLE_MAP as _CATEGORY_MUSCLE_MAP } from '@/lib/data/musclemap'
import { DEFAULT_EXERCISE_CATALOGUE, type CatalogueEntry } from '@/lib/data/exercise-catalogue'

export interface RecommendedExercise {
  name: string
  category: string
  metric: 'reps' | 'seconds'
  suggestedSets: number
  suggestedValue: number   // reps or seconds depending on metric
}

export interface DailyRecommendation {
  title: string
  rationale: string
  exercises: RecommendedExercise[]
  estimatedMinutes: number
}

type RecentWorkout = {
  exercises: { name: string; category: string; sets: unknown[] }[]
  createdAt: { toDate?: () => Date } | null
}

type UserProfile = {
  basicStrength?: {
    level?: 'beginner' | 'intermediate' | 'advanced' | 'elite'
  }
  skillsByCategory?: Record<string, {
    wantToLearn?: { id: string; name: string }[]
  }>
}

// Categories that should be spread throughout the week
const PUSH_CATS = ['Împingeri', 'Cu Greutate']
const PULL_CATS = ['Trageri', 'Cu Bandă']
const LEG_CATS  = ['Picioare']
const CORE_CATS = ['Core', 'Statice']
const CARDIO_CATS = ['Cardio']

const CATEGORY_GROUPS = [
  { name: 'Trageri (spate & biceps)', cats: PULL_CATS,   emoji: '💪' },
  { name: 'Împingeri (piept & triceps)', cats: PUSH_CATS, emoji: '🏋️' },
  { name: 'Picioare', cats: LEG_CATS,                     emoji: '🦵' },
  { name: 'Core & Statice', cats: CORE_CATS,              emoji: '🔥' },
  { name: 'Cardio', cats: CARDIO_CATS,                    emoji: '🏃' },
]

/** Returns a number 0–1 for how fatigued a category group is (1 = trained today, 0 = not in 7 days) */
function groupFatigue(group: { cats: string[] }, workouts: RecentWorkout[]): number {
  const now = Date.now()
  let maxRecency = 0
  for (const w of workouts) {
    const date = w.createdAt?.toDate?.()?.getTime() ?? 0
    const daysAgo = (now - date) / (1000 * 60 * 60 * 24)
    if (daysAgo > 7) continue
    for (const ex of w.exercises) {
      if (group.cats.includes(ex.category)) {
        // More recent = higher fatigue score
        const score = Math.max(0, 1 - daysAgo / 7)
        maxRecency = Math.max(maxRecency, score)
      }
    }
  }
  return maxRecency
}

/** Map calisthenics level to rep targets */
function repTargets(level?: string): { pull: number; push: number; core: number; legs: number } {
  switch (level) {
    case 'elite':        return { pull: 12, push: 20, core: 45, legs: 20 }
    case 'advanced':     return { pull: 8,  push: 15, core: 30, legs: 15 }
    case 'intermediate': return { pull: 5,  push: 10, core: 20, legs: 12 }
    default:             return { pull: 3,  push: 6,  core: 15, legs: 10 }
  }
}

/** Pick exercises from a category, up to `count` exercises */
function pickExercises(
  categories: string[],
  count: number,
  catalogue: CatalogueEntry[],
  avoid: Set<string>,
): CatalogueEntry[] {
  const candidates = catalogue.filter(e => categories.includes(e.category) && !avoid.has(e.name))
  // Shuffle deterministically using day-of-year as seed
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
  const shuffled = [...candidates].sort((a, b) => {
    const ha = (a.name.charCodeAt(0) + dayOfYear) % 7
    const hb = (b.name.charCodeAt(0) + dayOfYear) % 7
    return ha - hb
  })
  return shuffled.slice(0, count)
}

/**
 * Generate a daily workout recommendation based on:
 * - User's recent workouts (which muscles were used)
 * - User's fitness level (for rep targets)
 * - User's wantToLearn skills (to suggest linked exercises)
 */
export function buildDailyRecommendation(
  recentWorkouts: RecentWorkout[],
  profile: UserProfile | null,
  catalogue: CatalogueEntry[] = DEFAULT_EXERCISE_CATALOGUE,
): DailyRecommendation {
  const level = profile?.basicStrength?.level ?? 'beginner'
  const targets = repTargets(level)

  // Score each group by fatigue (least fatigued = highest priority)
  const scored = CATEGORY_GROUPS.map(g => ({
    ...g,
    fatigue: groupFatigue(g, recentWorkouts),
  })).sort((a, b) => a.fatigue - b.fatigue)

  // Pick the least-fatigued group as today's focus
  const focus = scored[0]
  const secondary = scored[1]

  const usedNames = new Set<string>()
  const result: RecommendedExercise[] = []

  // Add 3 exercises from focus group
  const focusExs = pickExercises(focus.cats, 3, catalogue, usedNames)
  for (const ex of focusExs) {
    usedNames.add(ex.name)
    const isPull = PULL_CATS.includes(ex.category)
    const isLeg  = LEG_CATS.includes(ex.category)
    const isCore = CORE_CATS.includes(ex.category)
    const value  = ex.metric === 'seconds'
      ? (isCore ? targets.core : 20)
      : (isPull ? targets.pull : isLeg ? targets.legs : targets.push)

    result.push({
      name: ex.name,
      category: ex.category,
      metric: ex.metric,
      suggestedSets: level === 'beginner' ? 2 : 3,
      suggestedValue: value,
    })
  }

  // Add 2 exercises from secondary group (variety)
  const secondaryExs = pickExercises(secondary.cats, 2, catalogue, usedNames)
  for (const ex of secondaryExs) {
    usedNames.add(ex.name)
    const isPull = PULL_CATS.includes(ex.category)
    const isLeg  = LEG_CATS.includes(ex.category)
    const isCore = CORE_CATS.includes(ex.category)
    const value  = ex.metric === 'seconds'
      ? (isCore ? targets.core : 20)
      : (isPull ? targets.pull : isLeg ? targets.legs : targets.push)

    result.push({
      name: ex.name,
      category: ex.category,
      metric: ex.metric,
      suggestedSets: 2,
      suggestedValue: value,
    })
  }

  // Add 1 core exercise if not already in focus
  if (!focus.cats.some(c => CORE_CATS.includes(c)) && !secondary.cats.some(c => CORE_CATS.includes(c))) {
    const coreExs = pickExercises(CORE_CATS, 1, catalogue, usedNames)
    for (const ex of coreExs) {
      result.push({
        name: ex.name,
        category: ex.category,
        metric: ex.metric,
        suggestedSets: 2,
        suggestedValue: ex.metric === 'seconds' ? targets.core : 10,
      })
    }
  }

  // Title & rationale
  const title = `${focus.emoji} Zi de ${focus.name}`
  const rationale = focus.fatigue < 0.1
    ? `Nu ai antrenat ${focus.name.toLowerCase()} în ultimele 7 zile — moment perfect!`
    : `${focus.name} este cel mai odihnit grup muscular al tău acum.`

  const totalSets = result.reduce((s, e) => s + e.suggestedSets, 0)
  const estimatedMinutes = Math.round(totalSets * 2.5 + result.length * 1)

  return { title, rationale, exercises: result, estimatedMinutes }
}
