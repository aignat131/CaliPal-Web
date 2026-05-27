import type { User } from 'firebase/auth'
import type { UserDoc } from '@/types'

export const DEFAULT_DISPLAY_NAME = 'Utilizator'

/**
 * Resolve the best display name for the current user.
 * Priority: Firestore stored name → Firebase Auth display name → default.
 * Never returns an empty string.
 */
export function getDisplayName(
  profile: UserDoc | null | undefined,
  user: User | null | undefined,
): string {
  const storedName = profile?.displayName
  const authName   = user?.displayName ?? ''
  if (storedName && storedName !== DEFAULT_DISPLAY_NAME) return storedName
  return authName || DEFAULT_DISPLAY_NAME
}
