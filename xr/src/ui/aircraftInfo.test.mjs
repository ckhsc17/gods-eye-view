import assert from 'node:assert/strict';
import test from 'node:test';
import { aircraftRows, aircraftTitle } from './aircraftInfo.js';

const base = {
  id: '8991bc',
  callsign: 'CAL121',
  registration: 'B-18315',
  typeCode: 'A333',
  operator: null,
  onGround: false,
  baroAltitudeM: 3200,
  speedMps: 170,
  courseDeg: 5,
  verticalRateMps: -3,
  positionTimeMs: 10_000,
};

test('title falls back from callsign to registration to ICAO', () => {
  assert.equal(aircraftTitle(base), 'CAL121');
  assert.equal(aircraftTitle({ ...base, callsign: null }), 'B-18315');
  assert.equal(
    aircraftTitle({ ...base, callsign: null, registration: null }),
    '8991BC',
  );
});

test('rows convert to aviation units and skip unknowns', () => {
  const rows = Object.fromEntries(aircraftRows(base, 16_000));
  assert.equal(rows.Aircraft, 'A333 · B-18315');
  assert.equal(rows.Altitude, '10,500 ft');
  assert.equal(rows.Speed, '330 kt');
  assert.equal(rows.Track, '005°');
  assert.equal(rows.Vertical, '-600 fpm');
  assert.equal(rows['Fix age'], '6 s');
  assert.equal(rows.ICAO, '8991BC');
  assert.equal('Operator' in rows, false);
});

test('ground and level traffic read naturally', () => {
  const ground = Object.fromEntries(
    aircraftRows({ ...base, onGround: true }, 10_000),
  );
  assert.equal(ground.Altitude, 'On ground');
  assert.equal('Vertical' in ground, false);
  const level = Object.fromEntries(
    aircraftRows({ ...base, verticalRateMps: 0.1 }, 10_000),
  );
  assert.equal(level.Vertical, 'Level');
  const bare = aircraftRows({ id: 'abc123' });
  assert.deepEqual(bare, [['ICAO', 'ABC123']]);
});
