import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'

function getAdminApp() {
  return (
    getApps().find(a => a.name === 'admin') ??
    initializeApp(
      {
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      },
      'admin',
    )
  )
}

export const adminMessaging = () => getMessaging(getAdminApp())
export const adminDb = () => getFirestore(getAdminApp())
export const adminAuth = () => getAuth(getAdminApp())
export const adminStorage = () => getStorage(getAdminApp())
