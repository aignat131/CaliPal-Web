import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { app } from './config'

if (!app) throw new Error('Firebase failed to initialize. Check NEXT_PUBLIC_FIREBASE_* env vars.')
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
