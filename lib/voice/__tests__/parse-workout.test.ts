import { describe, it, expect } from 'vitest'
import { mergeAlternatives, parseWorkoutText, phoneticKey, sanitizeParsedWorkout, wordsToDigits } from '../parse-workout'
import { DEFAULT_EXERCISE_CATALOGUE } from '@/lib/data/exercise-catalogue'

const cat = DEFAULT_EXERCISE_CATALOGUE.map(e => ({ name: e.name, metric: e.metric }))
const parse = (t: string) => parseWorkoutText(t, cat)
const names = (t: string) => parse(t).exercises.map(e => e.name)

describe('exercise names', () => {
  it('prefers the specific variant over the generic one', () => {
    expect(names('3 sets of 10 pistol squats')).toEqual(['Pistol Squat'])
    expect(names('3 serii de 10 pistol squat-uri')).toEqual(['Pistol Squat'])
    expect(names('3x10 diamond push ups')).toEqual(['Diamond Push-up'])
    expect(names('handstand push ups 3x5')).toEqual(['Handstand Push-up'])
  })

  it('offers a choice when a qualifier was half-heard', () => {
    const ex = parse('pistolul squat 3x5').exercises[0]
    expect(ex.name).toBe('Pistol Squat')
    expect(ex.alternatives).toContain('Squaturi')
    expect(ex.sets).toHaveLength(3)
  })

  it('understands how Romanian recognition spells English names', () => {
    expect(names('3 serii de 20 de pușapuri')).toEqual(['Flotări'])
    expect(names('pulapuri 4x8')).toEqual(['Tracțiuni'])
    expect(names('scuați 3 serii de 15')).toEqual(['Squaturi'])
    expect(names('bărpi 20')).toEqual(['Burpees'])
    expect(names('el sit 30 de secunde')).toEqual(['L-Sit'])
  })

  it('falls back to sound-alike names and flags them as uncertain', () => {
    const ex = parse('3 serii de 10 dipsurile').exercises[0]
    expect(ex.name).toBe('Dips')
    const fuzzy = parse('front leaver 10 secunde').exercises[0]
    expect(fuzzy.name).toBe('Front Lever')
    expect(fuzzy.uncertain).toBe(true)
  })

  it('does not invent exercises from filler words', () => {
    const r = parse('am alergat 5 km și apoi am mâncat')
    expect(r.exercises).toEqual([])
  })
})

describe('numbers', () => {
  it('reads spoken Romanian numbers', () => {
    expect(wordsToDigits('cinspe flotari unspe tractiuni douaspe dips')).toBe('15 flotari 11 tractiuni 12 dips')
    expect(parse('trei serii a câte cinșpe flotări').exercises[0].sets).toEqual([{ reps: 15 }, { reps: 15 }, { reps: 15 }])
  })

  it('keeps the existing set/rep rules', () => {
    expect(parse('3 serii de 50 de flotări, 5 serii de tracțiuni').exercises).toEqual([
      { name: 'Flotări', sets: [{ reps: 50 }, { reps: 50 }, { reps: 50 }] },
      { name: 'Tracțiuni', sets: [{}, {}, {}, {}, {}], missing: 'reps' },
    ])
    expect(parse('tracțiuni 10, 8, 6').exercises[0].sets.map(s => s.reps)).toEqual([10, 8, 6])
    expect(parse('plank 60 de secunde').exercises[0].sets).toEqual([{ durationSeconds: 60 }])
  })
})

describe('phonetic key', () => {
  it('folds spellings that sound alike', () => {
    expect(phoneticKey('push up')).toBe(phoneticKey('pusap'))
    expect(phoneticKey('squats')).toBe(phoneticKey('scuat'))
    expect(phoneticKey('lunges')).not.toBe(phoneticKey('plank'))
  })
})

describe('AI output', () => {
  it('keeps valid alternatives and drops unknown ones', () => {
    const r = sanitizeParsedWorkout({
      exercises: [{ name: 'Squaturi', sets: [{ reps: 10 }], alternatives: ['Pistol Squat', 'Unknown thing', 'Squaturi'] }],
      unrecognized: [],
    }, cat)
    expect(r.exercises[0].alternatives).toEqual(['Pistol Squat'])
  })
})

describe('merging AI and rule results', () => {
  it('offers the rules pick when the AI chose the generic exercise', () => {
    const ai = { exercises: [{ name: 'Squaturi', sets: [{ reps: 5 }] }], unrecognized: [] }
    const merged = mergeAlternatives(ai, parse('pistolul squat 3x5'))
    expect(merged.exercises[0].name).toBe('Squaturi')
    expect(merged.exercises[0].alternatives).toEqual(['Pistol Squat'])
  })
})
