'use client'

import dynamic from 'next/dynamic'

const MapClient = dynamic(() => import('@/components/map/MapClient'), { ssr: false })

export default function MapPage() {
  return (
    <>
      <h1 className="sr-only">Map</h1>
      <MapClient />
    </>
  )
}
