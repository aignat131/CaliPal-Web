import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { app } from './config'

// app is null during SSR/build when env vars are absent — skip init, runtime always has them
export const auth = app ? getAuth(app) : null!
export const googleProvider = app ? new GoogleAuthProvider() : null!
