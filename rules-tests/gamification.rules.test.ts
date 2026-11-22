/**
 * Firestore rules tests for milestones, friend challenges and the friends activity feed.
 * Run with:  npm run test:rules   (starts the Firestore emulator)
 */
import { readFileSync } from 'node:fs'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore'

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

describe('users/{uid}.milestones', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users', 'u1'), { displayName: 'Ana', totalWorkouts: 3 }))
  })

  it('owner ticks and unticks milestones', async () => {
    const ref = doc(as('u1'), 'users', 'u1')
    await assertSucceeds(updateDoc(ref, { 'milestones.pull_1': Date.now() }))
    await assertSucceeds(updateDoc(ref, { milestones: {} }))
  })

  it("nobody ticks someone else's milestones; the field must be a map", async () => {
    await assertFails(updateDoc(doc(as('u2'), 'users', 'u1'), { 'milestones.pull_1': Date.now() }))
    await assertFails(updateDoc(doc(as('u1'), 'users', 'u1'), { milestones: 'all' }))
  })

  it('coins can no longer be written by the owner', async () => {
    await assertFails(updateDoc(doc(as('u1'), 'users', 'u1'), { coins: 9999 }))
  })
})

const inDays = (d: number) => Timestamp.fromDate(new Date(Date.now() + d * 86400000))
const challenge = (over: Record<string, unknown> = {}) => ({
  fromUid: 'a', fromName: 'A', fromPhoto: '', toUid: 'b', toName: 'B', toPhoto: '',
  lift: 'pullup', target: 12, deadline: inDays(7), status: 'PENDING', message: '',
  createdAt: serverTimestamp(), ...over,
})
async function seed(id: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'challenges', id), data))
}

describe('challenges', () => {
  it('a user creates a valid challenge for someone else', async () => {
    await assertSucceeds(addDoc(collection(as('a'), 'challenges'), challenge()))
  })

  it('rejects self-challenges, spoofed sender, bad lift/target/deadline/status', async () => {
    const c = collection(as('a'), 'challenges')
    await assertFails(addDoc(c, challenge({ toUid: 'a' })))
    await assertFails(addDoc(c, challenge({ fromUid: 'x' })))
    await assertFails(addDoc(c, challenge({ lift: 'bench_press' })))
    await assertFails(addDoc(c, challenge({ target: 0 })))
    await assertFails(addDoc(c, challenge({ target: 4.5 })))
    await assertFails(addDoc(c, challenge({ deadline: inDays(30) })))
    await assertFails(addDoc(c, challenge({ deadline: inDays(-1) })))
    await assertFails(addDoc(c, challenge({ status: 'COMPLETED' })))
  })

  it('only participants can read; queries by toUid/fromUid work', async () => {
    await seed('c1', challenge())
    await assertSucceeds(getDoc(doc(as('a'), 'challenges', 'c1')))
    await assertSucceeds(getDoc(doc(as('b'), 'challenges', 'c1')))
    await assertFails(getDoc(doc(as('z'), 'challenges', 'c1')))
    await assertSucceeds(getDocs(query(collection(as('b'), 'challenges'), where('toUid', '==', 'b'))))
    await assertSucceeds(getDocs(query(collection(as('b'), 'challenges'),
      where('toUid', '==', 'b'), where('status', '==', 'ACCEPTED'))))
    await assertFails(getDocs(query(collection(as('z'), 'challenges'), where('toUid', '==', 'b'))))
  })

  it('recipient accepts/declines; sender cannot accept for them', async () => {
    await seed('c1', challenge())
    await assertFails(updateDoc(doc(as('a'), 'challenges', 'c1'), { status: 'ACCEPTED' }))
    await assertFails(updateDoc(doc(as('b'), 'challenges', 'c1'), { status: 'ACCEPTED', target: 1 }))
    await assertSucceeds(updateDoc(doc(as('b'), 'challenges', 'c1'), { status: 'ACCEPTED' }))
  })

  it('recipient completes only with result >= target and before the deadline', async () => {
    await seed('c1', challenge({ status: 'ACCEPTED' }))
    const ref = doc(as('b'), 'challenges', 'c1')
    await assertFails(updateDoc(ref, { status: 'COMPLETED', result: 11, verified: false, completedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(ref, { status: 'COMPLETED', result: 12, verified: true, completedAt: serverTimestamp() }))
    await seed('c2', challenge({ status: 'ACCEPTED', deadline: Timestamp.fromDate(new Date(Date.now() - 1000)) }))
    await assertFails(updateDoc(doc(as('b'), 'challenges', 'c2'),
      { status: 'COMPLETED', result: 20, verified: false, completedAt: serverTimestamp() }))
  })

  it('sender can cancel open challenges, not completed ones; nobody deletes', async () => {
    await seed('c1', challenge())
    await assertSucceeds(updateDoc(doc(as('a'), 'challenges', 'c1'), { status: 'CANCELLED' }))
    await seed('c2', challenge({ status: 'COMPLETED', result: 12 }))
    await assertFails(updateDoc(doc(as('a'), 'challenges', 'c2'), { status: 'CANCELLED' }))
    await assertFails(deleteDoc(doc(as('a'), 'challenges', 'c2')))
  })
})

describe('activity', () => {
  const act = (over: Record<string, unknown> = {}) => ({
    uid: 'a', name: 'A', photo: '', kind: 'milestone', milestoneId: 'pull_1',
    cheers: {}, createdAt: serverTimestamp(), ...over,
  })

  it('users post their own activity only, with a known kind and no pre-filled cheers', async () => {
    const c = collection(as('a'), 'activity')
    await assertSucceeds(addDoc(c, act()))
    await assertFails(addDoc(c, act({ uid: 'b' })))
    await assertFails(addDoc(c, act({ kind: 'spam' })))
    await assertFails(addDoc(c, act({ kind: 'badge' })))
    await assertFails(addDoc(c, act({ milestoneId: 42 })))
    await assertFails(addDoc(c, act({ cheers: { a: true } })))
  })

  it('anyone signed in toggles only their own cheer', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'activity', 'x'), act({ cheers: {} })))
    await assertSucceeds(updateDoc(doc(as('b'), 'activity', 'x'), { 'cheers.b': true }))
    await assertFails(updateDoc(doc(as('b'), 'activity', 'x'), { 'cheers.c': true }))
    await assertFails(updateDoc(doc(as('b'), 'activity', 'x'), { milestoneId: 'pull_15' }))
    await assertFails(deleteDoc(doc(as('b'), 'activity', 'x')))
    await assertSucceeds(deleteDoc(doc(as('a'), 'activity', 'x')))
  })
})
