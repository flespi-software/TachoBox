export const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
export const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
export const TILE_ATTRIBUTION = '&copy; OSM &copy; CARTO'

export function getTileUrl(isDark) {
  return isDark ? TILE_DARK : TILE_LIGHT
}

export function isValidGeo(geo) {
  if (!geo) return false
  const { latitude: lat, longitude: lon } = geo
  if (lat == null || lon == null) return false
  if (lat === 0 && lon === 0) return false
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false
  return true
}
