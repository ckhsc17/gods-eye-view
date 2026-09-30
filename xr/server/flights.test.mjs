import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_RADIUS_NM,
  MAX_RADIUS_NM,
  handleFlightsRequest,
  parseFlightQuery,
  upstreamUrl,
} from './flights.js';

const params = (query) => new URLSearchParams(query);

test('parseFlightQuery bounds, rounds and defaults the point query', () => {
  assert.deepEqual(parseFlightQuery(params('lat=25.0330&lon=121.5654')), {
    lat: 25.03,
    lon: 121.57,
    radius: DEFAULT_RADIUS_NM,
  });
  assert.equal(
    parseFlightQuery(params('lat=1&lon=2&radius=9999')).radius,
    MAX_RADIUS_NM,
  );
  for (const bad of [
    '',
    'lat=91&lon=0',
    'lat=0&lon=181',
    'lat=x&lon=0',
    'lat=0&lon=0&radius=0',
    'lat=0&lon=0&radius=-5',
  ])
    assert.equal(parseFlightQuery(params(bad)), null, bad);
});

test('upstreamUrl targets the adsb.lol point route', () => {
  assert.equal(
    upstreamUrl({ lat: 25.03, lon: 121.57, radius: 150 }),
    'https://api.adsb.lol/v2/point/25.03/121.57/150',
  );
});

test('handleFlightsRequest passes the payload through with CORS and cache', async () => {
  let requested;
  const response = await handleFlightsRequest(
    new Request('https://x.test/api/flights?lat=25&lon=121.5&radius=100'),
    {
      fetchImpl: async (url) => {
        requested = url;
        return Response.json({ ac: [], now: 1 });
      },
    },
  );
  assert.equal(requested, 'https://api.adsb.lol/v2/point/25/121.5/100');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('cache-control'), /s-maxage=\d+/);
  assert.deepEqual(await response.json(), { ac: [], now: 1 });
});

test('handleFlightsRequest rejects bad input and maps upstream failures', async () => {
  const bad = await handleFlightsRequest(
    new Request('https://x.test/api/flights?lat=abc&lon=1'),
  );
  assert.equal(bad.status, 400);
  const post = await handleFlightsRequest(
    new Request('https://x.test/api/flights?lat=1&lon=1', { method: 'POST' }),
  );
  assert.equal(post.status, 405);
  const down = await handleFlightsRequest(
    new Request('https://x.test/api/flights?lat=1&lon=1'),
    { fetchImpl: async () => new Response('nope', { status: 503 }) },
  );
  assert.equal(down.status, 502);
  const offline = await handleFlightsRequest(
    new Request('https://x.test/api/flights?lat=1&lon=1'),
    {
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    },
  );
  assert.equal(offline.status, 502);
  assert.equal(offline.headers.get('cache-control'), null);
});
