import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')

  if (!lat || !lon) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
  }

  try {
    const queries = [
      'calisthenics park',
      'street workout park',
      'outdoor fitness park',
      'parc calisthenics',
      'street workout',
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allResults: any[] = []
    const seenIds = new Set<string>()

    // Words that indicate an indoor gym (not an outdoor park)
    const gymKeywords = ['gym', 'fitness', 'sala', 'crossfit', 'bodybuilding', 'world class', 'smartfit', 'igym']

    for (const q of queries) {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&location=${lat},${lon}&radius=30000&key=${key}`
      const res = await fetch(url)
      const data = await res.json()

      if (data.results) {
        for (const place of data.results) {
          if (seenIds.has(place.place_id)) continue
          seenIds.add(place.place_id)

          const nameLower = (place.name || '').toLowerCase()

          // Skip places that are clearly indoor gyms by name
          const hasGymName = gymKeywords.some(kw => nameLower.includes(kw))
          // Keep if name mentions calisthenics/street workout/outdoor/parc
          const isOutdoor = nameLower.includes('calisthenics') || nameLower.includes('calistenice') || nameLower.includes('street workout') || nameLower.includes('outdoor') || nameLower.includes('parc') || nameLower.includes('workout')

          if (hasGymName && !isOutdoor) continue

          allResults.push({
            id: place.place_id,
            name: place.name,
            address: place.formatted_address || '',
            lat: place.geometry.location.lat,
            lon: place.geometry.location.lng,
            rating: place.rating || null,
            totalRatings: place.user_ratings_total || 0,
          })
        }
      }
    }

    return NextResponse.json({ parks: allResults })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch parks' }, { status: 500 })
  }
}
