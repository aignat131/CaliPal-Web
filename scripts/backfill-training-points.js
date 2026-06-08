/**
 * Backfill trainingPoints for all community members based on their totalWorkouts.
 * Sets trainingPoints = totalWorkouts * 10 for each member doc.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/backfill-training-points.js
 *
 * Dry-run (no writes, just shows what would change):
 *   DRY_RUN=1 GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/backfill-training-points.js
 *
 * Prerequisites:
 *   npm install firebase-admin
 */

const admin = require('firebase-admin')

const DRY = process.env.DRY_RUN === '1'

const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? admin.credential.applicationDefault()
  : (() => { throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS') })()

admin.initializeApp({ credential })
const db = admin.firestore()

async function run() {
  console.log(DRY ? '[DRY RUN] No writes will be made.\n' : '[LIVE] Writing to Firestore.\n')

  // 1. Load all users to get totalWorkouts
  const usersSnap = await db.collection('users').get()
  const userWorkouts = {}
  for (const d of usersSnap.docs) {
    const data = d.data()
    userWorkouts[d.id] = data.totalWorkouts ?? 0
  }
  console.log(`Loaded ${usersSnap.size} users.`)

  // 2. Walk every community and update each member's trainingPoints
  const commSnap = await db.collection('communities').get()
  console.log(`Found ${commSnap.size} communities.\n`)

  let updated = 0
  let skipped = 0

  for (const commDoc of commSnap.docs) {
    const membersSnap = await db.collection('communities').doc(commDoc.id).collection('members').get()
    for (const memberDoc of membersSnap.docs) {
      const uid = memberDoc.id
      const totalWorkouts = userWorkouts[uid] ?? 0
      const newPoints = totalWorkouts * 10
      const currentPoints = memberDoc.data().trainingPoints ?? 0

      if (currentPoints === newPoints) {
        skipped++
        continue
      }

      console.log(`  community=${commDoc.id} uid=${uid}: ${currentPoints} → ${newPoints} pts (${totalWorkouts} workouts)`)
      if (!DRY) {
        await db.collection('communities').doc(commDoc.id).collection('members').doc(uid).update({
          trainingPoints: newPoints,
        })
      }
      updated++
    }
  }

  console.log(`\nDone. Updated: ${updated}, Already correct: ${skipped}`)
}

run().catch(e => { console.error(e); process.exit(1) })
