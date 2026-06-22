// Hardcoded training programs. Each week has 3 training days (Mon/Wed/Fri pattern).
// Programs are designed for calisthenics progression.

export interface ProgramExercise {
  name: string
  sets: number
  repsPerSet: number
  metric: 'reps' | 'seconds'
  notes?: string
}

export interface ProgramDay {
  dayLabel: string          // e.g. "Zi 1 — Trageri"
  exercises: ProgramExercise[]
  restDay: boolean
}

export interface ProgramWeek {
  weekNumber: number
  weekLabel: string         // e.g. "Săptămâna 1 — Fundament"
  days: ProgramDay[]
}

export interface TrainingProgram {
  id: string
  name: string
  description: string
  level: 'beginner' | 'intermediate' | 'advanced'
  durationWeeks: number
  focusEmoji: string
  focusLabel: string
  weeks: ProgramWeek[]
}

// ── Program 1: Fundament Calistenie (Beginner, 4 weeks) ───────────────────────

const FUNDAMENT: TrainingProgram = {
  id: 'fundament-calistenie',
  name: 'Fundament Calistenie',
  description: 'Programul perfect pentru cei care încep calistenia. Construiești forță de bază în trageri, împingeri și core în 4 săptămâni progresive.',
  level: 'beginner',
  durationWeeks: 4,
  focusEmoji: '🌱',
  focusLabel: 'Forță de bază',
  weeks: [
    {
      weekNumber: 1,
      weekLabel: 'Săptămâna 1 — Adaptare',
      days: [
        {
          dayLabel: 'Zi 1 — Tracțiuni & Flotări',
          restDay: false,
          exercises: [
            { name: 'Dead Hang',          sets: 3, repsPerSet: 20, metric: 'seconds', notes: 'Agăță-te pe bara cu brațele extinse' },
            { name: 'Australian Pull-up', sets: 3, repsPerSet: 5,  metric: 'reps',    notes: 'Ține spatele drept' },
            { name: 'Flotări',            sets: 3, repsPerSet: 8,  metric: 'reps',    notes: 'Coboară pieptul la podea' },
            { name: 'Hollow Body Hold',   sets: 3, repsPerSet: 20, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Picioare & Core',
          restDay: false,
          exercises: [
            { name: 'Squaturi',  sets: 3, repsPerSet: 15, metric: 'reps', notes: 'Genunchii în linie cu degetele de la picioare' },
            { name: 'Lunges',    sets: 3, repsPerSet: 10, metric: 'reps' },
            { name: 'Plank',     sets: 3, repsPerSet: 30, metric: 'seconds' },
            { name: 'Leg Raises',sets: 3, repsPerSet: 10, metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Forță Generală',
          restDay: false,
          exercises: [
            { name: 'Australian Pull-up', sets: 3, repsPerSet: 6,  metric: 'reps' },
            { name: 'Flotări',            sets: 3, repsPerSet: 10, metric: 'reps' },
            { name: 'Dips',               sets: 3, repsPerSet: 6,  metric: 'reps', notes: 'Pe bare paralele sau pe scaun' },
            { name: 'Plank',              sets: 3, repsPerSet: 30, metric: 'seconds' },
          ],
        },
      ],
    },
    {
      weekNumber: 2,
      weekLabel: 'Săptămâna 2 — Progres',
      days: [
        {
          dayLabel: 'Zi 1 — Tracțiuni & Flotări',
          restDay: false,
          exercises: [
            { name: 'Dead Hang',          sets: 3, repsPerSet: 30, metric: 'seconds' },
            { name: 'Australian Pull-up', sets: 4, repsPerSet: 6,  metric: 'reps' },
            { name: 'Flotări',            sets: 4, repsPerSet: 10, metric: 'reps' },
            { name: 'Hollow Body Hold',   sets: 3, repsPerSet: 25, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Picioare & Core',
          restDay: false,
          exercises: [
            { name: 'Squaturi',   sets: 4, repsPerSet: 15, metric: 'reps' },
            { name: 'Lunges',     sets: 3, repsPerSet: 12, metric: 'reps' },
            { name: 'Plank',      sets: 3, repsPerSet: 40, metric: 'seconds' },
            { name: 'Leg Raises', sets: 3, repsPerSet: 12, metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Forță Generală',
          restDay: false,
          exercises: [
            { name: 'Australian Pull-up', sets: 4, repsPerSet: 7,  metric: 'reps' },
            { name: 'Flotări',            sets: 4, repsPerSet: 12, metric: 'reps' },
            { name: 'Dips',               sets: 3, repsPerSet: 8,  metric: 'reps' },
            { name: 'L-Sit',              sets: 3, repsPerSet: 10, metric: 'seconds', notes: 'Încearcă să ridici picioarele de pe podea' },
          ],
        },
      ],
    },
    {
      weekNumber: 3,
      weekLabel: 'Săptămâna 3 — Intensitate',
      days: [
        {
          dayLabel: 'Zi 1 — Prima Tracțiune',
          restDay: false,
          exercises: [
            { name: 'Dead Hang',    sets: 3, repsPerSet: 40, metric: 'seconds' },
            { name: 'Tracțiuni',    sets: 3, repsPerSet: 2,  metric: 'reps',    notes: 'Prima tracțiune completă! Dacă nu poți, continuă cu Australian' },
            { name: 'Flotări',      sets: 4, repsPerSet: 12, metric: 'reps' },
            { name: 'Arch Body Hold',sets: 3, repsPerSet: 20, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Picioare & Core',
          restDay: false,
          exercises: [
            { name: 'Squaturi',   sets: 4, repsPerSet: 20, metric: 'reps' },
            { name: 'Lunges',     sets: 3, repsPerSet: 14, metric: 'reps' },
            { name: 'Plank',      sets: 3, repsPerSet: 50, metric: 'seconds' },
            { name: 'Leg Raises', sets: 3, repsPerSet: 15, metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Forță & Rezistență',
          restDay: false,
          exercises: [
            { name: 'Tracțiuni',  sets: 3, repsPerSet: 3,  metric: 'reps' },
            { name: 'Flotări',    sets: 4, repsPerSet: 15, metric: 'reps' },
            { name: 'Dips',       sets: 4, repsPerSet: 10, metric: 'reps' },
            { name: 'L-Sit',      sets: 3, repsPerSet: 15, metric: 'seconds' },
          ],
        },
      ],
    },
    {
      weekNumber: 4,
      weekLabel: 'Săptămâna 4 — Consolidare',
      days: [
        {
          dayLabel: 'Zi 1 — Trageri',
          restDay: false,
          exercises: [
            { name: 'Tracțiuni',          sets: 4, repsPerSet: 4,  metric: 'reps' },
            { name: 'Australian Pull-up', sets: 2, repsPerSet: 10, metric: 'reps', notes: 'Volum de recuperare' },
            { name: 'Dead Hang',          sets: 2, repsPerSet: 45, metric: 'seconds' },
            { name: 'Hollow Body Hold',   sets: 3, repsPerSet: 30, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Împingeri & Picioare',
          restDay: false,
          exercises: [
            { name: 'Flotări',   sets: 4, repsPerSet: 15, metric: 'reps' },
            { name: 'Dips',      sets: 3, repsPerSet: 10, metric: 'reps' },
            { name: 'Squaturi',  sets: 4, repsPerSet: 20, metric: 'reps' },
            { name: 'Lunges',    sets: 3, repsPerSet: 15, metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Test Final',
          restDay: false,
          exercises: [
            { name: 'Tracțiuni', sets: 3, repsPerSet: 5,  metric: 'reps', notes: 'Încearcă maximul!' },
            { name: 'Flotări',   sets: 3, repsPerSet: 20, metric: 'reps', notes: 'Test max reps' },
            { name: 'L-Sit',     sets: 3, repsPerSet: 20, metric: 'seconds' },
            { name: 'Plank',     sets: 2, repsPerSet: 60, metric: 'seconds' },
          ],
        },
      ],
    },
  ],
}

// ── Program 2: Skill Builder — Muscle Up (Intermediate, 4 weeks) ──────────────

const MUSCLE_UP_PROG: TrainingProgram = {
  id: 'skill-muscle-up',
  name: 'Skill Builder — Muscle Up',
  description: 'Progresezi pas cu pas spre primul tău Muscle Up. Include Chest-to-Bar, Ring Dips și pattern-uri specifice de mișcare.',
  level: 'intermediate',
  durationWeeks: 4,
  focusEmoji: '⚡',
  focusLabel: 'Muscle Up',
  weeks: [
    {
      weekNumber: 1,
      weekLabel: 'Săptămâna 1 — Forță de Tragere',
      days: [
        {
          dayLabel: 'Zi 1 — Trageri Grele',
          restDay: false,
          exercises: [
            { name: 'Tracțiuni',    sets: 5, repsPerSet: 5,  metric: 'reps', notes: 'Greutate corporală, maxim controlat' },
            { name: 'Chest-to-Bar', sets: 3, repsPerSet: 3,  metric: 'reps', notes: 'Atinge bara cu pieptul' },
            { name: 'Dead Hang',    sets: 3, repsPerSet: 60, metric: 'seconds' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 30, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Împingeri & Dips',
          restDay: false,
          exercises: [
            { name: 'Dips',         sets: 4, repsPerSet: 10, metric: 'reps' },
            { name: 'Ring Dip',     sets: 3, repsPerSet: 5,  metric: 'reps', notes: 'Inele instabile — core activ!' },
            { name: 'Flotări',      sets: 4, repsPerSet: 15, metric: 'reps' },
            { name: 'Pike Push-up', sets: 3, repsPerSet: 10, metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Tranziție Muscle Up',
          restDay: false,
          exercises: [
            { name: 'Chest-to-Bar',  sets: 5, repsPerSet: 3,  metric: 'reps', notes: 'Focusează-te pe tracțiunea explozivă' },
            { name: 'Dips',          sets: 5, repsPerSet: 8,  metric: 'reps' },
            { name: 'Arch Body Hold',sets: 3, repsPerSet: 30, metric: 'seconds' },
            { name: 'L-Sit',         sets: 3, repsPerSet: 20, metric: 'seconds' },
          ],
        },
      ],
    },
    {
      weekNumber: 2,
      weekLabel: 'Săptămâna 2 — Explozie',
      days: [
        {
          dayLabel: 'Zi 1 — Tracțiuni Explosive',
          restDay: false,
          exercises: [
            { name: 'Tracțiuni',    sets: 5, repsPerSet: 6,  metric: 'reps' },
            { name: 'Chest-to-Bar', sets: 4, repsPerSet: 4,  metric: 'reps', notes: 'Tracțiune explozivă!' },
            { name: 'Dead Hang',    sets: 3, repsPerSet: 60, metric: 'seconds' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 35, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Împingeri & Core',
          restDay: false,
          exercises: [
            { name: 'Dips',        sets: 5, repsPerSet: 12, metric: 'reps' },
            { name: 'Ring Dip',    sets: 3, repsPerSet: 6,  metric: 'reps' },
            { name: 'L-Sit',       sets: 4, repsPerSet: 25, metric: 'seconds' },
            { name: 'Dragon Flag', sets: 3, repsPerSet: 5,  metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Simulator Muscle Up',
          restDay: false,
          exercises: [
            { name: 'Chest-to-Bar', sets: 6, repsPerSet: 3,  metric: 'reps' },
            { name: 'Dips',         sets: 6, repsPerSet: 8,  metric: 'reps' },
            { name: 'Tracțiuni',    sets: 3, repsPerSet: 5,  metric: 'reps', notes: 'Recuperare activă' },
            { name: 'Plank',        sets: 3, repsPerSet: 60, metric: 'seconds' },
          ],
        },
      ],
    },
    {
      weekNumber: 3,
      weekLabel: 'Săptămâna 3 — Integrare',
      days: [
        {
          dayLabel: 'Zi 1 — Volum Mare',
          restDay: false,
          exercises: [
            { name: 'Tracțiuni',    sets: 6, repsPerSet: 5,  metric: 'reps' },
            { name: 'Chest-to-Bar', sets: 5, repsPerSet: 4,  metric: 'reps' },
            { name: 'Dead Hang',    sets: 2, repsPerSet: 60, metric: 'seconds' },
            { name: 'Hollow Body Hold', sets: 4, repsPerSet: 40, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Forță Push',
          restDay: false,
          exercises: [
            { name: 'Dips',        sets: 5, repsPerSet: 15, metric: 'reps' },
            { name: 'Ring Dip',    sets: 4, repsPerSet: 8,  metric: 'reps' },
            { name: 'Pike Push-up',sets: 4, repsPerSet: 12, metric: 'reps' },
            { name: 'L-Sit',       sets: 4, repsPerSet: 30, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Muscle Up Attempt',
          restDay: false,
          exercises: [
            { name: 'Muscle-Up',    sets: 3, repsPerSet: 1,  metric: 'reps', notes: 'Încearcă! Dacă nu reușești, continuă cu Chest-to-Bar' },
            { name: 'Chest-to-Bar', sets: 4, repsPerSet: 5,  metric: 'reps' },
            { name: 'Dips',         sets: 4, repsPerSet: 10, metric: 'reps' },
            { name: 'Dragon Flag',  sets: 3, repsPerSet: 6,  metric: 'reps' },
          ],
        },
      ],
    },
    {
      weekNumber: 4,
      weekLabel: 'Săptămâna 4 — Consolidare',
      days: [
        {
          dayLabel: 'Zi 1 — Muscle Up Focus',
          restDay: false,
          exercises: [
            { name: 'Muscle-Up',    sets: 5, repsPerSet: 2,  metric: 'reps' },
            { name: 'Tracțiuni',    sets: 3, repsPerSet: 8,  metric: 'reps', notes: 'Volum suport' },
            { name: 'L-Sit',        sets: 3, repsPerSet: 30, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Push Strength',
          restDay: false,
          exercises: [
            { name: 'Dips',     sets: 5, repsPerSet: 15, metric: 'reps' },
            { name: 'Ring Dip', sets: 4, repsPerSet: 10, metric: 'reps' },
            { name: 'Flotări',  sets: 3, repsPerSet: 20, metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Test Max',
          restDay: false,
          exercises: [
            { name: 'Muscle-Up',    sets: 3, repsPerSet: 3,  metric: 'reps', notes: 'Max effort!' },
            { name: 'Tracțiuni',    sets: 2, repsPerSet: 10, metric: 'reps' },
            { name: 'Dips',         sets: 2, repsPerSet: 15, metric: 'reps' },
            { name: 'Hollow Body Hold', sets: 2, repsPerSet: 45, metric: 'seconds' },
          ],
        },
      ],
    },
  ],
}

// ── Program 3: Core & Statice (All levels, 4 weeks) ───────────────────────────

const CORE_STATICS: TrainingProgram = {
  id: 'core-statics',
  name: 'Core & Statice',
  description: 'Construiește un core de oțel și începe să înveți mișcările statice: L-Sit, Front Lever, Planche Lean. Ideal ca program auxiliar.',
  level: 'intermediate',
  durationWeeks: 4,
  focusEmoji: '🔥',
  focusLabel: 'Core & Statice',
  weeks: [
    {
      weekNumber: 1,
      weekLabel: 'Săptămâna 1 — Core Fundament',
      days: [
        {
          dayLabel: 'Zi 1 — Hollow & Arch',
          restDay: false,
          exercises: [
            { name: 'Hollow Body Hold',  sets: 4, repsPerSet: 30, metric: 'seconds' },
            { name: 'Arch Body Hold',    sets: 4, repsPerSet: 30, metric: 'seconds' },
            { name: 'Leg Raises',        sets: 4, repsPerSet: 12, metric: 'reps' },
            { name: 'Plank',             sets: 3, repsPerSet: 45, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — L-Sit Progress',
          restDay: false,
          exercises: [
            { name: 'L-Sit',            sets: 5, repsPerSet: 10, metric: 'seconds', notes: 'Ridică un picior pe rând dacă nu poți ambele' },
            { name: 'Dragon Flag',      sets: 3, repsPerSet: 4,  metric: 'reps' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 35, metric: 'seconds' },
            { name: 'Leg Raises',       sets: 3, repsPerSet: 15, metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Forță Generală',
          restDay: false,
          exercises: [
            { name: 'Tracțiuni',         sets: 3, repsPerSet: 6,  metric: 'reps' },
            { name: 'Flotări',           sets: 3, repsPerSet: 12, metric: 'reps' },
            { name: 'L-Sit',             sets: 4, repsPerSet: 12, metric: 'seconds' },
            { name: 'Hollow Body Hold',  sets: 3, repsPerSet: 30, metric: 'seconds' },
          ],
        },
      ],
    },
    {
      weekNumber: 2,
      weekLabel: 'Săptămâna 2 — Front Lever Intro',
      days: [
        {
          dayLabel: 'Zi 1 — Front Lever Tuck',
          restDay: false,
          exercises: [
            { name: 'Front Lever',      sets: 5, repsPerSet: 8,  metric: 'seconds', notes: 'Genunchii la piept (Tuck Front Lever)' },
            { name: 'Tracțiuni',        sets: 4, repsPerSet: 6,  metric: 'reps' },
            { name: 'Hollow Body Hold', sets: 4, repsPerSet: 40, metric: 'seconds' },
            { name: 'Leg Raises',       sets: 4, repsPerSet: 15, metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 2 — L-Sit & Planche Lean',
          restDay: false,
          exercises: [
            { name: 'L-Sit',           sets: 5, repsPerSet: 15, metric: 'seconds' },
            { name: 'Tuck Planche',    sets: 4, repsPerSet: 8,  metric: 'seconds', notes: 'Caută echilibrul pe palme' },
            { name: 'Dragon Flag',     sets: 4, repsPerSet: 5,  metric: 'reps' },
            { name: 'Plank',           sets: 3, repsPerSet: 60, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Complet',
          restDay: false,
          exercises: [
            { name: 'Front Lever',      sets: 4, repsPerSet: 10, metric: 'seconds' },
            { name: 'L-Sit',            sets: 4, repsPerSet: 15, metric: 'seconds' },
            { name: 'Tracțiuni',        sets: 3, repsPerSet: 8,  metric: 'reps' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 45, metric: 'seconds' },
          ],
        },
      ],
    },
    {
      weekNumber: 3,
      weekLabel: 'Săptămâna 3 — Progres Static',
      days: [
        {
          dayLabel: 'Zi 1 — Front Lever Avansat',
          restDay: false,
          exercises: [
            { name: 'Front Lever',      sets: 6, repsPerSet: 10, metric: 'seconds', notes: 'Un picior extins' },
            { name: 'Tracțiuni',        sets: 5, repsPerSet: 7,  metric: 'reps' },
            { name: 'Dragon Flag',      sets: 4, repsPerSet: 6,  metric: 'reps' },
            { name: 'Hollow Body Hold', sets: 4, repsPerSet: 45, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — L-Sit & Planche',
          restDay: false,
          exercises: [
            { name: 'L-Sit',        sets: 6, repsPerSet: 20, metric: 'seconds' },
            { name: 'Tuck Planche', sets: 5, repsPerSet: 12, metric: 'seconds' },
            { name: 'Leg Raises',   sets: 4, repsPerSet: 20, metric: 'reps' },
            { name: 'Plank',        sets: 3, repsPerSet: 75, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Volum Mare',
          restDay: false,
          exercises: [
            { name: 'Front Lever',      sets: 5, repsPerSet: 12, metric: 'seconds' },
            { name: 'L-Sit',            sets: 5, repsPerSet: 20, metric: 'seconds' },
            { name: 'Tracțiuni',        sets: 4, repsPerSet: 8,  metric: 'reps' },
            { name: 'Flotări',          sets: 4, repsPerSet: 15, metric: 'reps' },
          ],
        },
      ],
    },
    {
      weekNumber: 4,
      weekLabel: 'Săptămâna 4 — Test & Consolidare',
      days: [
        {
          dayLabel: 'Zi 1 — Test Front Lever',
          restDay: false,
          exercises: [
            { name: 'Front Lever',      sets: 5, repsPerSet: 15, metric: 'seconds', notes: 'Cât mai extins!' },
            { name: 'Tracțiuni',        sets: 4, repsPerSet: 8,  metric: 'reps' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 50, metric: 'seconds' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Test L-Sit & Planche',
          restDay: false,
          exercises: [
            { name: 'L-Sit',        sets: 5, repsPerSet: 25, metric: 'seconds', notes: 'Max time!' },
            { name: 'Tuck Planche', sets: 4, repsPerSet: 15, metric: 'seconds' },
            { name: 'Dragon Flag',  sets: 4, repsPerSet: 8,  metric: 'reps' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Test Complet',
          restDay: false,
          exercises: [
            { name: 'Front Lever',      sets: 3, repsPerSet: 15, metric: 'seconds' },
            { name: 'L-Sit',            sets: 3, repsPerSet: 25, metric: 'seconds' },
            { name: 'Tracțiuni',        sets: 3, repsPerSet: 10, metric: 'reps' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 60, metric: 'seconds' },
          ],
        },
      ],
    },
  ],
}

// ── Program 4: Push / Pull / Legs Split (Intermediate, 4 weeks) ─────────────

const PPL_SPLIT: TrainingProgram = {
  id: 'ppl-split',
  name: 'Push / Pull / Legs',
  description: 'Split clasic de calistenie cu 3 zile pe săptămână. Fiecare exercițiu are progresii — alege varianta potrivită nivelului tău.',
  level: 'intermediate',
  durationWeeks: 4,
  focusEmoji: '💪',
  focusLabel: 'Push / Pull / Legs',
  weeks: [
    {
      weekNumber: 1,
      weekLabel: 'Săptămâna 1 — Adaptare',
      days: [
        {
          dayLabel: 'Zi 1 — Push',
          restDay: false,
          exercises: [
            { name: 'Wall Walks',       sets: 3, repsPerSet: 3,  metric: 'reps',    notes: 'Urcă pe perete controlat, coboară la fel' },
            { name: 'Handstand Hold',   sets: 4, repsPerSet: 20, metric: 'seconds', notes: 'Sau Pikestand dacă nu poți Handstand' },
            { name: 'Pike Push-Ups',    sets: 3, repsPerSet: 6,  metric: 'reps',    notes: 'Sau Assisted HSPU dacă ai nivel avansat' },
            { name: 'Dips',             sets: 3, repsPerSet: 8,  metric: 'reps',    notes: 'Ring Dips dacă ai inele, altfel Bar Dips' },
            { name: 'Push-Ups',         sets: 3, repsPerSet: 10, metric: 'reps',    notes: 'Pseudo Push-Ups (avansat) / Knee Push-Ups (începător)' },
            { name: 'Skull Crushers',   sets: 3, repsPerSet: 10, metric: 'reps',    notes: 'Pe inele sau cu bandă elastică' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Legs & Abs',
          restDay: false,
          exercises: [
            { name: 'Squaturi',         sets: 3, repsPerSet: 10, metric: 'reps',    notes: 'Pistol Squats (avansat) / Assisted Pistols (intermediar)' },
            { name: 'Walking Lunges',   sets: 3, repsPerSet: 12, metric: 'reps',    notes: 'Cu sau fără greutate adăugată' },
            { name: 'Nordic Curls',     sets: 3, repsPerSet: 5,  metric: 'reps',    notes: 'Doar faza negativă. Alternativă: Bulgarian Split Squats' },
            { name: 'Calf Raises',      sets: 3, repsPerSet: 15, metric: 'reps',    notes: 'Controlat sus, exploziv la ridicare' },
            { name: 'Leg Raises',       sets: 3, repsPerSet: 10, metric: 'reps',    notes: 'Toes-to-Bar (avansat) / Hanging Leg Raises / Knee Raises' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 30, metric: 'seconds', notes: 'Sau Plank Hold dacă Hollow Body e prea greu' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Pull',
          restDay: false,
          exercises: [
            { name: 'High Pull-Ups',    sets: 3, repsPerSet: 3,  metric: 'reps',    notes: 'Muscle-Ups (avansat) / Band Assisted High Pull-Ups (începător)' },
            { name: 'Tracțiuni',        sets: 3, repsPerSet: 6,  metric: 'reps',    notes: 'Cu greutate (avansat) / Clasice / Australiene (începător)' },
            { name: 'Izometrice',       sets: 3, repsPerSet: 15, metric: 'seconds', notes: 'Hold la bară sus. Alternativă: Negative (coborâre lentă 5s)' },
            { name: 'Australian Pull-Ups', sets: 3, repsPerSet: 10, metric: 'reps', notes: 'Sau Retracții scapulare dacă ești la început' },
          ],
        },
      ],
    },
    {
      weekNumber: 2,
      weekLabel: 'Săptămâna 2 — Volum',
      days: [
        {
          dayLabel: 'Zi 1 — Push',
          restDay: false,
          exercises: [
            { name: 'Wall Walks',       sets: 3, repsPerSet: 4,  metric: 'reps',    notes: 'Controlat, menține poziția sus 3s' },
            { name: 'Handstand Hold',   sets: 4, repsPerSet: 25, metric: 'seconds', notes: 'Sau Pikestand dacă nu poți Handstand' },
            { name: 'Pike Push-Ups',    sets: 4, repsPerSet: 7,  metric: 'reps',    notes: 'Sau Assisted HSPU dacă ai nivel avansat' },
            { name: 'Dips',             sets: 4, repsPerSet: 10, metric: 'reps',    notes: 'Ring Dips dacă ai inele, altfel Bar Dips' },
            { name: 'Push-Ups',         sets: 4, repsPerSet: 12, metric: 'reps',    notes: 'Pseudo Push-Ups (avansat) / Knee Push-Ups (începător)' },
            { name: 'Skull Crushers',   sets: 3, repsPerSet: 12, metric: 'reps',    notes: 'Pe inele sau cu bandă elastică' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Legs & Abs',
          restDay: false,
          exercises: [
            { name: 'Squaturi',         sets: 4, repsPerSet: 10, metric: 'reps',    notes: 'Pistol Squats (avansat) / Assisted Pistols (intermediar)' },
            { name: 'Walking Lunges',   sets: 3, repsPerSet: 14, metric: 'reps',    notes: 'Cu sau fără greutate adăugată' },
            { name: 'Nordic Curls',     sets: 3, repsPerSet: 6,  metric: 'reps',    notes: 'Doar faza negativă. Alternativă: Bulgarian Split Squats' },
            { name: 'Calf Raises',      sets: 4, repsPerSet: 15, metric: 'reps',    notes: 'Controlat sus, exploziv la ridicare' },
            { name: 'Leg Raises',       sets: 4, repsPerSet: 12, metric: 'reps',    notes: 'Toes-to-Bar (avansat) / Hanging Leg Raises / Knee Raises' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 35, metric: 'seconds', notes: 'Sau Plank Hold dacă Hollow Body e prea greu' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Pull',
          restDay: false,
          exercises: [
            { name: 'High Pull-Ups',    sets: 4, repsPerSet: 3,  metric: 'reps',    notes: 'Muscle-Ups (avansat) / Band Assisted High Pull-Ups (începător)' },
            { name: 'Tracțiuni',        sets: 4, repsPerSet: 7,  metric: 'reps',    notes: 'Cu greutate (avansat) / Clasice / Australiene (începător)' },
            { name: 'Izometrice',       sets: 3, repsPerSet: 20, metric: 'seconds', notes: 'Hold la bară sus. Alternativă: Negative (coborâre lentă 5s)' },
            { name: 'Australian Pull-Ups', sets: 3, repsPerSet: 12, metric: 'reps', notes: 'Sau Retracții scapulare dacă ești la început' },
          ],
        },
      ],
    },
    {
      weekNumber: 3,
      weekLabel: 'Săptămâna 3 — Intensitate',
      days: [
        {
          dayLabel: 'Zi 1 — Push',
          restDay: false,
          exercises: [
            { name: 'Wall Walks',       sets: 4, repsPerSet: 4,  metric: 'reps',    notes: 'Menține poziția sus 5s la fiecare rep' },
            { name: 'Handstand Hold',   sets: 5, repsPerSet: 25, metric: 'seconds', notes: 'Sau Pikestand dacă nu poți Handstand' },
            { name: 'Pike Push-Ups',    sets: 4, repsPerSet: 8,  metric: 'reps',    notes: 'Sau Assisted HSPU dacă ai nivel avansat' },
            { name: 'Dips',             sets: 4, repsPerSet: 12, metric: 'reps',    notes: 'Ring Dips dacă ai inele, altfel Bar Dips' },
            { name: 'Push-Ups',         sets: 4, repsPerSet: 14, metric: 'reps',    notes: 'Pseudo Push-Ups (avansat) / Knee Push-Ups (începător)' },
            { name: 'Skull Crushers',   sets: 4, repsPerSet: 12, metric: 'reps',    notes: 'Pe inele sau cu bandă elastică' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Legs & Abs',
          restDay: false,
          exercises: [
            { name: 'Squaturi',         sets: 4, repsPerSet: 12, metric: 'reps',    notes: 'Pistol Squats (avansat) / Assisted Pistols (intermediar)' },
            { name: 'Walking Lunges',   sets: 4, repsPerSet: 14, metric: 'reps',    notes: 'Cu sau fără greutate adăugată' },
            { name: 'Nordic Curls',     sets: 4, repsPerSet: 6,  metric: 'reps',    notes: 'Doar faza negativă. Alternativă: Bulgarian Split Squats' },
            { name: 'Calf Raises',      sets: 4, repsPerSet: 18, metric: 'reps',    notes: 'Controlat sus, exploziv la ridicare' },
            { name: 'Leg Raises',       sets: 4, repsPerSet: 14, metric: 'reps',    notes: 'Toes-to-Bar (avansat) / Hanging Leg Raises / Knee Raises' },
            { name: 'Hollow Body Hold', sets: 4, repsPerSet: 40, metric: 'seconds', notes: 'Sau Plank Hold dacă Hollow Body e prea greu' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Pull',
          restDay: false,
          exercises: [
            { name: 'High Pull-Ups',    sets: 4, repsPerSet: 4,  metric: 'reps',    notes: 'Muscle-Ups (avansat) / Band Assisted High Pull-Ups (începător)' },
            { name: 'Tracțiuni',        sets: 5, repsPerSet: 7,  metric: 'reps',    notes: 'Cu greutate (avansat) / Clasice / Australiene (începător)' },
            { name: 'Izometrice',       sets: 4, repsPerSet: 20, metric: 'seconds', notes: 'Hold la bară sus. Alternativă: Negative (coborâre lentă 5s)' },
            { name: 'Australian Pull-Ups', sets: 4, repsPerSet: 12, metric: 'reps', notes: 'Sau Retracții scapulare dacă ești la început' },
          ],
        },
      ],
    },
    {
      weekNumber: 4,
      weekLabel: 'Săptămâna 4 — Consolidare & Test',
      days: [
        {
          dayLabel: 'Zi 1 — Push (Test)',
          restDay: false,
          exercises: [
            { name: 'Wall Walks',       sets: 3, repsPerSet: 5,  metric: 'reps',    notes: 'Menține poziția sus cât poți!' },
            { name: 'Handstand Hold',   sets: 4, repsPerSet: 30, metric: 'seconds', notes: 'Sau Pikestand — test max time' },
            { name: 'Pike Push-Ups',    sets: 4, repsPerSet: 10, metric: 'reps',    notes: 'Sau Assisted HSPU — test max reps' },
            { name: 'Dips',             sets: 4, repsPerSet: 12, metric: 'reps',    notes: 'Ring Dips dacă ai inele, altfel Bar Dips' },
            { name: 'Push-Ups',         sets: 3, repsPerSet: 15, metric: 'reps',    notes: 'Test max reps pe varianta ta!' },
            { name: 'Skull Crushers',   sets: 3, repsPerSet: 14, metric: 'reps',    notes: 'Pe inele sau cu bandă elastică' },
          ],
        },
        {
          dayLabel: 'Zi 2 — Legs & Abs (Test)',
          restDay: false,
          exercises: [
            { name: 'Squaturi',         sets: 4, repsPerSet: 12, metric: 'reps',    notes: 'Pistol Squats (avansat) / Assisted Pistols — test max!' },
            { name: 'Walking Lunges',   sets: 4, repsPerSet: 16, metric: 'reps',    notes: 'Cu greutate dacă poți' },
            { name: 'Nordic Curls',     sets: 4, repsPerSet: 8,  metric: 'reps',    notes: 'Încearcă negativele mai lente (5s). Alt: Bulgarian Split Squats' },
            { name: 'Calf Raises',      sets: 4, repsPerSet: 20, metric: 'reps',    notes: 'Controlat + exploziv — test max' },
            { name: 'Leg Raises',       sets: 4, repsPerSet: 15, metric: 'reps',    notes: 'Toes-to-Bar (avansat) / Hanging Leg Raises / Knee Raises' },
            { name: 'Hollow Body Hold', sets: 3, repsPerSet: 45, metric: 'seconds', notes: 'Test max time!' },
          ],
        },
        {
          dayLabel: 'Zi 3 — Pull (Test)',
          restDay: false,
          exercises: [
            { name: 'High Pull-Ups',    sets: 5, repsPerSet: 4,  metric: 'reps',    notes: 'Muscle-Ups dacă poți — test max reps!' },
            { name: 'Tracțiuni',        sets: 5, repsPerSet: 8,  metric: 'reps',    notes: 'Cu greutate (avansat) / Clasice — test max!' },
            { name: 'Izometrice',       sets: 3, repsPerSet: 25, metric: 'seconds', notes: 'Hold la bară sus — test max time!' },
            { name: 'Australian Pull-Ups', sets: 3, repsPerSet: 15, metric: 'reps', notes: 'Sau Retracții scapulare — test max' },
          ],
        },
      ],
    },
  ],
}

export const ALL_PROGRAMS: TrainingProgram[] = [FUNDAMENT, MUSCLE_UP_PROG, CORE_STATICS, PPL_SPLIT]

export function getProgramById(id: string): TrainingProgram | undefined {
  return ALL_PROGRAMS.find(p => p.id === id)
}

export const LEVEL_LABELS: Record<string, string> = {
  beginner:     '🌱 Începător',
  intermediate: '🔵 Intermediar',
  advanced:     '🟣 Avansat',
}
