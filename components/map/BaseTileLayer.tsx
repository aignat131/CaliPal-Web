'use client'

import { TileLayer } from 'react-leaflet'

// OpenStreetMap tiles: free, no API key. (CARTO basemaps now require a key and
// render "API KEY REQUIRED" on every tile.) Dark mode is done with a CSS filter
// on the tile images via the `calipal-dark-tiles` class (see globals.css).
export default function BaseTileLayer({ dark }: { dark: boolean }) {
  return (
    <TileLayer
      key={dark ? 'dark' : 'light'}
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={19}
      className={dark ? 'calipal-dark-tiles' : undefined}
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    />
  )
}
