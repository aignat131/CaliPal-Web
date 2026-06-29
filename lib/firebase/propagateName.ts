import {
  collection, query, where, getDocs, writeBatch,
} from 'firebase/firestore'
import { db } from './firestore'

const BATCH_LIMIT = 500

/**
 * Propagate a user's updated displayName (and photo) to all denormalized copies
 * across their communities. Designed to be called fire-and-forget after profile save.
 */
export async function propagateDisplayName(
  uid: string,
  newName: string,
  newPhotoUrl: string,
  communityIds: string[],
): Promise<void> {
  for (const cid of communityIds) {
    try {
      let batch = writeBatch(db)
      let ops = 0

      async function flushIfNeeded() {
        if (ops >= BATCH_LIMIT) {
          await batch.commit()
          batch = writeBatch(db)
          ops = 0
        }
      }

      // 1. Trainings authored by this user → update authorName
      const trainingsRef = collection(db, 'communities', cid, 'trainings')
      const authoredTrainings = await getDocs(query(trainingsRef, where('authorId', '==', uid)))
      for (const t of authoredTrainings.docs) {
        batch.update(t.ref, { authorName: newName })
        ops++
        await flushIfNeeded()

        // 1b. Training photos by this user in their authored trainings
        const photosRef = collection(db, 'communities', cid, 'trainings', t.id, 'photos')
        const authoredPhotos = await getDocs(query(photosRef, where('authorId', '==', uid)))
        for (const p of authoredPhotos.docs) {
          batch.update(p.ref, { authorName: newName, authorPhotoUrl: newPhotoUrl || null })
          ops++
          await flushIfNeeded()
        }
      }

      // 2. Update rsvpNames/rsvpPhotos on trainings where user RSVP'd GOING
      //    (Check all non-deleted trainings — rsvps is a map field, can't query by map key,
      //     so we fetch all and filter client-side. Limit to recent to avoid huge reads.)
      const allTrainings = await getDocs(trainingsRef)
      for (const t of allTrainings.docs) {
        const data = t.data()
        if (data.deletedAt) continue
        const rsvps = data.rsvps as Record<string, string> | undefined
        if (rsvps?.[uid] === 'GOING') {
          const patch: Record<string, unknown> = {}
          if (newName) patch[`rsvpNames.${uid}`] = newName
          if (newPhotoUrl) patch[`rsvpPhotos.${uid}`] = newPhotoUrl
          if (Object.keys(patch).length) {
            batch.update(t.ref, patch)
            ops++
            await flushIfNeeded()
          }
        }

        // 2b. Training photos by this user in OTHER users' trainings
        if (data.authorId !== uid) {
          const photosRef = collection(db, 'communities', cid, 'trainings', t.id, 'photos')
          const myPhotos = await getDocs(query(photosRef, where('authorId', '==', uid)))
          for (const p of myPhotos.docs) {
            batch.update(p.ref, { authorName: newName, authorPhotoUrl: newPhotoUrl || null })
            ops++
            await flushIfNeeded()
          }
        }
      }

      // 3. Posts authored by this user → update authorName + authorPhotoUrl
      const postsRef = collection(db, 'communities', cid, 'posts')
      const authoredPosts = await getDocs(query(postsRef, where('authorId', '==', uid)))
      for (const p of authoredPosts.docs) {
        batch.update(p.ref, { authorName: newName, authorPhotoUrl: newPhotoUrl || null })
        ops++
        await flushIfNeeded()
      }

      // Commit remaining operations
      if (ops > 0) await batch.commit()
    } catch (err) {
      console.error(`[propagateName] Failed for community ${cid}:`, err)
    }
  }
}
