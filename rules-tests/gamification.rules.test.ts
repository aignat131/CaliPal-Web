/**
 * Firestore rules tests for badges + the personal-record leaderboard.
 * Run with:  npm run test:rules   (starts the Firestore emulator)
 */
import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-calipal-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => { await env?.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

const as = (uid: string) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

const records = (over: Record<string, unknown> = {}) => ({
  uid: 'u1', displayName: 'Ana', photoUrl: '',
  pullup: 12, pullup_v: true, pushup: 40, pushup_v: false, dips: 0, dips_v: false,
  squat: 0, squat_v: false, muscleup: 0, muscleup_v: false,
  handstand: 20, handstand_v: false, lsit: 0, lsit_v: false, plank: 0, plank_v: false,
  front_lever: 0, front_lever_v: false, dead_hang: 0, dead_hang_v: false,
  updatedAt: serverTimestamp(), ...over,
})

describe('users/{uid}/badges', () => {
  it('owner creates a badge level and can raise it', async () => {
    const ref = doc(as('u1'), 'users', 'u1', 'badges', 'pullup_power')
    await assertSucceeds(setDoc(ref, { badgeId: 'pullup_power', level: 1, updatedAt: serverTimestamp() }))
    await assertSucceeds(setDoc(ref, { level: 2, updatedAt: serverTimestamp() }, { merge: true }))
  })

  it('levels cannot go down, past 3, or be deleted', async () => {
    const ref = doc(as('u1'), 'users', 'u1', 'badges', 'streak')
    await assertSucceeds(setDoc(ref, { badgeId: 'streak', level: 2 }))
    await assertFails(setDoc(ref, { level: 1 }, { merge: true }))
    await assertFails(setDoc(ref, { level: 2 }, { merge: true }))
    await assertFails(setDoc(ref, { level: 4 }, { merge: true }))
    await assertFails(deleteDoc(ref))
    await assertFails(setDoc(doc(as('u1'), 'users', 'u1', 'badges', 'x'), { level: 0 }))
  })

  it("nobody writes someone else's badges; signed-in users can read them", async () => {
    await assertFails(setDoc(doc(as('u2'), 'users', 'u1', 'badges', 'streak'), { level: 1 }))
    await assertSucceeds(getDoc(doc(as('u2'), 'users', 'u1', 'badges', 'streak')))
    await assertFails(getDoc(doc(anon(), 'users', 'u1', 'badges', 'streak')))
  })
})

describe('user_records/{uid}', () => {
  it('owner publishes and updates their records', async () => {
    const ref = doc(as('u1'), 'user_records', 'u1')
    await assertSucceeds(setDoc(ref, records()))
    await assertSucceeds(setDoc(ref, records({ pullup: 15 })))
  })

  it("cannot write another user's records or spoof uid", async () => {
    await assertFails(setDoc(doc(as('u2'), 'user_records', 'u1'), records()))
    await assertFails(setDoc(doc(as('u2'), 'user_records', 'u2'), records()))
  })

  it('rejects out-of-range, fractional or missing values', async () => {
    const ref = doc(as('u1'), 'user_records', 'u1')
    await assertFails(setDoc(ref, records({ pullup: 501 })))
    await assertFails(setDoc(ref, records({ plank: 3601 })))
    await assertFails(setDoc(ref, records({ pushup: -1 })))
    await assertFails(setDoc(ref, records({ dips: 2.5 })))
    const { squat: _squat, ...missing } = records()
    await assertFails(setDoc(ref, missing))
  })

  it('signed-in users read the leaderboard; anonymous users cannot', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'user_records', 'u1'), records()))
    await assertSucceeds(getDoc(doc(as('u2'), 'user_records', 'u1')))
    await assertFails(getDoc(doc(anon(), 'user_records', 'u1')))
  })
})
