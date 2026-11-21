'use client'

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM, DARK_TILES_CLASS } from './tiles'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function MapPickerInner({
  lat, lng, onPick,
}: {
  lat: number | null
  lng: number | null
  onPick: (lat: number, lng: number) => void
}) {
  const center: [number, number] = lat && lng ? [lat, lng] : [45.9432, 24.9668] // Romania center

  return (
    <MapContainer
      center={center}
      zoom={lat && lng ? 14 : 6}
      style={{ width: '100%', height: '100%', borderRadius: '12px' }}
      zoomControl={false}
    >
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
        maxZoom={TILE_MAX_ZOOM}
        className={DARK_TILES_CLASS}
      />
      <ClickHandler onPick={onPick} />
      {lat && lng && <Marker position={[lat, lng]} icon={icon} />}
    </MapContainer>
  )
}
