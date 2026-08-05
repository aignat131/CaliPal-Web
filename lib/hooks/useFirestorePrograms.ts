'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { FirestoreTrainingProgram } from '@/types'

export function useFirestorePrograms(includeUnpublished = false) {
  const [programs, setPrograms] = useState<FirestoreTrainingProgram[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const constraints = includeUnpublished
      ? [orderBy('order', 'asc')]
      : [where('published', '==', true), orderBy('order', 'asc')]

    const q = query(collection(db, 'training_programs'), ...constraints)
    const unsub = onSnapshot(q, snap => {
      setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() }) as FirestoreTrainingProgram))
      setLoading(false)
    }, () => {
      setLoading(false)
    })
    return unsub
  }, [includeUnpublished])

  return { programs, loading }
}

/** Fetch programs created by a specific user (private programs). */
export function useMyPrograms(uid: string | undefined) {
  const [programs, setPrograms] = useState<FirestoreTrainingProgram[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) { setLoading(false); return }

    const q = query(
      collection(db, 'training_programs'),
      where('creatorUid', '==', uid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(q, snap => {
      setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() }) as FirestoreTrainingProgram))
      setLoading(false)
    }, () => {
      setLoading(false)
    })
    return unsub
  }, [uid])

  return { programs, loading }
}
