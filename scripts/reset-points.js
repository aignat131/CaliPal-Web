/**
 * Reset all user coins to 0 and all community member points/streak fields to 0.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/reset-points.js
 *
 * Dry-run (no writes, just counts):
 *   DRY_RUN=1 GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/reset-points.js
 *
 * Prerequisites:
 *   npm install firebase-admin
 */

const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')

const DRY = process.env.DRY_RUN === '1'

const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? admin.credential.applicationDefault()
  : admin.credential.cert(require('../serviceAccountKey.json'))

if (!admin.apps.length) {
  admin.initializeApp({ credential })
}

const db = admin.firestore()

async function batchWrite(writes) {
  // Firestore batch limit is 500 operations
  for (let i = 0; i < writes.length; i += 500) {
    const batch = db.batch()
    writes.slice(i, i + 500).forEach(({ ref, data }) => batch.update(ref, data))
    if (!DRY) await batch.commit()
  }
}

async function resetUserCoins() {
  console.log('\n── Resetting user coins ──')
  const snap = await db.collection('users').get()
  console.log(`  Found ${snap.size} users`)
  const writes = snap.docs.map(d => ({ ref: d.ref, data: { coins: 0 } }))
  await batchWrite(writes)
  console.log(`  ${DRY ? '[DRY RUN] Would reset' : 'Reset'} ${writes.length} user coin fields`)
}

async function resetCommunityMemberPoints() {
  console.log('\n── Resetting community member points ──')
  const commSnap = await db.collection('communities').get()
  console.log(`  Found ${commSnap.size} communities`)

  let totalMembers = 0
  const writes = []

  for (const commDoc of commSnap.docs) {
    const membersSnap = await commDoc.ref.collection('members').get()
    for (const memberDoc of membersSnap.docs) {
      writes.push({
        ref: memberDoc.ref,
        data: {
          trainingPoints: 0,
          totalTrainingsAttended: 0,
          lastTrainingPointDate: FieldValue.delete(),
          trainingAttendanceStreak: FieldValue.delete(),
          lastAttendanceDate: FieldValue.delete(),
        },
      })
      totalMembers++
    }
  }

  await batchWrite(writes)
  console.log(`  ${DRY ? '[DRY RUN] Would reset' : 'Reset'} ${totalMembers} community member docs`)
}

async function main() {
  if (DRY) console.log('\n🔍 DRY RUN — no writes will be performed\n')
  else console.log('\n⚠️  LIVE RUN — writing to Firestore\n')

  await resetUserCoins()
  await resetCommunityMemberPoints()

  console.log('\n✓ Done')
  process.exit(0)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
