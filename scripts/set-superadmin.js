/**
 * Set the superAdmin custom claim on a Firebase user.
 *
 * Usage:
 *   node scripts/set-superadmin.js <uid>
 *
 * Prerequisites:
 *   npm install firebase-admin
 *   Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path, or
 *   place serviceAccountKey.json in the project root.
 *
 * Example:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/set-superadmin.js abc123uid
 */

const admin = require('firebase-admin')

const uid = process.argv[2]
if (!uid) {
  console.error('Usage: node scripts/set-superadmin.js <uid>')
  process.exit(1)
}

const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? admin.credential.applicationDefault()
  : admin.credential.cert(require('../serviceAccountKey.json'))

if (!admin.apps.length) {
  admin.initializeApp({ credential })
}

admin.auth().setCustomUserClaims(uid, { superAdmin: true })
  .then(() => {
    console.log(`✓ superAdmin claim set for uid: ${uid}`)
    console.log('The user must sign out and sign back in for the claim to take effect.')
    process.exit(0)
  })
  .catch(err => {
    console.error('Failed to set claim:', err.message)
    process.exit(1)
  })
