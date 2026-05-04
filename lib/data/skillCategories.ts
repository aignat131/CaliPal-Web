import { collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { SkillCategoryDef } from '@/types'

// ── Default categories — must match Android's defaultSkillCategories() exactly ─

export const DEFAULT_SKILL_CATEGORIES: SkillCategoryDef[] = [
  {
    id: 'statics',
    name: 'Statice',
    order: 1,
    question: 'Ce mișcări statice poți face sau vrei să înveți?',
    skills: [
      { id: 'front_lever', name: 'Front Lever' },
      { id: 'handstand',   name: 'Handstand' },
      { id: 'planche',     name: 'Planche' },
      { id: 'back_lever',  name: 'Back Lever' },
      { id: 'human_flag',  name: 'Human Flag' },
      { id: 'l_sit',       name: 'L-Sit' },
      { id: 'v_sit',       name: 'V-Sit' },
      { id: 'manna',       name: 'Manna' },
      { id: 'dragon_flag', name: 'Dragon Flag' },
    ],
  },
  {
    id: 'strength',
    name: 'Forță',
    order: 2,
    question: 'Ce exerciții de forță stăpânești sau vrei să înveți?',
    skills: [
      { id: 'muscle_up',         name: 'Muscle Up' },
      { id: 'handstand_pushup',  name: 'Handstand Push-Up' },
      { id: 'one_arm_pullup',    name: 'One-Arm Pull-Up' },
      { id: 'one_arm_pushup',    name: 'One-Arm Push-Up' },
      { id: 'pistol_squat',      name: 'Pistol Squat' },
      { id: 'pike_pushup',       name: 'Pike Push-Up' },
      { id: 'archer_pushup',     name: 'Archer Push-Up' },
      { id: 'ring_dips',         name: 'Ring Dips' },
      { id: 'typewriter_pullup', name: 'Typewriter Pull-Up' },
    ],
  },
  {
    id: 'flexibility',
    name: 'Flexibilitate',
    order: 3,
    question: 'Ce exerciții de flexibilitate faci sau vrei să înveți?',
    skills: [
      { id: 'splits',              name: 'Splits' },
      { id: 'side_splits',         name: 'Side Splits' },
      { id: 'fingers_to_floor',    name: 'Fingers to Floor' },
      { id: 'bridge',              name: 'Bridge' },
      { id: 'pike_stretch',        name: 'Pike Stretch' },
      { id: 'pancake_stretch',     name: 'Pancake Stretch' },
      { id: 'shoulder_dislocates', name: 'Shoulder Dislocates' },
      { id: 'scorpion_pose',       name: 'Scorpion Pose' },
    ],
  },
  {
    id: 'cardio',
    name: 'Cardio',
    order: 4,
    question: 'Ce provocări cardio ai completat sau vrei să completezi?',
    skills: [
      { id: 'run_1k',                name: '1km Run' },
      { id: 'run_5k',                name: '5km Run' },
      { id: 'run_10k',               name: '10km Run' },
      { id: 'run_20k',               name: '20km Run' },
      { id: 'challenge_100_pushups', name: '100 Push-Ups Challenge' },
      { id: 'challenge_50_pullups',  name: '50 Pull-Ups Challenge' },
      { id: 'workout_1h',            name: '1-Hour Workout' },
      { id: 'tabata',                name: 'Tabata' },
    ],
  },
]

/**
 * Load skill categories from Firestore skillCategories collection.
 * Falls back to DEFAULT_SKILL_CATEGORIES if the collection is empty or an error occurs.
 * Mirrors Android's loadOrSeedCategories() behaviour.
 */
export async function loadSkillCategories(db: Firestore): Promise<SkillCategoryDef[]> {
  try {
    const snap = await getDocs(collection(db, 'skillCategories'))
    if (snap.empty) {
      await seedSkillCategories(db)
      return DEFAULT_SKILL_CATEGORIES
    }
    const cats: SkillCategoryDef[] = snap.docs.map(d => {
      const data = d.data()
      const rawSkills = (data.skills ?? []) as { id: string; name: string }[]
      return {
        id:       d.id,
        name:     data.name ?? '',
        order:    data.order ?? 0,
        question: data.question ?? '',
        skills:   rawSkills.map(s => ({ id: s.id, name: s.name })),
      }
    })
    return cats.sort((a, b) => a.order - b.order)
  } catch {
    return DEFAULT_SKILL_CATEGORIES
  }
}

/**
 * Seed Firestore skillCategories with the default categories.
 * Called automatically when the collection is empty (first ever assessment).
 */
export async function seedSkillCategories(db: Firestore): Promise<void> {
  try {
    const batch = writeBatch(db)
    for (const cat of DEFAULT_SKILL_CATEGORIES) {
      const ref = doc(db, 'skillCategories', cat.id)
      batch.set(ref, {
        name:     cat.name,
        order:    cat.order,
        question: cat.question,
        skills:   cat.skills.map(s => ({ id: s.id, name: s.name })),
      })
    }
    await batch.commit()
  } catch {
    // Non-fatal — hardcoded defaults will be used
  }
}
