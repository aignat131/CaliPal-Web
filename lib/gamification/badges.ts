import type { LiftKey, RecordMap } from './records'

// Earned badges. Every badge is derived from data the app already stores
// (workout history, user doc, battle history), so it can be evaluated for any
// profile. Levels are persisted in users/{uid}/badges/{badgeId} by syncBadges
// so they stick (e.g. a 30-day streak badge survives a broken streak).

export type BadgeCategory = 'firsts' | 'strength' | 'holds' | 'consistency' | 'social'

export interface BadgeStats {
  records: RecordMap
  totalWorkouts: number
  currentStreak: number
  trainingsAttended: number
  friendCount: number
  battleWins: number
  skillsMastered: number
  completedPrograms: number
}

type Text = { RO: string; EN: string }

export interface BadgeDef {
  id: string
  icon: string
  category: BadgeCategory
  name: Text
  /** `{n}` is replaced with the threshold of the level being described. */
  desc: Text
  /** One threshold = single-level badge; three = bronze / silver / gold. */
  thresholds: number[]
  unit?: 'reps' | 'seconds' | 'days'
  value: (s: BadgeStats) => number
}

const rec = (k: LiftKey) => (s: BadgeStats) => s.records[k]?.value ?? 0

export const BADGES: BadgeDef[] = [
  // ── Firsts ──────────────────────────────────────────────────────────────────
  { id: 'first_workout', icon: '🎬', category: 'firsts', thresholds: [1],
    name: { RO: 'Primul antrenament', EN: 'First Workout' },
    desc: { RO: 'Salvează primul antrenament.', EN: 'Save your first workout.' },
    value: s => s.totalWorkouts },
  { id: 'first_pullup', icon: '🆙', category: 'firsts', thresholds: [1], unit: 'reps',
    name: { RO: 'Prima tracțiune', EN: 'First Pull-up' },
    desc: { RO: 'Fă prima tracțiune completă.', EN: 'Do your first full pull-up.' },
    value: rec('pullup') },
  { id: 'first_muscleup', icon: '🚀', category: 'firsts', thresholds: [1], unit: 'reps',
    name: { RO: 'Primul Muscle-up', EN: 'First Muscle-up' },
    desc: { RO: 'Fă primul muscle-up.', EN: 'Land your first muscle-up.' },
    value: rec('muscleup') },
  { id: 'first_handstand', icon: '🙃', category: 'firsts', thresholds: [5], unit: 'seconds',
    name: { RO: 'Primul Handstand', EN: 'First Handstand' },
    desc: { RO: 'Ține un handstand {n} secunde.', EN: 'Hold a handstand for {n} seconds.' },
    value: rec('handstand') },
  { id: 'first_front_lever', icon: '🛸', category: 'firsts', thresholds: [1], unit: 'seconds',
    name: { RO: 'Primul Front Lever', EN: 'First Front Lever' },
    desc: { RO: 'Ține un front lever.', EN: 'Hold a front lever.' },
    value: rec('front_lever') },

  // ── Strength (best single set) ──────────────────────────────────────────────
  { id: 'pullup_power', icon: '🦍', category: 'strength', thresholds: [10, 20, 30], unit: 'reps',
    name: { RO: 'Rege la bară', EN: 'Pull-up King' },
    desc: { RO: '{n} tracțiuni într-o serie.', EN: '{n} pull-ups in one set.' },
    value: rec('pullup') },
  { id: 'pushup_power', icon: '💪', category: 'strength', thresholds: [25, 50, 75], unit: 'reps',
    name: { RO: 'Mașină de flotări', EN: 'Push-up Machine' },
    desc: { RO: '{n} flotări într-o serie.', EN: '{n} push-ups in one set.' },
    value: rec('pushup') },
  { id: 'dips_power', icon: '🔻', category: 'strength', thresholds: [15, 30, 45], unit: 'reps',
    name: { RO: 'Dips Destroyer', EN: 'Dips Destroyer' },
    desc: { RO: '{n} dips într-o serie.', EN: '{n} dips in one set.' },
    value: rec('dips') },
  { id: 'squat_power', icon: '🦵', category: 'strength', thresholds: [30, 60, 100], unit: 'reps',
    name: { RO: 'Picioare de oțel', EN: 'Legs of Steel' },
    desc: { RO: '{n} squaturi într-o serie.', EN: '{n} squats in one set.' },
    value: rec('squat') },
  { id: 'muscleup_master', icon: '⚡', category: 'strength', thresholds: [5, 10, 15], unit: 'reps',
    name: { RO: 'Muscle-up Master', EN: 'Muscle-up Master' },
    desc: { RO: '{n} muscle-up-uri într-o serie.', EN: '{n} muscle-ups in one set.' },
    value: rec('muscleup') },

  // ── Holds ───────────────────────────────────────────────────────────────────
  { id: 'handstand_master', icon: '🤸', category: 'holds', thresholds: [15, 30, 60], unit: 'seconds',
    name: { RO: 'Handstand Master', EN: 'Handstand Master' },
    desc: { RO: 'Handstand ținut {n} secunde.', EN: 'Hold a handstand for {n} seconds.' },
    value: rec('handstand') },
  { id: 'lsit_master', icon: '🪑', category: 'holds', thresholds: [10, 20, 30], unit: 'seconds',
    name: { RO: 'L-Sit Master', EN: 'L-Sit Master' },
    desc: { RO: 'L-Sit ținut {n} secunde.', EN: 'Hold an L-sit for {n} seconds.' },
    value: rec('lsit') },
  { id: 'front_lever_master', icon: '🛰️', category: 'holds', thresholds: [5, 10, 20], unit: 'seconds',
    name: { RO: 'Front Lever Master', EN: 'Front Lever Master' },
    desc: { RO: 'Front lever ținut {n} secunde.', EN: 'Hold a front lever for {n} seconds.' },
    value: rec('front_lever') },
  { id: 'plank_master', icon: '🧱', category: 'holds', thresholds: [60, 180, 300], unit: 'seconds',
    name: { RO: 'Zid de beton', EN: 'Concrete Core' },
    desc: { RO: 'Plank ținut {n} secunde.', EN: 'Hold a plank for {n} seconds.' },
    value: rec('plank') },

  // ── Consistency ─────────────────────────────────────────────────────────────
  { id: 'streak', icon: '🔥', category: 'consistency', thresholds: [7, 30, 100], unit: 'days',
    name: { RO: 'În flăcări', EN: 'On Fire' },
    desc: { RO: 'Streak de {n} zile.', EN: '{n}-day streak.' },
    value: s => s.currentStreak },
  { id: 'dedicated', icon: '🏋️', category: 'consistency', thresholds: [10, 50, 200],
    name: { RO: 'Dedicat', EN: 'Dedicated' },
    desc: { RO: '{n} antrenamente salvate.', EN: '{n} workouts saved.' },
    value: s => s.totalWorkouts },
  { id: 'program_finisher', icon: '📘', category: 'consistency', thresholds: [1, 3, 5],
    name: { RO: 'Duc la capăt', EN: 'Finisher' },
    desc: { RO: '{n} programe terminate.', EN: '{n} programs completed.' },
    value: s => s.completedPrograms },
  { id: 'skill_collector', icon: '🧩', category: 'consistency', thresholds: [3, 8, 15],
    name: { RO: 'Colecționar de skill-uri', EN: 'Skill Collector' },
    desc: { RO: '{n} skill-uri stăpânite.', EN: '{n} skills mastered.' },
    value: s => s.skillsMastered },

  // ── Social ──────────────────────────────────────────────────────────────────
  { id: 'team_player', icon: '🤝', category: 'social', thresholds: [3, 10, 30],
    name: { RO: 'Om de echipă', EN: 'Team Player' },
    desc: { RO: '{n} antrenamente de grup.', EN: '{n} group trainings attended.' },
    value: s => s.trainingsAttended },
  { id: 'gladiator', icon: '⚔️', category: 'social', thresholds: [1, 10, 25],
    name: { RO: 'Gladiator', EN: 'Gladiator' },
    desc: { RO: '{n} battle-uri câștigate.', EN: '{n} battles won.' },
    value: s => s.battleWins },
  { id: 'social', icon: '👥', category: 'social', thresholds: [3, 10, 25],
    name: { RO: 'Sociabil', EN: 'Social' },
    desc: { RO: '{n} prieteni.', EN: '{n} friends.' },
    value: s => s.friendCount },
]

export const BADGE_BY_ID = new Map(BADGES.map(b => [b.id, b]))

export interface BadgeResult {
  def: BadgeDef
  value: number
  /** Levels reached: 0 = locked; single-level badges max at 1, tiered at 3. */
  level: number
  /** Threshold of the next level, or null when maxed. */
  next: number | null
}

export function levelFor(def: BadgeDef, value: number): number {
  let level = 0
  for (const t of def.thresholds) if (value >= t) level++
  return level
}

export function evaluateBadges(stats: BadgeStats, stored: Record<string, number> = {}): BadgeResult[] {
  return BADGES.map(def => {
    const value = def.value(stats)
    // Never show fewer levels than were already earned and stored.
    const level = Math.max(levelFor(def, value), stored[def.id] ?? 0)
    const next = level < def.thresholds.length ? def.thresholds[level] : null
    return { def, value, level, next }
  })
}

export type TierName = 'bronze' | 'silver' | 'gold' | 'special'

export function tierName(def: BadgeDef, level: number): TierName | null {
  if (level <= 0) return null
  if (def.thresholds.length === 1) return 'special'
  return (['bronze', 'silver', 'gold'] as const)[Math.min(level, 3) - 1]
}

export const TIER_COLORS: Record<TierName, string> = {
  bronze: '#C5824A',
  silver: '#C3C9D1',
  gold: '#E3B24C',
  special: 'var(--accent)',
}

export function badgeDesc(def: BadgeDef, level: number, lang: 'RO' | 'EN'): string {
  const idx = Math.min(Math.max(level, 1), def.thresholds.length) - 1
  return def.desc[lang].replace('{n}', String(def.thresholds[idx]))
}
