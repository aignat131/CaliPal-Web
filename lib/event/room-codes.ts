import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { generateRoomCode } from '@/lib/shared/room-codes'

/**
 * Generate a unique event room code, checking against active events.
 * Retries up to 3 times if a collision is found.
 */
export async function generateUniqueEventCode(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode()
    const q = query(
      collection(db, 'events'),
      where('code', '==', code),
      where('status', 'in', ['LOBBY', 'ACTIVE']),
      limit(1),
    )
    const snap = await getDocs(q)
    if (snap.empty) return code
  }
  return generateRoomCode()
}

/**
 * Look up an event by room code. Finds events in LOBBY or ACTIVE status.
 * Returns the event document ID or null if not found.
 */
export async function lookupEventByCode(code: string): Promise<string | null> {
  const normalized = code.toUpperCase().trim()
  if (normalized.length !== 6) return null

  const q = query(
    collection(db, 'events'),
    where('code', '==', normalized),
    where('status', 'in', ['LOBBY', 'ACTIVE']),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return snap.docs[0].id
}
