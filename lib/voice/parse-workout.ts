// Turns a spoken / typed workout description ("3 serii de 50 de flotări și 5x10 tracțiuni")
// into structured exercises. Used as the offline fallback for /api/workout/parse and to
// sanitize whatever the LLM returns.

export interface ParsedSet {
  reps?: number
  durationSeconds?: number
  weightKg?: number
  bandKg?: number
}

export interface ParsedExercise {
  name: string                       // catalogue name
  sets: ParsedSet[]
  missing?: 'reps' | 'duration'      // e.g. "5 serii de tracțiuni" — reps not said
}

export interface ParsedWorkout {
  exercises: ParsedExercise[]
  unrecognized: string[]             // phrases we couldn't map to an exercise
}

export interface ParseCatalogueEntry {
  name: string
  metric: 'reps' | 'seconds'
}

export const MAX_SETS = 20
export const MAX_REPS = 1000
export const MAX_SECONDS = 4 * 60 * 60
export const MAX_KG = 300

/** Lowercase, strip diacritics, hyphens → spaces, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Exercise aliases (normalized phrase → catalogue name) ────────────────────

const ALIASES: Record<string, string> = {
  'push up': 'Flotări', 'pushup': 'Flotări', 'flotari': 'Flotări', 'flotare': 'Flotări', 'flotarile': 'Flotări',
  'pull up': 'Tracțiuni', 'pullup': 'Tracțiuni', 'tractiuni': 'Tracțiuni', 'tractiune': 'Tracțiuni', 'tractiunile': 'Tracțiuni',
  'chin up': 'Chin-up', 'chinup': 'Chin-up',
  'australian pull up': 'Australian Pull-up', 'tractiuni australiene': 'Australian Pull-up',
  'diamond push up': 'Diamond Push-up', 'flotari diamant': 'Diamond Push-up',
  'pike push up': 'Pike Push-up', 'flotari pike': 'Pike Push-up',
  'handstand push up': 'Handstand Push-up',
  'muscle up': 'Muscle-Up', 'muscleup': 'Muscle-Up',
  'squat': 'Squaturi', 'squaturi': 'Squaturi', 'genuflexiuni': 'Squaturi', 'genoflexiuni': 'Squaturi', 'genuflexiune': 'Squaturi',
  'pistol squat': 'Pistol Squat', 'pistol': 'Pistol Squat',
  'lunge': 'Lunges', 'lunges': 'Lunges', 'fandari': 'Lunges', 'fandare': 'Lunges',
  'dip': 'Dips', 'dips': 'Dips', 'paralele': 'Dips',
  'plank': 'Plank', 'planca': 'Plank', 'scandura': 'Plank',
  'leg raise': 'Leg Raises', 'ridicari de picioare': 'Leg Raises',
  'calf raise': 'Calf Raise', 'ridicari pe varfuri': 'Calf Raise',
  'burpee': 'Burpees', 'burpees': 'Burpees',
  'dead hang': 'Dead Hang', 'atarnat': 'Dead Hang',
  'handstand': 'Handstand Hold', 'l sit': 'L-Sit',
}

interface Matcher { phrase: string; name: string; re: RegExp }

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function buildMatchers(catalogue: ParseCatalogueEntry[]): Matcher[] {
  const byNorm = new Map(catalogue.map(e => [normalizeText(e.name), e.name]))
  const phrases = new Map<string, string>()
  for (const [n, name] of byNorm) phrases.set(n, name)
  for (const [alias, target] of Object.entries(ALIASES)) {
    const name = byNorm.get(normalizeText(target))
    if (name && !phrases.has(alias)) phrases.set(alias, name)
  }
  return [...phrases.entries()]
    .sort((a, b) => b[0].length - a[0].length)   // longest phrase wins
    .map(([phrase, name]) => ({ phrase, name, re: new RegExp(`(?:^|[^a-z0-9])${escapeRe(phrase)}s?(?=$|[^a-z0-9])`) }))
}

/** Resolve a free-text exercise name (possibly an alias) to a catalogue name. */
export function resolveExerciseName(raw: string, catalogue: ParseCatalogueEntry[]): string | null {
  const n = normalizeText(raw)
  const matchers = buildMatchers(catalogue)
  return matchers.find(m => m.phrase === n)?.name ?? matchers.find(m => m.re.test(n))?.name ?? null
}

// ── Number words → digits (RO + EN) ──────────────────────────────────────────

const UNITS: Record<string, number> = {
  zero: 0, unu: 1, una: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10,
  unsprezece: 11, doisprezece: 12, douasprezece: 12, treisprezece: 13, paisprezece: 14, cincisprezece: 15,
  saisprezece: 16, saptesprezece: 17, optsprezece: 18, nouasprezece: 19,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  douazeci: 20, treizeci: 30, patruzeci: 40, cincizeci: 50, saizeci: 60, saptezeci: 70, optzeci: 80, nouazeci: 90,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
const HUNDRED = new Set(['suta', 'sute', 'hundred'])
// "o serie", "un set", "one minute" — articles only count as 1 before these words
const ARTICLE_TARGETS = /^(serie|set|runda|round|minut|minute|secunda)$/

export function wordsToDigits(text: string): string {
  const tokens = text.split(' ')
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const tok = tokens[i]
    if ((tok === 'o' || tok === 'un' || tok === 'a') && tokens[i + 1] && ARTICLE_TARGETS.test(tokens[i + 1])) {
      // "o suta" handled below; "a" only as EN article ("a set")
      out.push('1'); i++; continue
    }
    let value: number | null = null
    let j = i
    // "o suta" / "one hundred" / "doua sute"
    if ((tokens[j] === 'o' || tokens[j] === 'one' || tokens[j] === 'a') && HUNDRED.has(tokens[j + 1] ?? '')) { value = 100; j += 2 }
    else if (UNITS[tokens[j]] !== undefined && HUNDRED.has(tokens[j + 1] ?? '')) { value = UNITS[tokens[j]] * 100; j += 2 }
    if (value !== null && (tokens[j] === 'si' || tokens[j] === 'and')) j++
    if (TENS[tokens[j]] !== undefined) {
      value = (value ?? 0) + TENS[tokens[j]]; j++
      const conn = tokens[j] === 'si' || tokens[j] === 'and'
      const unitTok = tokens[conn ? j + 1 : j]
      if (unitTok !== undefined && UNITS[unitTok] !== undefined && UNITS[unitTok] < 10) { value += UNITS[unitTok]; j += conn ? 2 : 1 }
    } else if (UNITS[tokens[j]] !== undefined) {
      value = (value ?? 0) + UNITS[tokens[j]]; j++
    }
    if (value !== null && j > i) { out.push(String(value)); i = j; continue }
    out.push(tok); i++
  }
  return out.join(' ')
}

// ── Clause parsing ───────────────────────────────────────────────────────────

interface Clause {
  text: string
  exercise: string | null
  hasNumbers: boolean
}

const CLAUSE_SPLIT = /(?<!\d)[,;.](?!\d)|,(?=\s)|\n|\s(?:si|and|apoi|then|dupa aceea|dupa care)\s/

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)) }
function num(s: string) { return parseFloat(s.replace(',', '.')) }

function parseClause(text: string, exercise: string, metric: 'reps' | 'seconds'): ParsedExercise {
  let t = ` ${text} `
  let weightKg: number | undefined
  let bandKg: number | undefined
  let seconds = 0
  let sets: number | undefined
  let reps: number | undefined

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    let m: RegExpMatchArray | null
    while ((m = t.match(re))) { fn(m); t = t.replace(m[0], ' ') }
  }

  const isBand = /\bband|\bbanda\b|\belastic/.test(t)
  take(/(\d+(?:[.,]\d+)?)\s*(?:kg|kile|kilograme|kilogram|kilos?)\b/, m => {
    if (isBand) bandKg = num(m[1]); else weightKg = num(m[1])
  })
  take(/(\d+(?:[.,]\d+)?)\s*(?:minute|minut|min|minutes)\b/, m => { seconds += Math.round(num(m[1]) * 60) })
  take(/(\d+)\s*(?:secunde|secunda|sec|s|seconds?|secs)\b/, m => { seconds += parseInt(m[1]) })
  take(/(\d+)\s*(?:x|×|ori|by|times)\s*(\d+)/, m => { sets = parseInt(m[1]); reps = parseInt(m[2]) })
  take(/(\d+)\s*(?:serii|serie|seturi|set|sets|runde|runda|rounds?)\b/, m => { sets = parseInt(m[1]) })
  take(/(\d+)\s*(?:repetari|repetare|rep|reps|repetitions?|bucati)\b/, m => { reps = parseInt(m[1]) })

  const rest = (t.match(/\d+/g) ?? []).map(n => parseInt(n))
  let repsList: number[] | null = null
  if (reps === undefined && rest.length > 0) {
    if (sets !== undefined) {
      if (rest.length > 1 && rest.length === sets) repsList = rest
      else reps = rest[0]
    } else if (rest.length >= 3) {
      repsList = rest                      // "tracțiuni 10 8 6"
    } else if (rest.length === 2) {
      sets = rest[0]; reps = rest[1]       // "flotări 3 50"
    } else {
      reps = rest[0]
    }
  }

  // Seconds-based exercise: a bare number means seconds
  if (metric === 'seconds') {
    if (seconds === 0) {
      if (repsList) { repsList = null; seconds = rest[0] }
      else if (reps !== undefined) { seconds = reps; reps = undefined }
    } else if (sets === undefined && reps !== undefined) {
      sets = reps; reps = undefined         // "l-sit 2 x 15 secunde"
    }
  }

  const base: ParsedSet = {
    ...(metric === 'reps' && reps !== undefined && { reps: clamp(reps, 1, MAX_REPS) }),
    ...(seconds > 0 && { durationSeconds: clamp(seconds, 1, MAX_SECONDS) }),
    ...(weightKg !== undefined && { weightKg: clamp(weightKg, 0, MAX_KG) }),
    ...(bandKg !== undefined && { bandKg: clamp(bandKg, 0, MAX_KG) }),
  }
  const parsedSets: ParsedSet[] = repsList && metric === 'reps'
    ? repsList.slice(0, MAX_SETS).map(r => ({ ...base, reps: clamp(r, 1, MAX_REPS) }))
    : Array.from({ length: clamp(sets ?? 1, 1, MAX_SETS) }, () => ({ ...base }))

  const missing = metric === 'reps'
    ? (parsedSets.some(s => s.reps === undefined) ? 'reps' as const : undefined)
    : (parsedSets.some(s => s.durationSeconds === undefined) ? 'duration' as const : undefined)

  return { name: exercise, sets: parsedSets, ...(missing && { missing }) }
}

/** Merge exercises with the same name, preserving first-mention order. */
function mergeByName(list: ParsedExercise[]): ParsedExercise[] {
  const out: ParsedExercise[] = []
  for (const ex of list) {
    const existing = out.find(e => e.name === ex.name)
    if (!existing) { out.push({ ...ex, sets: [...ex.sets] }); continue }
    existing.sets.push(...ex.sets)
    existing.sets = existing.sets.slice(0, MAX_SETS)
    if (ex.missing) existing.missing = ex.missing
  }
  return out
}

/** Deterministic rule-based parser. Handles RO + EN, digits or number words. */
export function parseWorkoutText(input: string, catalogue: ParseCatalogueEntry[]): ParsedWorkout {
  const matchers = buildMatchers(catalogue)
  const metricOf = (name: string) => catalogue.find(e => e.name === name)?.metric ?? 'reps'
  const text = wordsToDigits(normalizeText(input))

  const clauses: Clause[] = text.split(CLAUSE_SPLIT)
    .map(s => s?.trim() ?? '')
    .filter(Boolean)
    .map(s => ({ text: s, exercise: matchers.find(m => m.re.test(` ${s} `))?.name ?? null, hasNumbers: /\d/.test(s) }))

  // Glue "flotări, 3 serii de 50" / "3 serii de 50, flotări" back together
  const groups: Clause[] = []
  for (const c of clauses) {
    const prev = groups[groups.length - 1]
    if (prev && (
      (!c.exercise && c.hasNumbers && prev.exercise && !prev.hasNumbers) ||
      (!c.exercise && prev.exercise && /^[\d\s]+$/.test(c.text)) ||          // "tracțiuni 10, 8, 6"
      (c.exercise && !c.hasNumbers && !prev.exercise && prev.hasNumbers)
    )) {
      prev.text = `${prev.text} ${c.text}`
      prev.exercise = prev.exercise ?? c.exercise
      prev.hasNumbers = true
      continue
    }
    groups.push({ ...c })
  }

  const exercises: ParsedExercise[] = []
  const unrecognized: string[] = []
  for (const g of groups) {
    if (!g.exercise) { if (g.hasNumbers || g.text.split(' ').length > 1) unrecognized.push(g.text); continue }
    exercises.push(parseClause(g.text, g.exercise, metricOf(g.exercise)))
  }
  return { exercises: mergeByName(exercises), unrecognized }
}

// ── Sanitizing untrusted structured output (LLM / client) ────────────────────

function optNum(v: unknown, min: number, max: number, int = true): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined
  return clamp(int ? Math.round(v) : Math.round(v * 10) / 10, min, max)
}

export function sanitizeParsedWorkout(raw: unknown, catalogue: ParseCatalogueEntry[]): ParsedWorkout {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as { exercises?: unknown; unrecognized?: unknown }
  const unrecognized = Array.isArray(obj.unrecognized)
    ? obj.unrecognized.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map(u => u.slice(0, 120)).slice(0, 10)
    : []
  const exercises: ParsedExercise[] = []
  for (const item of Array.isArray(obj.exercises) ? obj.exercises.slice(0, 30) : []) {
    const ex = (item && typeof item === 'object' ? item : {}) as { name?: unknown; sets?: unknown }
    if (typeof ex.name !== 'string') continue
    const name = resolveExerciseName(ex.name, catalogue)
    if (!name) { unrecognized.push(ex.name.slice(0, 120)); continue }
    const metric = catalogue.find(e => e.name === name)?.metric ?? 'reps'
    const rawSets = Array.isArray(ex.sets) && ex.sets.length > 0 ? ex.sets.slice(0, MAX_SETS) : [{}]
    const sets: ParsedSet[] = rawSets.map(rs => {
      const s = (rs && typeof rs === 'object' ? rs : {}) as Record<string, unknown>
      const reps = metric === 'reps' ? optNum(s.reps, 1, MAX_REPS) : undefined
      const durationSeconds = optNum(s.durationSeconds, 1, MAX_SECONDS)
      const weightKg = optNum(s.weightKg, 0, MAX_KG, false)
      const bandKg = optNum(s.bandKg, 0, MAX_KG, false)
      return {
        ...(reps !== undefined && { reps }),
        ...(durationSeconds !== undefined && { durationSeconds }),
        ...(weightKg !== undefined && { weightKg }),
        ...(bandKg !== undefined && { bandKg }),
      }
    })
    const missing = metric === 'reps'
      ? (sets.some(s => s.reps === undefined) ? 'reps' as const : undefined)
      : (sets.some(s => s.durationSeconds === undefined) ? 'duration' as const : undefined)
    exercises.push({ name, sets, ...(missing && { missing }) })
  }
  return { exercises: mergeByName(exercises), unrecognized }
}
