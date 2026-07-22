export interface ExerciseMetadata {
  description: string
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'elite'
  tip: string
  animationId?: string
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const METADATA: Array<{ pattern: string; meta: ExerciseMetadata }> = [
  // ── Trageri (Pulls) ──────────────────────────────────────────────────────
  {
    pattern: 'tractiuni',
    meta: {
      description: 'Exercițiu fundamental de tragere. Agață-te de bară cu priză pronată și trage-te până bărbia trece de bară.',
      difficulty: 'intermediate',
      tip: 'Activează spatele și trage coatele în jos, nu te balansa.',
      animationId: 'pullup',
    },
  },
  {
    pattern: 'chin-up',
    meta: {
      description: 'Tragere la bară cu priză supinată. Implicare mai mare a bicepsului.',
      difficulty: 'intermediate',
      tip: 'Strânge lama omoplaților în spate la fiecare repetare.',
      animationId: 'pullup',
    },
  },
  {
    pattern: 'australian',
    meta: {
      description: 'Tragere orizontală la bară joasă. Varianta ideală pentru pregătirea tracțiunilor complete.',
      difficulty: 'beginner',
      tip: 'Menține corpul drept ca o scândură, trage pieptul la bară.',
      animationId: 'pullup',
    },
  },
  {
    pattern: 'chest-to-bar',
    meta: {
      description: 'Tracțiune avansată unde pieptul atinge bara, nu doar bărbia.',
      difficulty: 'advanced',
      tip: 'Trage coatele în spate și arcuiește ușor spatele sus.',
      animationId: 'pullup',
    },
  },
  {
    pattern: 'muscle-up',
    meta: {
      description: 'Combinație de tracțiune și împingere — treci de la atârnat la sprijin deasupra barei.',
      difficulty: 'advanced',
      tip: 'Folosește un kip controlat și rotește încheieturile rapid la tranziție.',
      animationId: 'muscle-up',
    },
  },
  {
    pattern: 'one-arm pull',
    meta: {
      description: 'Tracțiune cu o singură mână. Unul dintre cele mai grele exerciții de tragere.',
      difficulty: 'elite',
      tip: 'Antrenează mai întâi tracțiuni asimetrice și negative cu o mână.',
      animationId: 'pullup',
    },
  },
  {
    pattern: 'tractiuni negative',
    meta: {
      description: 'Coborâre lentă de la bară. Construiește forța necesară pentru tracțiuni complete.',
      difficulty: 'beginner',
      tip: 'Coboară cât mai lent (3-5 secunde), controlat.',
      animationId: 'pullup',
    },
  },
  {
    pattern: 'tractiuni inalte',
    meta: {
      description: 'Tracțiune explozivă unde tragi mult deasupra barei.',
      difficulty: 'advanced',
      tip: 'Trage exploziv și concentrează-te pe înălțime, nu pe număr.',
      animationId: 'pullup',
    },
  },

  // ── Împingeri (Pushes) ───────────────────────────────────────────────────
  {
    pattern: 'flotari',
    meta: {
      description: 'Exercițiu fundamental de împingere. Coboară pieptul la podea menținând corpul drept.',
      difficulty: 'beginner',
      tip: 'Coatele la 45°, nu le deschide lateral. Corpul drept tot timpul.',
      animationId: 'pushup',
    },
  },
  {
    pattern: 'diamond',
    meta: {
      description: 'Flotare cu mâinile apropiate în formă de diamant. Accent mare pe triceps.',
      difficulty: 'intermediate',
      tip: 'Lipește degetele mari și arătătoarele. Coatele lipite de corp.',
      animationId: 'pushup',
    },
  },
  {
    pattern: 'pike push',
    meta: {
      description: 'Flotare cu șoldul ridicat în V. Pregătire pentru flotările în stând pe mâini.',
      difficulty: 'intermediate',
      tip: 'Împinge vertical, nu orizontal. Capul trece printre brațe.',
      animationId: 'pike-pushup',
    },
  },
  {
    pattern: 'handstand push',
    meta: {
      description: 'Flotare în stând pe mâini, lângă perete. Forță maximă de împingere verticală.',
      difficulty: 'advanced',
      tip: 'Coboară controlat până capul atinge podeaua, apoi împinge exploziv.',
      animationId: 'pike-pushup',
    },
  },
  {
    pattern: 'one-arm push',
    meta: {
      description: 'Flotare cu o singură mână. Necesită forță și stabilitate excepționale.',
      difficulty: 'elite',
      tip: 'Picioarele mai larg, rotește ușor corpul spre mâna de sprijin.',
      animationId: 'pushup',
    },
  },
  {
    pattern: 'dips',
    meta: {
      description: 'Împingere pe bare paralele. Lucrează pieptul, tricepsul și deltoidul anterior.',
      difficulty: 'intermediate',
      tip: 'Înclină ușor corpul în față pentru piept, vertical pentru triceps.',
      animationId: 'dip',
    },
  },
  {
    pattern: 'ring dip',
    meta: {
      description: 'Dips pe inele de gimnastică. Mai greu decât pe bare datorită instabilității.',
      difficulty: 'advanced',
      tip: 'Rotește inelele în afară la partea de sus pentru activare maximă.',
      animationId: 'dip',
    },
  },

  // ── Core ─────────────────────────────────────────────────────────────────
  {
    pattern: 'l-sit',
    meta: {
      description: 'Ținere statică cu picioarele la 90° față de corp. Lucrează core-ul și flexorii șoldului.',
      difficulty: 'intermediate',
      tip: 'Împinge cu palmele în podea, ridică șoldurile, picioare drepte.',
      animationId: 'lsit',
    },
  },
  {
    pattern: 'dragon flag',
    meta: {
      description: 'Exercițiu avansat de core. Ridici corpul drept, ținut doar de umeri.',
      difficulty: 'advanced',
      tip: 'Începe cu varianta tuck. Coboară lent, nu lăsa șoldurile să cadă.',
      animationId: 'leg-raise',
    },
  },
  {
    pattern: 'hollow body',
    meta: {
      description: 'Ținere de core cu spatele lipit de podea, brațele și picioarele ridicate.',
      difficulty: 'beginner',
      tip: 'Presează zona lombară în podea. Dacă e greu, îndoaie genunchii.',
      animationId: 'hollow-hold',
    },
  },
  {
    pattern: 'arch body',
    meta: {
      description: 'Ținere pe burtă cu brațele și picioarele ridicate. Complementul Hollow Body.',
      difficulty: 'beginner',
      tip: 'Strânge fesierul și ridică de la omoplați, nu doar brațele.',
    },
  },
  {
    pattern: 'leg raises',
    meta: {
      description: 'Ridicări de picioare atârnând de bară. Excelent pentru abdomenul inferior.',
      difficulty: 'intermediate',
      tip: 'Controlează coborârea, nu balansa. Ridică până la 90°.',
      animationId: 'leg-raise',
    },
  },
  {
    pattern: 'plank',
    meta: {
      description: 'Ținere izometrică în poziție de flotare pe antebrațe. Fundament pentru core.',
      difficulty: 'beginner',
      tip: 'Strânge abdomenul și fesierul. Nu lăsa șoldurile să cadă.',
      animationId: 'plank',
    },
  },

  // ── Picioare (Legs) ──────────────────────────────────────────────────────
  {
    pattern: 'squaturi',
    meta: {
      description: 'Genuflexiune cu greutatea corpului. Exercițiu fundamental pentru picioare.',
      difficulty: 'beginner',
      tip: 'Genunchii în direcția degetelor, coboară până coapsa e paralelă cu podeaua.',
      animationId: 'squat',
    },
  },
  {
    pattern: 'lunges',
    meta: {
      description: 'Fandare — pas lung cu coborâre pe un picior. Lucrează unilateral.',
      difficulty: 'beginner',
      tip: 'Genunchiul din față nu depășește vârful piciorului. Pas mare.',
      animationId: 'lunge',
    },
  },
  {
    pattern: 'pistol squat',
    meta: {
      description: 'Genuflexiune pe un singur picior. Necesită forță, echilibru și mobilitate.',
      difficulty: 'advanced',
      tip: 'Întinde celălalt picior în față, coboară controlat. Folosește un contrabalans.',
      animationId: 'squat',
    },
  },
  {
    pattern: 'box jump',
    meta: {
      description: 'Salt exploziv pe o cutie sau platformă. Dezvoltă puterea picioarelor.',
      difficulty: 'intermediate',
      tip: 'Aterizează moale cu genunchii ușor flexați. Coboară controlat.',
    },
  },
  {
    pattern: 'calf raise',
    meta: {
      description: 'Ridicare pe vârfuri. Izolează mușchii gambei.',
      difficulty: 'beginner',
      tip: 'Ridică-te cât mai sus, ține 1 secundă sus, coboară lent.',
    },
  },

  // ── Statice (Static holds) ───────────────────────────────────────────────
  {
    pattern: 'front lever',
    meta: {
      description: 'Ținere orizontală cu fața în sus, atârnând de bară. Exercițiu avansat de spate.',
      difficulty: 'advanced',
      tip: 'Începe cu tuck, apoi un picior, apoi full. Retrage omoplații.',
    },
  },
  {
    pattern: 'back lever',
    meta: {
      description: 'Ținere orizontală cu fața în jos, atârnând de bară sau inele.',
      difficulty: 'advanced',
      tip: 'Introdu german hang mai întâi. Rotește ușor brațele în afară.',
    },
  },
  {
    pattern: 'planche',
    meta: {
      description: 'Ținere orizontală doar pe mâini, corpul paralel cu podeaua. Exercițiu de elită.',
      difficulty: 'elite',
      tip: 'Lean forward maxim, protractează omoplații, bloc total al corpului.',
    },
  },
  {
    pattern: 'tuck planche',
    meta: {
      description: 'Varianta Planche cu genunchii la piept. Primul pas spre planche completă.',
      difficulty: 'advanced',
      tip: 'Lean forward, genunchii la piept, rotunjește ușor spatele.',
    },
  },
  {
    pattern: 'handstand hold',
    meta: {
      description: 'Echilibru în stând pe mâini. Fundament pentru multe skill-uri avansate.',
      difficulty: 'intermediate',
      tip: 'Împinge podeaua, umerii activi. Privește între mâini.',
    },
  },
  {
    pattern: 'dead hang',
    meta: {
      description: 'Atârnat pasiv de bară cu brațele extinse. Întărește priza și decomprimă coloana.',
      difficulty: 'beginner',
      tip: 'Relaxează umerii, respiră adânc. Priză completă pe bară.',
      animationId: 'hang',
    },
  },

  // ── Cardio ───────────────────────────────────────────────────────────────
  {
    pattern: 'burpees',
    meta: {
      description: 'Combinație de flotare, squat și salt. Exercițiu complet, cardio intens.',
      difficulty: 'intermediate',
      tip: 'Pieptul atinge podeaua, salt exploziv cu mâinile deasupra capului.',
    },
  },
  {
    pattern: 'mountain climbers',
    meta: {
      description: 'Aduceri de genunchi alternativ în poziție de flotare. Cardio și core.',
      difficulty: 'beginner',
      tip: 'Menține șoldurile joase, genunchiul vine la piept rapid.',
    },
  },
  {
    pattern: 'jumping jacks',
    meta: {
      description: 'Sărituri cu deschiderea și închiderea brațelor și picioarelor. Încălzire clasică.',
      difficulty: 'beginner',
      tip: 'Mișcări complete — mâinile se ating deasupra capului.',
    },
  },

  // ── Izometrice ───────────────────────────────────────────────────────────
  {
    pattern: 'tractiuni izometrice',
    meta: {
      description: 'Ținere statică la diferite unghiuri pe tracțiune. Construiește forță la punctele slabe.',
      difficulty: 'intermediate',
      tip: 'Ține 5-10 secunde la 90° și la bărbie deasupra barei.',
    },
  },
  {
    pattern: 'flotare izometrica',
    meta: {
      description: 'Ținere statică în poziția de jos a flotării. Construiește forță în punctul cel mai greu.',
      difficulty: 'intermediate',
      tip: 'Coatele la 90°, corp drept, respiră controlat.',
    },
  },
  {
    pattern: 'squat izometric',
    meta: {
      description: 'Ținere statică cu coapsa paralelă cu podeaua. Rezistență la nivel de picioare.',
      difficulty: 'beginner',
      tip: 'Spatele lipit de perete pentru varianta wall sit. Genunchii la 90°.',
    },
  },
]

/**
 * Look up metadata for an exercise by name. Uses substring matching
 * on the normalized name, similar to musclemap.ts NAME_OVERRIDES.
 */
export function getExerciseMetadata(name: string): ExerciseMetadata | null {
  const n = normalize(name)
  for (const { pattern, meta } of METADATA) {
    if (n.includes(normalize(pattern))) return meta
  }
  return null
}

/** Infer difficulty from category when no specific metadata exists */
export function inferDifficulty(category: string): ExerciseMetadata['difficulty'] {
  switch (category) {
    case 'Trageri':     return 'intermediate'
    case 'Împingeri':   return 'intermediate'
    case 'Core':        return 'beginner'
    case 'Picioare':    return 'beginner'
    case 'Statice':     return 'advanced'
    case 'Izometrice':  return 'intermediate'
    case 'Cardio':      return 'beginner'
    case 'Cu Greutate': return 'intermediate'
    case 'Cu Bandă':    return 'beginner'
    default:            return 'beginner'
  }
}
