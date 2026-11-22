/**
 * Firestore rules tests for the Progress feature + member-doc hardening.
 * Run with:  npm run test:rules   (starts the Firestore emulator)
 */
import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'

const C = 'comm1'
let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-calipal-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'communities', C), { name: 'Test', creatorId: 'founder' })
    for (const [uid, role] of [['founder', 'ADMIN'], ['coach', 'TRAINER'], ['vol', 'MODERATOR'], ['m1', 'MEMBER'], ['m2', 'MEMBER']]) {
      await setDoc(doc(db, 'communities', C, 'members', uid), { userId: uid, role, points: 0, trainingPoints: 0 })
    }
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()

describe('progress config', () => {
  const cfg = { points: { attendance: 10, goalAchieved: 25 }, testIntervalWeeks: 2 }
  it('Fondator and Antrenor can configure', async () => {
    await assertSucceeds(setDoc(doc(as('founder'), 'communities', C, 'config', 'plan'), cfg))
    await assertSucceeds(setDoc(doc(as('coach'), 'communities', C, 'config', 'plan'), cfg))
  })
  it('Voluntar and Membru cannot configure', async () => {
    await assertFails(setDoc(doc(as('vol'), 'communities', C, 'config', 'plan'), cfg))
    await assertFails(setDoc(doc(as('m1'), 'communities', C, 'config', 'plan'), cfg))
  })
  it('rejects an invalid test interval', async () => {
    await assertFails(setDoc(doc(as('coach'), 'communities', C, 'config', 'plan'), { testIntervalWeeks: 50 }))
  })
})

describe('member doc hardening', () => {
  it('a member cannot promote themselves or edit their points', async () => {
    const ref = doc(as('m1'), 'communities', C, 'members', 'm1')
    await assertFails(updateDoc(ref, { role: 'ADMIN' }))
    await assertFails(updateDoc(ref, { trainingPoints: 9999 }))
  })
  it('a member can still update their name/photo/preferences', async () => {
    await assertSucceeds(updateDoc(doc(as('m1'), 'communities', C, 'members', 'm1'),
      { displayName: 'Nou', photoUrl: 'x', emailNotifications: false }))
  })
  it('staff can award points but only the Fondator can change roles', async () => {
    await assertSucceeds(updateDoc(doc(as('vol'), 'communities', C, 'members', 'm1'), { trainingPoints: 10 }))
    await assertFails(updateDoc(doc(as('vol'), 'communities', C, 'members', 'vol'), { role: 'ADMIN' }))
    await assertFails(updateDoc(doc(as('coach'), 'communities', C, 'members', 'm1'), { role: 'TRAINER' }))
    await assertSucceeds(updateDoc(doc(as('founder'), 'communities', C, 'members', 'm1'), { role: 'TRAINER' }))
  })
  it('joining as ADMIN is only allowed for the creator', async () => {
    const join = (uid: string, role: string) => setDoc(doc(as(uid), 'communities', C, 'members', uid),
      { userId: uid, role, level: 1, points: 0, joinedAt: serverTimestamp() })
    await assertFails(join('newbie', 'ADMIN'))
    await assertSucceeds(join('newbie2', 'MEMBER'))
  })
  it('the creator of a new community joins it as ADMIN (create flow still works)', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'communities', 'comm2'), { name: 'X', creatorId: 'boss' }))
    await assertSucceeds(setDoc(doc(as('boss'), 'communities', 'comm2', 'members', 'boss'),
      { userId: 'boss', role: 'ADMIN', level: 1, points: 0, joinedAt: serverTimestamp() }))
  })
  it('cannot join with pre-seeded points', async () => {
    await assertFails(setDoc(doc(as('newbie'), 'communities', C, 'members', 'newbie'),
      { userId: 'newbie', role: 'MEMBER', points: 0, trainingPoints: 500, joinedAt: serverTimestamp() }))
  })
})

describe('trainings RSVP/attendance + points config', () => {
  it('validates configurable points', async () => {
    const ref = doc(as('coach'), 'communities', C, 'config', 'plan')
    await assertSucceeds(setDoc(ref, { points: { attendance: 15, goalAchieved: 30 } }))
    await assertFails(setDoc(ref, { points: { attendance: 5000 } }))
    await assertFails(setDoc(ref, { points: { attendance: 10, hack: 1 } }))
  })

  it('RSVP to a capped session must go through the API; uncapped stays direct', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'communities', C, 'trainings', 'capped'), { name: 'x', capacity: 2, rsvps: {} })
      await setDoc(doc(db, 'communities', C, 'trainings', 'open'), { name: 'y', rsvps: {} })
    })
    await assertFails(updateDoc(doc(as('m1'), 'communities', C, 'trainings', 'capped'), { 'rsvps.m1': 'GOING' }))
    await assertSucceeds(updateDoc(doc(as('m1'), 'communities', C, 'trainings', 'open'), { 'rsvps.m1': 'GOING' }))
  })

  it('members cannot forge attendance awards on create', async () => {
    await assertFails(setDoc(doc(as('m1'), 'communities', C, 'trainings', 'forged'), {
      name: 'x', description: '', createdAt: serverTimestamp(), attendanceAwards: { m2: -500 },
    }))
    await assertSucceeds(setDoc(doc(as('m1'), 'communities', C, 'trainings', 'legit'), {
      name: 'x', description: '', createdAt: serverTimestamp(),
    }))
  })
})

describe('member plans (goals, exercises, tips, journal, tests)', () => {
  const goal = { skill: 'Muscle-up', currentLevel: '', target: '1 rep', deadline: null, status: 'IN_PROGRESS' }

  it('a member manages their own goals but cannot self-award', async () => {
    const ref = doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'goals', 'g1')
    await assertSucceeds(setDoc(ref, { ...goal, createdAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { status: 'ACHIEVED' }))
    await assertFails(updateDoc(ref, { rewarded: true }))
    await assertSucceeds(updateDoc(ref, { currentLevel: 'negativ 5 sec' }))
    await assertFails(setDoc(doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'goals', 'g2'),
      { ...goal, status: 'ACHIEVED', createdAt: serverTimestamp() }))
  })

  it("nobody else writes a member's goals; coach can read, volunteer and members cannot", async () => {
    await assertFails(setDoc(doc(as('m2'), 'communities', C, 'memberPlans', 'm1', 'goals', 'x'), { ...goal, createdAt: serverTimestamp() }))
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'communities', C, 'memberPlans', 'm1', 'goals', 'g9'), goal))
    await assertSucceeds(getDoc(doc(as('coach'), 'communities', C, 'memberPlans', 'm1', 'goals', 'g9')))
    await assertSucceeds(getDoc(doc(as('founder'), 'communities', C, 'memberPlans', 'm1', 'goals', 'g9')))
    await assertFails(getDoc(doc(as('vol'), 'communities', C, 'memberPlans', 'm1', 'goals', 'g9')))
    await assertFails(getDoc(doc(as('m2'), 'communities', C, 'memberPlans', 'm1', 'goals', 'g9')))
  })

  const ex = { name: 'Scapula pull-ups', sets: 3, amount: 10, unit: 'reps', perWeek: 3, deficiency: '', notes: '', active: true, checks: {} }

  it('only Fondator/Antrenor assign extra exercises (not Voluntar)', async () => {
    await assertSucceeds(setDoc(doc(as('coach'), 'communities', C, 'memberPlans', 'm1', 'extraExercises', 'e1'), ex))
    await assertFails(setDoc(doc(as('vol'), 'communities', C, 'memberPlans', 'm1', 'extraExercises', 'e2'), ex))
    await assertFails(setDoc(doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'extraExercises', 'e3'), ex))
  })

  it('the member can only tick checks on their exercises', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'communities', C, 'memberPlans', 'm1', 'extraExercises', 'e1'), ex))
    const ref = doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'extraExercises', 'e1')
    await assertSucceeds(updateDoc(ref, { 'checks.2026-11-16': 2 }))
    await assertFails(updateDoc(ref, { perWeek: 1 }))
    await assertFails(updateDoc(doc(as('m2'), 'communities', C, 'memberPlans', 'm1', 'extraExercises', 'e1'), { 'checks.2026-11-16': 3 }))
  })

  it('journal and tests: owner writes valid docs, coach reads', async () => {
    const j = doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'journal', '2026-11-16')
    await assertSucceeds(setDoc(j, { trainings: 3, worked: 'pull', progress: '', notes: '', updatedAt: serverTimestamp() }))
    await assertFails(setDoc(j, { trainings: 99, worked: '', progress: '', notes: '', updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'journal', 'bad-id'),
      { trainings: 1, worked: '', progress: '', notes: '', updatedAt: serverTimestamp() }))
    await assertSucceeds(getDoc(doc(as('coach'), 'communities', C, 'memberPlans', 'm1', 'journal', '2026-11-16')))
    const t = doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'tests', '2026-11-20')
    await assertSucceeds(setDoc(t, { values: { pullups: 12 }, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(as('coach'), 'communities', C, 'memberPlans', 'm1', 'tests', '2026-11-21'), { values: {}, updatedAt: serverTimestamp() }))
  })

  it('tips: only the API creates them; the member marks seen; coach reads and deletes', async () => {
    const tip = { text: 'Încălzește încheieturile', category: 'warmup', authorUid: 'coach', authorName: 'C', seen: false }
    await assertFails(setDoc(doc(as('coach'), 'communities', C, 'memberPlans', 'm1', 'tips', 'x'), tip))
    await assertFails(setDoc(doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'tips', 'y'), tip))
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'communities', C, 'memberPlans', 'm1', 'tips', 't1'), tip))
    const mine = doc(as('m1'), 'communities', C, 'memberPlans', 'm1', 'tips', 't1')
    await assertSucceeds(getDoc(mine))
    await assertFails(updateDoc(mine, { text: 'hacked' }))
    await assertSucceeds(updateDoc(mine, { seen: true }))
    await assertFails(getDoc(doc(as('m2'), 'communities', C, 'memberPlans', 'm1', 'tips', 't1')))
    await assertFails(getDoc(doc(as('vol'), 'communities', C, 'memberPlans', 'm1', 'tips', 't1')))
    await assertSucceeds(getDoc(doc(as('coach'), 'communities', C, 'memberPlans', 'm1', 'tips', 't1')))
    await assertFails(deleteDoc(mine))
    await assertSucceeds(deleteDoc(doc(as('coach'), 'communities', C, 'memberPlans', 'm1', 'tips', 't1')))
  })
})
