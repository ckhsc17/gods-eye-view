import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { MODES } from '../config.js';
import {
  MAX_EXTRAPOLATION_MS,
  deadReckon,
  markerMatrix,
  tilesetPose,
  toEcef,
} from './frames.js';

const taipei = { lat: 25.0339, lon: 121.5645 };
const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('diorama pose puts the city at the origin, up +Y, north -Z', () => {
  const pose = tilesetPose(MODES.diorama, taipei);
  const centre = toEcef(taipei.lat, taipei.lon, 0).applyMatrix4(pose);
  assert.ok(centre.length() < 1e-3, `centre ${centre.toArray()}`);
  const above = toEcef(taipei.lat, taipei.lon, 1000).applyMatrix4(pose);
  close(above.y, 1000, 1e-3);
  const north = toEcef(taipei.lat + 0.01, taipei.lon, 0).applyMatrix4(pose);
  assert.ok(north.z < -1000, `north z ${north.z}`);
  const east = toEcef(taipei.lat, taipei.lon + 0.01, 0).applyMatrix4(pose);
  assert.ok(east.x > 1000, `east x ${east.x}`);
});

test('globe pose keeps the Earth centred and tilts the city toward the viewer', () => {
  const pose = tilesetPose(MODES.globe, taipei);
  const centre = new Vector3().applyMatrix4(pose);
  assert.ok(centre.length() < 1e-3);
  const city = toEcef(taipei.lat, taipei.lon, 0).applyMatrix4(pose).normalize();
  // tiltDeg 70: the city leans 70° from straight up toward +Z.
  close(city.y, Math.cos((70 * Math.PI) / 180), 0.01);
  close(city.z, Math.sin((70 * Math.PI) / 180), 0.01);
});

test('markerMatrix aligns +Y with course and +Z with local up', () => {
  const m = markerMatrix(0, 0, 0, 90, 10);
  const x = new Vector3(),
    y = new Vector3(),
    z = new Vector3();
  m.extractBasis(x, y, z);
  // At (0°, 0°) ECEF east is +Y and up is +X.
  close(y.length(), 10);
  close(y.y / 10, 1);
  close(z.x / 10, 1);
});

test('deadReckon advances along course and caps extrapolation', () => {
  const fix = {
    latitude: 0,
    longitude: 179.99,
    speedMps: 250,
    courseDeg: 90,
    positionTimeMs: 0,
    onGround: false,
  };
  const later = deadReckon(fix, 10_000);
  close(later.lat, 0, 1e-9);
  // Crosses the antimeridian and wraps into the western hemisphere.
  assert.ok(later.lon < -179.9, `lon ${later.lon}`);
  const capped = deadReckon(fix, MAX_EXTRAPOLATION_MS * 10);
  const atCap = deadReckon(fix, MAX_EXTRAPOLATION_MS);
  assert.deepEqual(capped, atCap);
  assert.deepEqual(deadReckon({ ...fix, onGround: true }, 10_000), {
    lat: 0,
    lon: 179.99,
  });
  assert.deepEqual(deadReckon({ ...fix, speedMps: null }, 10_000), {
    lat: 0,
    lon: 179.99,
  });
});
