/**
 * Static configuration for the XR companion: focus cities, the two viewing
 * modes and where provider keys come from. Nothing here touches three.js.
 */

/** Focus points, in degrees. The first entry is the startup city. */
export const CITIES = [
  { id: 'taipei', label: 'Taipei', lat: 25.0339, lon: 121.5645 },
  { id: 'tokyo', label: 'Tokyo', lat: 35.6812, lon: 139.7671 },
  { id: 'new-york', label: 'New York', lat: 40.758, lon: -73.9855 },
  { id: 'london', label: 'London', lat: 51.5055, lon: -0.0754 },
  { id: 'san-francisco', label: 'San Francisco', lat: 37.7955, lon: -122.3937 },
  { id: 'dubai', label: 'Dubai', lat: 25.1972, lon: 55.2744 },
];

/**
 * Viewing modes. `scale` converts real metres to scene metres; `markerM` is
 * the on-table size of an aircraft marker in scene metres; `heightScale`
 * multiplies aircraft altitude so traffic stays in view (1 = true height).
 *  - globe:   the whole Earth as a ~70 cm model floating over the table
 *  - diorama: the city region on the table, 1 m = 60 km (the 1.2 m table
 *    spans ~70 km: a city and its airports, where traffic is)
 */
export const MODES = {
  globe: {
    id: 'globe',
    label: 'Globe',
    // Radius 0.35 m at eye-ish height, so a controller held forward already
    // points at it (IWER's default controller pose included).
    scale: 0.35 / 6_378_137,
    position: [0, 1.45, -0.9],
    tiltDeg: 70,
    markerM: 0.014,
    // True altitude is under 1 mm at this scale; lift traffic ~1 cm off the
    // surface so it reads as a layer above the globe.
    heightScale: 25,
  },
  diorama: {
    id: 'diorama',
    label: 'City diorama',
    scale: 1 / 60_000,
    position: [0, 0.85, -0.8],
    tiltDeg: 0,
    markerM: 0.016,
    // Exaggerated 2x so climbs and descents read clearly: 11 km sits ~37 cm
    // above the table, inside the grab volume.
    heightScale: 2,
  },
};

export const FLIGHT_RADIUS_NM = 150;
export const FLIGHT_REFRESH_MS = 15_000;
export const EARTHQUAKE_REFRESH_MS = 5 * 60_000;

const KEY_STORAGE = 'gev-xr.googleMapsKey';

/**
 * A Google Maps key enables Photorealistic 3D Tiles. A viewer's own key from
 * the page (kept in their browser only) wins over a build-time key; without
 * either the globe falls back to keyless Esri imagery.
 */
export function readGoogleKey() {
  try {
    const own = localStorage.getItem(KEY_STORAGE);
    if (own) return { key: own, origin: 'viewer' };
  } catch {
    // Storage can be unavailable (private windows, blocked site data).
  }
  const built = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return built ? { key: built, origin: 'site' } : { key: null, origin: null };
}

export function writeGoogleKey(value) {
  try {
    if (value) localStorage.setItem(KEY_STORAGE, value);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Without storage the key lasts for this page load only.
  }
}

/** Startup state from the URL, so a view can be shared as a link. */
export function readUrlState(search = location.search) {
  const params = new URLSearchParams(search);
  const city = CITIES.find((c) => c.id === params.get('city')) ?? CITIES[0];
  const mode = MODES[params.get('mode')] ?? MODES.globe;
  return { city, mode };
}

export function writeUrlState({ city, mode }) {
  const url = new URL(location.href);
  url.searchParams.set('city', city.id);
  url.searchParams.set('mode', mode.id);
  history.replaceState(null, '', url);
}
