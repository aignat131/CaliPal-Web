'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AvailabilityOverviewResponse } from '@/lib/schedule/api-types'
import { callApi } from '@/lib/schedule/client'

/** Loads /api/community/{id}/availability for a week (names only for staff). */
export function useAvailabilityOverview(communityId: string, weekKey: string) {
  const [data, setData] = useState<AvailabilityOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const res = await callApi<AvailabilityOverviewResponse>(`/api/community/${communityId}/availability?week=${weekKey}`)
    if (res.ok) setData(res.data)
    else setError(true)
    setLoading(false)
  }, [communityId, weekKey])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, reload: load }
}
