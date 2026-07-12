/**
 * One-time script to set the `superAdmin` custom claim on the admin user.
 *
 * Usage:
 *   npx tsx scripts/set-superadmin-claim.ts
 *
 * After running, the admin user must sign out and sign back in
 * for the new claim to take effect in their ID token.
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
})

const email = process.env.SUPERADMIN_EMAIL
if (!email) {
  console.error('SUPERADMIN_EMAIL not set in .env.local')
  process.exit(1)
}

async function main() {
  const auth = getAuth(app)
  const user = await auth.getUserByEmail(email!)
  await auth.setCustomUserClaims(user.uid, { superAdmin: true })
  console.log(`Set superAdmin claim on ${user.email} (uid: ${user.uid})`)
  console.log('The user must sign out and sign back in for the claim to take effect.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
