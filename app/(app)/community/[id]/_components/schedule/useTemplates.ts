'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { SessionTemplate } from '@/lib/schedule/sessions'
import { sanitizeExercises } from '@/lib/schedule/sessions'

export function useSessionTemplates(communityId: string) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([])
  useEffect(() => {
    return onSnapshot(collection(db, 'communities', communityId, 'sessionTemplates'), snap => {
      setTemplates(snap.docs.map(d => {
        const x = d.data()
        return {
          id: d.id,
          name: (x.name as string) ?? '',
          focus: (x.focus as string) ?? '',
          durationMinutes: Number.isInteger(x.durationMinutes) ? x.durationMinutes : 90,
          exercises: sanitizeExercises(x.exercises),
          notes: (x.notes as string) ?? '',
        }
      }).sort((a, b) => a.name.localeCompare(b.name, 'ro')))
    }, () => setTemplates([]))
  }, [communityId])
  return templates
}

export interface CommunityPark { id: string; name: string }

/** Parks linked to this community (for the session location picker). */
export function useCommunityParks(communityId: string) {
  const [parks, setParks] = useState<CommunityPark[]>([])
  useEffect(() => {
    return onSnapshot(query(collection(db, 'parks'), where('communityId', '==', communityId)), snap => {
      setParks(snap.docs.map(d => ({ id: d.id, name: (d.data().name as string) || 'Parc' })))
    }, () => setParks([]))
  }, [communityId])
  return parks
}
