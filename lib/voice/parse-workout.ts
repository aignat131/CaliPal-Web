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
  alternatives?: string[]            // other catalogue names it may have meant — the user picks
  uncertain?: boolean                // matched by sound only; ask the user to confirm
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
// Two bare numbers read as "sets × reps" only when the first is a plausible set count
const MAX_BARE_SETS = 6

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
  // How ro-RO speech recognition tends to hear "muscle up(s)"
  'masa lapuri': 'Muscle-Up', 'masa lap': 'Muscle-Up', 'masal ap': 'Muscle-Up', 'masal apuri': 'Muscle-Up',
  'mascal ap': 'Muscle-Up', 'mascal apuri': 'Muscle-Up', 'masl ap': 'Muscle-Up', 'mazal ap': 'Muscle-Up',
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
  // How ro-RO speech recognition tends to spell English exercise names
  'pusap': 'Flotări', 'pus ap': 'Flotări', 'pusapuri': 'Flotări', 'pus apuri': 'Flotări',
  'pulap': 'Tracțiuni', 'pul ap': 'Tracțiuni', 'pulapuri': 'Tracțiuni', 'pul apuri': 'Tracțiuni',
  'cin ap': 'Chin-up', 'cinap': 'Chin-up', 'cin apuri': 'Chin-up',
  'scuat': 'Squaturi', 'scuati': 'Squaturi', 'scuaturi': 'Squaturi', 'scuoturi': 'Squaturi',
  'pistol scuat': 'Pistol Squat', 'pistol scuati': 'Pistol Squat', 'pistol scuaturi': 'Pistol Squat',
  'dipsuri': 'Dips', 'dipuri': 'Dips',
  'planc': 'Plank', 'plancuri': 'Plank',
  'burpi': 'Burpees', 'barpi': 'Burpees', 'burpiuri': 'Burpees',
  'lanjuri': 'Lunges', 'lanj': 'Lunges',
  'hendstend': 'Handstand Hold', 'hand stand': 'Handstand Hold',
  'el sit': 'L-Sit', 'elsit': 'L-Sit',
  'front liver': 'Front Lever', 'frant lever': 'Front Lever',
  'ded heng': 'Dead Hang', 'ded hang': 'Dead Hang',
  'flotari diamond': 'Diamond Push-up', 'diamond': 'Diamond Push-up',
  // English names with a Romanian plural ("push-uri", "pull-uri")
  'push uri': 'Flotări', 'pushuri': 'Flotări', 'push upuri': 'Flotări',
  'pull uri': 'Tracțiuni', 'pulluri': 'Tracțiuni', 'pull upuri': 'Tracțiuni',
  'chin uri': 'Chin-up', 'chin upuri': 'Chin-up', 'muscle upuri': 'Muscle-Up',
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

// ── Matching by sound ────────────────────────────────────────────────────────

// Words that are never part of an exercise name (units, counts, filler)
const STOP_WORDS = new Set([
  'am', 'facut', 'fac', 'si', 'de', 'cu', 'a', 'cate', 'la', 'pe', 'in', 'un', 'o', 'una', 'mai', 'apoi', 'dupa', 'care',
  'aceea', 'serii', 'serie', 'seturi', 'set', 'sets', 'runde', 'runda', 'rounds', 'round', 'rep', 'reps', 'repetari',
  'repetare', 'repetitions', 'bucati', 'secunde', 'secunda', 'sec', 's', 'seconds', 'second', 'minute', 'minut', 'min',
  'minutes', 'kg', 'kile', 'kilograme', 'x', 'ori', 'times', 'by', 'i', 'did', 'of', 'and', 'then', 'the', 'with', 'plus',
])

/**
 * Rough pronunciation key, so "pușap" ≈ "push up", "scuați" ≈ "squats", "bărpi" ≈ "burpees":
 * drop plural endings, fold letters that sound alike, collapse vowel runs.
 */
export function phoneticKey(words: string): string {
  return words.split(' ')
    .map(w => (w.length > 4 ? w.replace(/(urile|uri|ul|s)$/, '') : w))
    .join('')
    .replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f')
    .replace(/([sc])h/g, '$1')
    .replace(/ck|[kq]/g, 'c')
    .replace(/w/g, 'u')
    .replace(/y/g, 'i')
    .replace(/x/g, 'cs')
    .replace(/z/g, 's')
    .replace(/j/g, 'g')
    .replace(/[aeiou]+/g, 'a')
    .replace(/(.)\1+/g, '$1')
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

interface SoundKey { key: string; name: string; span: number }

function buildSoundKeys(matchers: Matcher[]): SoundKey[] {
  const seen = new Set<string>()
  const out: SoundKey[] = []
  for (const m of matchers) {
    const key = phoneticKey(m.phrase)
    if (key.length < 3 || seen.has(`${key}|${m.name}`)) continue
    seen.add(`${key}|${m.name}`)
    out.push({ key, name: m.name, span: m.phrase.split(' ').length })
  }
  return out
}

const SOUND_MATCH = 0.8      // similarity to accept a sound-alike name
const SOUND_ALTERNATIVE = 0.75

/** Best sound-alike catalogue names for a clause: name → { similarity, words covered }. */
function soundMatches(text: string, keys: SoundKey[]): Map<string, { sim: number; span: number }> {
  const words = text.split(' ').filter(w => w && !/\d/.test(w) && !STOP_WORDS.has(w))
  const best = new Map<string, { sim: number; span: number }>()
  for (let n = 1; n <= Math.min(4, words.length); n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const k = phoneticKey(words.slice(i, i + n).join(' '))
      if (k.length < 3) continue
      for (const sk of keys) {
        if (Math.abs(k.length - sk.key.length) > 3) continue
        const sim = 1 - levenshtein(k, sk.key) / Math.max(k.length, sk.key.length)
        if (sim < SOUND_ALTERNATIVE) continue
        const cur = best.get(sk.name)
        if (!cur || sim > cur.sim || (sim === cur.sim && n > cur.span)) best.set(sk.name, { sim, span: n })
      }
    }
  }
  return best
}

interface Detection { name: string; alternatives: string[]; uncertain: boolean }

/**
 * Which exercise a clause names. Exact names/aliases win; a sound-alike that covers more
 * words ("pistolul squat" vs "squat") takes over and the generic one becomes an alternative.
 * With no exact hit, the closest sound-alike is used and flagged as uncertain.
 */
function detectExercise(text: string, matchers: Matcher[], keys: SoundKey[]): Detection | null {
  const padded = ` ${text} `
  const exact = matchers.filter(m => m.re.test(padded))           // longest phrase first
  const sounds = [...soundMatches(text, keys)]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.sim - a.sim || b.span - a.span)
  const uniq = (names: string[], not: string) => [...new Set(names)].filter(n => n !== not).slice(0, 3)

  if (exact.length > 0) {
    const top = exact[0]
    const topSpan = top.phrase.split(' ').length
    // Other exact hits that aren't just part of the top phrase ("squat" inside "pistol squat")
    const otherExact = exact.slice(1).filter(m => m.name !== top.name && !top.phrase.includes(m.phrase)).map(m => m.name)
    const moreSpecific = sounds.filter(c => c.name !== top.name && c.sim >= SOUND_MATCH && c.span > topSpan)
    if (moreSpecific.length > 0) {
      return { name: moreSpecific[0].name, alternatives: uniq([top.name, ...moreSpecific.slice(1).map(c => c.name), ...otherExact], moreSpecific[0].name), uncertain: false }
    }
    return { name: top.name, alternatives: uniq(otherExact, top.name), uncertain: false }
  }

  if (sounds.length === 0 || sounds[0].sim < SOUND_MATCH) return null
  return { name: sounds[0].name, alternatives: uniq(sounds.slice(1).map(c => c.name), sounds[0].name), uncertain: true }
}

// ── Number words → digits (RO + EN) ──────────────────────────────────────────

const UNITS: Record<string, number> = {
  zero: 0, unu: 1, una: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10,
  unsprezece: 11, doisprezece: 12, douasprezece: 12, treisprezece: 13, paisprezece: 14, cincisprezece: 15,
  saisprezece: 16, saptesprezece: 17, optsprezece: 18, nouasprezece: 19,
  // Spoken forms ("unșpe", "cinșpe", "douășpe")
  unspe: 11, doispe: 12, douaspe: 12, treispe: 13, paispe: 14, cinspe: 15, cincispe: 15,
  saispe: 16, saptispe: 17, saptespe: 17, optispe: 18, optspe: 18, nouaspe: 19,
  // English numbers as ro-RO recognition spells them ("faiv push ups")
  uan: 1, tri: 3, faiv: 5, fiv: 5, sics: 6, sevan: 7, eit: 8, nain: 9, tuelv: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  douazeci: 20, treizeci: 30, patruzeci: 40, cincizeci: 50, saizeci: 60, saptezeci: 70, optzeci: 80, nouazeci: 90,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  tuenti: 20, terti: 30, forti: 40, fifti: 50,
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
  alternatives: string[]
  uncertain: boolean
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
      // "flotări 3 50" → 3 sets of 50; "tracțiuni 10, 8" / "12 10" → two sets
      if (rest[0] <= MAX_BARE_SETS && rest[0] < rest[1]) { sets = rest[0]; reps = rest[1] }
      else repsList = rest
    } else {
      reps = rest[0]
    }
  }

  // Seconds-based exercise: a bare number means seconds
  if (metric === 'seconds') {
    if (seconds === 0) {
      // repsList stays: each bare number is one set's duration ("plank 60 45")
      if (!repsList && reps !== undefined) { seconds = reps; reps = undefined }
    } else {
      repsList = null
      if (sets === undefined && reps !== undefined) {
        sets = reps; reps = undefined       // "l-sit 2 x 15 secunde"
      }
    }
  }

  const base: ParsedSet = {
    ...(metric === 'reps' && reps !== undefined && { reps: clamp(reps, 1, MAX_REPS) }),
    ...(seconds > 0 && { durationSeconds: clamp(seconds, 1, MAX_SECONDS) }),
    ...(weightKg !== undefined && { weightKg: clamp(weightKg, 0, MAX_KG) }),
    ...(bandKg !== undefined && { bandKg: clamp(bandKg, 0, MAX_KG) }),
  }
  const parsedSets: ParsedSet[] = repsList
    ? repsList.slice(0, MAX_SETS).map(r => metric === 'reps'
      ? { ...base, reps: clamp(r, 1, MAX_REPS) }
      : { ...base, durationSeconds: clamp(r, 1, MAX_SECONDS) })
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
    if (ex.uncertain) existing.uncertain = true
    const alts = [...new Set([...(existing.alternatives ?? []), ...(ex.alternatives ?? [])])].filter(n => n !== existing.name)
    if (alts.length) existing.alternatives = alts.slice(0, 3)
  }
  return out
}

/**
 * Split a clause naming several exercises ("1 serie de 10 muscle ups 4 serii de 10 tracțiuni")
 * into one piece per exercise. Numbers before the first name → "N serii de M <ex>" order,
 * so cut after each name; otherwise "<ex> 3x10" order, so cut before each name.
 */
function splitMultiExercise(text: string, matchers: Matcher[]): string[] {
  const padded = ` ${text} `
  const taken: { start: number; end: number }[] = []
  for (const m of matchers) {
    const re = new RegExp(m.re.source, 'g')
    let hit: RegExpExecArray | null
    while ((hit = re.exec(padded))) {
      const start = hit.index + (hit[0].length - hit[0].trimStart().length)
      const end = hit.index + hit[0].length
      if (!taken.some(t => start < t.end && end > t.start)) taken.push({ start, end })
      re.lastIndex = Math.max(re.lastIndex, hit.index + 1)
    }
  }
  if (taken.length < 2) return [text]
  taken.sort((a, b) => a.start - b.start)
  const cuts = /\d/.test(padded.slice(0, taken[0].start))
    ? taken.slice(0, -1).map(t => t.end)
    : taken.slice(1).map(t => t.start)
  const pieces: string[] = []
  let from = 0
  for (const c of [...cuts, padded.length]) { pieces.push(padded.slice(from, c).trim()); from = c }
  return pieces.filter(Boolean)
}

/** Deterministic rule-based parser. Handles RO + EN, digits or number words. */
export function parseWorkoutText(input: string, catalogue: ParseCatalogueEntry[]): ParsedWorkout {
  const matchers = buildMatchers(catalogue)
  const keys = buildSoundKeys(matchers)
  const metricOf = (name: string) => catalogue.find(e => e.name === name)?.metric ?? 'reps'
  const text = wordsToDigits(normalizeText(input))

  const clauses: Clause[] = text.split(CLAUSE_SPLIT)
    .map(s => s?.trim() ?? '')
    .filter(Boolean)
    .flatMap(s => splitMultiExercise(s, matchers))
    .map(s => {
      const d = detectExercise(s, matchers, keys)
      return { text: s, exercise: d?.name ?? null, alternatives: d?.alternatives ?? [], uncertain: d?.uncertain ?? false, hasNumbers: /\d/.test(s) }
    })

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
      if (!prev.exercise) {
        prev.exercise = c.exercise
        prev.alternatives = c.alternatives
        prev.uncertain = c.uncertain
      }
      prev.hasNumbers = true
      continue
    }
    groups.push({ ...c })
  }

  const exercises: ParsedExercise[] = []
  const unrecognized: string[] = []
  for (const g of groups) {
    if (!g.exercise) { if (g.hasNumbers || g.text.split(' ').length > 1) unrecognized.push(g.text); continue }
    exercises.push({
      ...parseClause(g.text, g.exercise, metricOf(g.exercise)),
      ...(g.alternatives.length > 0 && { alternatives: g.alternatives }),
      ...(g.uncertain && { uncertain: true }),
    })
  }
  return { exercises: mergeByName(exercises), unrecognized }
}

/**
 * Add the rule parser's "did you mean" hints to another result (the AI's): same-name
 * alternatives are merged, and a name the rules picked instead of the AI's (e.g. Pistol
 * Squat where the AI said Squaturi) is offered as an alternative to that exercise.
 */
export function mergeAlternatives(primary: ParsedWorkout, hints: ParsedWorkout): ParsedWorkout {
  const names = new Set(primary.exercises.map(e => e.name))
  const exercises = primary.exercises.map(ex => {
    const extra: string[] = []
    for (const h of hints.exercises) {
      if (h.name === ex.name) extra.push(...(h.alternatives ?? []))
      else if (!names.has(h.name) && (h.alternatives ?? []).includes(ex.name)) extra.push(h.name)
    }
    const alternatives = [...new Set([...(ex.alternatives ?? []), ...extra])].filter(n => n !== ex.name).slice(0, 3)
    return alternatives.length > 0 ? { ...ex, alternatives } : ex
  })
  return { ...primary, exercises }
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
    const ex = (item && typeof item === 'object' ? item : {}) as { name?: unknown; sets?: unknown; alternatives?: unknown }
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
    const alternatives = [...new Set((Array.isArray(ex.alternatives) ? ex.alternatives : [])
      .filter((a): a is string => typeof a === 'string')
      .map(a => resolveExerciseName(a, catalogue))
      .filter((a): a is string => !!a && a !== name))].slice(0, 3)
    exercises.push({ name, sets, ...(missing && { missing }), ...(alternatives.length > 0 && { alternatives }) })
  }
  return { exercises: mergeByName(exercises), unrecognized }
}
