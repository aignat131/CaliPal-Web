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
