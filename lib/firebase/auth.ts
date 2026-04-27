import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { app } from './config'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const auth = app ? getAuth(app) : null as unknown as ReturnType<typeof getAuth>
export const googleProvider = new GoogleAuthProvider()
