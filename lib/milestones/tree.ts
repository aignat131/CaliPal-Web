/**
 * Calisthenics milestone tree — ordered progressions per branch, from the
 * first easy step to the elite skill. The user ticks what they've achieved.
 *
 * Storage: users/{uid}.milestones = { [milestoneId]: achievedAtMs }
 * Ids are permanent (they're stored): never rename one, only add new ones.
 */

export interface Milestone {
  id: string
  name: string
  /** Short target shown under the name, e.g. "10 rep", "10 sec". */
  target?: string
}

export interface MilestoneBranch {
  id: string
  name: string
  icon: string
  color: string
  steps: Milestone[]
}

export const MILESTONE_TREE: MilestoneBranch[] = [
  {
    id: 'pull', name: 'Tracțiuni', icon: '🆙', color: '#22C55E',
    steps: [
      { id: 'pull_dead_hang', name: 'Dead hang', target: '30 sec' },
      { id: 'pull_scap', name: 'Scapula pull-ups', target: '10 rep' },
      { id: 'pull_rows', name: 'Australian rows', target: '10 rep' },
      { id: 'pull_negative', name: 'Tracțiuni negative', target: '5 × 5 sec' },
      { id: 'pull_1', name: 'Prima tracțiune', target: '1 rep' },
      { id: 'pull_5', name: '5 tracțiuni', target: '5 rep' },
      { id: 'pull_10', name: '10 tracțiuni', target: '10 rep' },
      { id: 'pull_15', name: '15 tracțiuni', target: '15 rep' },
      { id: 'pull_archer', name: 'Archer pull-up', target: '3 rep / parte' },
      { id: 'pull_one_arm', name: 'One-arm pull-up', target: '1 rep' },
    ],
  },
  {
    id: 'push', name: 'Flotări', icon: '💪', color: '#3B82F6',
    steps: [
      { id: 'push_incline', name: 'Flotări înclinate', target: '10 rep' },
      { id: 'push_knee', name: 'Flotări pe genunchi', target: '10 rep' },
      { id: 'push_1', name: 'Prima flotare completă', target: '1 rep' },
      { id: 'push_10', name: '10 flotări', target: '10 rep' },
      { id: 'push_25', name: '25 flotări', target: '25 rep' },
      { id: 'push_diamond', name: 'Flotări diamant', target: '10 rep' },
      { id: 'push_archer', name: 'Archer push-up', target: '5 rep / parte' },
      { id: 'push_pseudo', name: 'Pseudo planche push-up', target: '10 rep' },
      { id: 'push_one_arm', name: 'One-arm push-up', target: '1 rep' },
    ],
  },
  {
    id: 'dips', name: 'Dips', icon: '🔻', color: '#A855F7',
    steps: [
      { id: 'dips_support', name: 'Support hold la paralele', target: '30 sec' },
      { id: 'dips_bench', name: 'Bench dips', target: '15 rep' },
      { id: 'dips_negative', name: 'Dips negative', target: '5 × 5 sec' },
      { id: 'dips_1', name: 'Primul dip', target: '1 rep' },
      { id: 'dips_10', name: '10 dips', target: '10 rep' },
      { id: 'dips_20', name: '20 dips', target: '20 rep' },
      { id: 'dips_straight_bar', name: 'Straight bar dips', target: '10 rep' },
      { id: 'dips_rings', name: 'Ring dips', target: '5 rep' },
    ],
  },
  {
    id: 'muscle_up', name: 'Muscle-up', icon: '🚀', color: '#F97316',
    steps: [
      { id: 'mu_high_pull', name: 'Tracțiuni cu pieptul la bară', target: '5 rep' },
      { id: 'mu_explosive', name: 'Tracțiuni explozive (mâinile se desprind)', target: '3 rep' },
      { id: 'mu_negative', name: 'Muscle-up negativ', target: '3 rep' },
      { id: 'mu_1', name: 'Primul muscle-up', target: '1 rep' },
      { id: 'mu_3', name: '3 muscle-ups', target: '3 rep' },
      { id: 'mu_strict', name: 'Muscle-up strict (fără kip)', target: '1 rep' },
      { id: 'mu_rings', name: 'Ring muscle-up', target: '1 rep' },
    ],
  },
  {
    id: 'core', name: 'Core & L-sit', icon: '🪑', color: '#EAB308',
    steps: [
      { id: 'core_plank', name: 'Plank', target: '60 sec' },
      { id: 'core_knee_raise', name: 'Ridicări de genunchi la bară', target: '10 rep' },
      { id: 'core_tuck_lsit', name: 'Tuck L-sit', target: '15 sec' },
      { id: 'core_leg_raise', name: 'Ridicări de picioare întinse la bară', target: '10 rep' },
      { id: 'core_lsit_10', name: 'L-sit', target: '10 sec' },
      { id: 'core_lsit_30', name: 'L-sit', target: '30 sec' },
      { id: 'core_toes_to_bar', name: 'Toes to bar', target: '10 rep' },
      { id: 'core_dragon_flag', name: 'Dragon flag', target: '5 rep' },
      { id: 'core_vsit', name: 'V-sit', target: '5 sec' },
    ],
  },
  {
    id: 'handstand', name: 'Handstand', icon: '🤸', color: '#EC4899',
    steps: [
      { id: 'hs_crow', name: 'Crow pose', target: '20 sec' },
      { id: 'hs_pike_hold', name: 'Pike hold pe cutie', target: '30 sec' },
      { id: 'hs_wall_30', name: 'Handstand la perete (burta la perete)', target: '30 sec' },
      { id: 'hs_wall_60', name: 'Handstand la perete', target: '60 sec' },
      { id: 'hs_free_5', name: 'Primul handstand liber', target: '5 sec' },
      { id: 'hs_free_15', name: 'Handstand liber', target: '15 sec' },
      { id: 'hs_free_30', name: 'Handstand liber', target: '30 sec' },
      { id: 'hs_press', name: 'Press to handstand', target: '1 rep' },
    ],
  },
  {
    id: 'hspu', name: 'Handstand push-up', icon: '⬇️', color: '#06B6D4',
    steps: [
      { id: 'hspu_pike', name: 'Pike push-ups', target: '10 rep' },
      { id: 'hspu_elevated', name: 'Pike push-ups cu picioarele ridicate', target: '10 rep' },
      { id: 'hspu_wall_neg', name: 'HSPU negative la perete', target: '3 rep' },
      { id: 'hspu_wall_1', name: 'Primul HSPU la perete', target: '1 rep' },
      { id: 'hspu_wall_5', name: 'HSPU la perete', target: '5 rep' },
      { id: 'hspu_free', name: 'HSPU liber', target: '1 rep' },
    ],
  },
  {
    id: 'front_lever', name: 'Front lever', icon: '🛸', color: '#14B8A6',
    steps: [
      { id: 'fl_tuck', name: 'Tuck front lever', target: '10 sec' },
      { id: 'fl_adv_tuck', name: 'Advanced tuck', target: '10 sec' },
      { id: 'fl_one_leg', name: 'One-leg front lever', target: '10 sec' },
      { id: 'fl_straddle', name: 'Straddle front lever', target: '5 sec' },
      { id: 'fl_full', name: 'Full front lever', target: '3 sec' },
      { id: 'fl_full_10', name: 'Full front lever', target: '10 sec' },
    ],
  },
  {
    id: 'back_lever', name: 'Back lever', icon: '🔙', color: '#8B5CF6',
    steps: [
      { id: 'bl_skin_cat', name: 'Skin the cat', target: '3 rep' },
      { id: 'bl_german', name: 'German hang', target: '15 sec' },
      { id: 'bl_tuck', name: 'Tuck back lever', target: '10 sec' },
      { id: 'bl_adv_tuck', name: 'Advanced tuck', target: '10 sec' },
      { id: 'bl_straddle', name: 'Straddle back lever', target: '5 sec' },
      { id: 'bl_full', name: 'Full back lever', target: '5 sec' },
    ],
  },
  {
    id: 'planche', name: 'Planche', icon: '✈️', color: '#EF4444',
    steps: [
      { id: 'pl_lean', name: 'Planche lean', target: '30 sec' },
      { id: 'pl_frog', name: 'Frog stand', target: '30 sec' },
      { id: 'pl_tuck', name: 'Tuck planche', target: '10 sec' },
      { id: 'pl_adv_tuck', name: 'Advanced tuck planche', target: '10 sec' },
      { id: 'pl_straddle', name: 'Straddle planche', target: '5 sec' },
      { id: 'pl_full', name: 'Full planche', target: '3 sec' },
    ],
  },
  {
    id: 'legs', name: 'Picioare', icon: '🦵', color: '#84CC16',
    steps: [
      { id: 'legs_squat_20', name: 'Genuflexiuni', target: '20 rep' },
      { id: 'legs_lunges', name: 'Fandări', target: '10 rep / picior' },
      { id: 'legs_bulgarian', name: 'Bulgarian split squat', target: '10 rep / picior' },
      { id: 'legs_pistol_assist', name: 'Pistol squat asistat', target: '5 rep / picior' },
      { id: 'legs_pistol_1', name: 'Primul pistol squat', target: '1 rep' },
      { id: 'legs_pistol_5', name: 'Pistol squats', target: '5 rep / picior' },
      { id: 'legs_shrimp', name: 'Shrimp squat', target: '3 rep / picior' },
      { id: 'legs_nordic', name: 'Nordic curl', target: '3 rep' },
    ],
  },
  {
    id: 'flag', name: 'Human flag', icon: '🚩', color: '#F59E0B',
    steps: [
      { id: 'flag_side_plank', name: 'Side plank', target: '45 sec' },
      { id: 'flag_vertical', name: 'Vertical flag', target: '5 sec' },
      { id: 'flag_tuck', name: 'Tuck human flag', target: '5 sec' },
      { id: 'flag_straddle', name: 'Straddle human flag', target: '5 sec' },
      { id: 'flag_full', name: 'Full human flag', target: '3 sec' },
    ],
  },
]

export const MILESTONE_BY_ID = new Map<string, { milestone: Milestone; branch: MilestoneBranch; index: number }>(
  MILESTONE_TREE.flatMap(b => b.steps.map((m, index) => [m.id, { milestone: m, branch: b, index }] as const)),
)

export const TOTAL_MILESTONES = MILESTONE_BY_ID.size

export type MilestoneMap = Record<string, number>

/** Keeps only known ids with a valid timestamp. */
export function sanitizeMilestones(v: unknown): MilestoneMap {
  const out: MilestoneMap = {}
  if (!v || typeof v !== 'object') return out
  for (const [k, ms] of Object.entries(v as Record<string, unknown>)) {
    if (MILESTONE_BY_ID.has(k) && typeof ms === 'number' && Number.isFinite(ms) && ms > 0) out[k] = ms
  }
  return out
}

export interface BranchProgress {
  done: number
  total: number
  /** The first step not yet ticked (what to work on next), null when complete. */
  next: Milestone | null
  /** Highest ticked step in the progression order. */
  best: Milestone | null
}

export function branchProgress(branch: MilestoneBranch, done: MilestoneMap): BranchProgress {
  let count = 0
  let best: Milestone | null = null
  let next: Milestone | null = null
  for (const s of branch.steps) {
    if (done[s.id]) { count++; best = s }
    else if (!next) next = s
  }
  return { done: count, total: branch.steps.length, next, best }
}

export function totalDone(done: MilestoneMap): number {
  return Object.keys(sanitizeMilestones(done)).length
}

/** Display label: "Tuck front lever · 10 sec". */
export function milestoneLabel(m: Milestone): string {
  return m.target ? `${m.name} · ${m.target}` : m.name
}
