import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'

/**
 * Characters for room codes — no ambiguous chars (I/O/0/1 excluded).
 * 30^6 ≈ 729M possible codes.
 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Generate a 6-character alphanumeric room code. */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

/**
 * Generate a unique room code, checking against active lobbies.
 * Retries up to 3 times if a collision is found.
 */
export async function generateUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode()
    const q = query(
      collection(db, 'battles'),
      where('code', '==', code),
      where('status', '==', 'LOBBY'),
      limit(1),
    )
    const snap = await getDocs(q)
    if (snap.empty) return code
  }
  // Fallback — collision probability is negligible, just return a new code
  return generateRoomCode()
}

/**
 * Look up a battle by room code. Only finds battles in LOBBY status.
 * Returns the battle document ID or null if not found.
 */
export async function lookupByCode(code: string): Promise<string | null> {
  const normalized = code.toUpperCase().trim()
  if (normalized.length !== 6) return null

  const q = query(
    collection(db, 'battles'),
    where('code', '==', normalized),
    where('status', '==', 'LOBBY'),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return snap.docs[0].id
}
