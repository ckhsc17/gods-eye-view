/**
 * Regional aircraft proxy for the XR companion.
 *
 * adsb.lol serves no CORS headers, so the browser cannot read it directly.
 * This handler is the only server code the XR site has: it validates a point
 * query, forwards it to adsb.lol and returns the readsb payload unchanged with
 * permissive CORS and a short shared cache. It holds no credentials.
 *
 * The same function backs the Vercel route (`api/flights.js`) and the Vite dev
 * middleware (`vite.config.js`), so local and deployed behavior match.
 */

export const ADSB_LOL_POINT_URL = 'https://api.adsb.lol/v2/point';
/** adsb.lol caps point queries at 250 nautical miles. */
export const MAX_RADIUS_NM = 250;
export const DEFAULT_RADIUS_NM = 150;
/** Edge cache lifetime. Every viewer of one city shares a snapshot this old. */
export const CACHE_SECONDS = 10;
const UPSTREAM_TIMEOUT_MS = 8000;

/** Parse and bound the query. Returns null for anything that is not a point. */
export function parseFlightQuery(searchParams) {
  // Number('') and Number(null) are 0, so a missing value must be rejected
  // before conversion rather than becoming the (0, 0) point.
  const number = (name) => {
    const raw = searchParams.get(name);
    return raw == null || raw.trim() === '' ? NaN : Number(raw);
  };
  const lat = number('lat');
  const lon = number('lon');
  const radius = searchParams.has('radius')
    ? number('radius')
    : DEFAULT_RADIUS_NM;
  if (
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(lon) ||
    Math.abs(lon) > 180 ||
    !Number.isFinite(radius) ||
    radius <= 0
  )
    return null;
  return {
    // Rounding keeps nearby requests on one cache key.
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    radius: Math.min(Math.round(radius), MAX_RADIUS_NM),
  };
}

export function upstreamUrl({ lat, lon, radius }) {
  return `${ADSB_LOL_POINT_URL}/${lat}/${lon}/${radius}`;
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      ...extraHeaders,
    },
  });
}

/** Handle one GET request. `fetchImpl` is injectable for tests. */
export async function handleFlightsRequest(
  request,
  { fetchImpl = globalThis.fetch } = {},
) {
  if (request.method !== 'GET') return json(405, { error: 'GET only' });
  const query = parseFlightQuery(new URL(request.url).searchParams);
  if (!query)
    return json(400, { error: 'lat, lon and optional radius (nm) required' });
  let upstream;
  try {
    upstream = await fetchImpl(upstreamUrl(query), {
      // adsb.lol refuses generic runtime user agents (e.g. Node's "node").
      // Identify the proxy like the desktop app's server does.
      headers: {
        accept: 'application/json',
        'user-agent': 'gods-eye-view-xr-proxy/0.1',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json(502, { error: 'adsb.lol unreachable' });
  }
  if (!upstream.ok)
    return json(502, { error: `adsb.lol HTTP ${upstream.status}` });
  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return json(502, { error: 'adsb.lol returned malformed JSON' });
  }
  return json(200, payload, {
    'cache-control': `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 3}`,
  });
}
