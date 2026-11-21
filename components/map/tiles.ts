// Basemap tiles. CARTO's basemaps now require an API key, so we use the standard
// OpenStreetMap tiles (free, keyless — see operations.osmfoundation.org/policies/tiles)
// and darken them with a CSS filter (`.map-tiles-dark` in globals.css) for the dark theme.

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Max zoom served by tile.openstreetmap.org. */
export const TILE_MAX_ZOOM = 19

export const DARK_TILES_CLASS = 'map-tiles-dark'
