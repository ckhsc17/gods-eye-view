/**
 * Coordinate frames shared by the tiles and every data layer.
 *
 * Three frames are involved:
 *  - ECEF: Earth-centred metres, the native frame of 3D Tiles. The tiles group
 *    and all data-layer meshes live in this frame, as children of the tiles
 *    group, so they can never drift apart.
 *  - Model: the unscaled, Y-up frame of the tabletop model. `tilesetPose`
 *    maps ECEF into it for the current mode and focus city.
 *  - Scene: the model frame scaled and placed on the table by the grabbable
 *    root (`MODES[*].scale` / `position`), which the viewer can move.
 *
 * Pure three.js math: no renderer, no DOM, safe to unit test in Node.
 */
import { MathUtils, Matrix4, Vector3 } from 'three';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer';

const DEG = MathUtils.DEG2RAD;
const EARTH_RADIUS_M = 6_371_008.8;
/** Dead reckoning never extrapolates a fix further than this. */
export const MAX_EXTRAPOLATION_MS = 90_000;

const _enu = new Matrix4();
const _rot = new Matrix4();
const _east = new Vector3();
const _north = new Vector3();
const _up = new Vector3();
const _dir = new Vector3();
const _side = new Vector3();
const _pos = new Vector3();

/**
 * Matrix taking ECEF into the model frame.
 *  - diorama: the city centre sits at the origin, east is +X, up is +Y and
 *    north is -Z (away from a viewer standing at +Z).
 *  - globe: the Earth's centre sits at the origin with the city rotated to
 *    the top, then tilted by `mode.tiltDeg` towards the viewer.
 */
export function tilesetPose(mode, city, target = new Matrix4()) {
  WGS84_ELLIPSOID.getEastNorthUpFrame(city.lat * DEG, city.lon * DEG, 0, _enu);
  if (mode.id === 'globe') {
    // Keep only the rotation so the globe spins about its own centre.
    _enu.setPosition(0, 0, 0);
  }
  target.copy(_enu).invert();
  // ENU (x east, y north, z up) -> Y-up (x east, y up, z south), then tilt.
  _rot.makeRotationX((mode.tiltDeg - 90) * DEG);
  return target.premultiply(_rot);
}

/** ECEF position of a geographic point, degrees and metres above the ellipsoid. */
export function toEcef(latDeg, lonDeg, heightM, target = new Vector3()) {
  return WGS84_ELLIPSOID.getCartographicToPosition(
    latDeg * DEG,
    lonDeg * DEG,
    heightM,
    target,
  );
}

/**
 * Instance matrix for a direction marker in ECEF: its +Y axis points along
 * `courseDeg` (clockwise from north) in the local horizontal plane, its +Z axis
 * points up, and it is uniformly scaled to `sizeM` metres.
 */
export function markerMatrix(
  latDeg,
  lonDeg,
  heightM,
  courseDeg,
  sizeM,
  target = new Matrix4(),
) {
  WGS84_ELLIPSOID.getEastNorthUpAxes(
    latDeg * DEG,
    lonDeg * DEG,
    _east,
    _north,
    _up,
  );
  const course = (courseDeg ?? 0) * DEG;
  _dir
    .copy(_north)
    .multiplyScalar(Math.cos(course))
    .addScaledVector(_east, Math.sin(course));
  _side.crossVectors(_dir, _up);
  toEcef(latDeg, lonDeg, heightM, _pos);
  return target
    .makeBasis(
      _side.multiplyScalar(sizeM),
      _dir.multiplyScalar(sizeM),
      _up.multiplyScalar(sizeM),
    )
    .setPosition(_pos);
}

/**
 * Upright (+Z = local up) uniform-scale matrix at a point, for markers that
 * have no heading.
 */
export function uprightMatrix(
  latDeg,
  lonDeg,
  heightM,
  sizeM,
  target = new Matrix4(),
) {
  return markerMatrix(latDeg, lonDeg, heightM, 0, sizeM, target);
}

/**
 * Advance a fix along its course at its ground speed. Returns the fix itself
 * when it cannot move (no speed/course, on the ground, or unknown time).
 */
export function deadReckon(
  { latitude, longitude, speedMps, courseDeg, positionTimeMs, onGround },
  nowMs,
) {
  if (
    onGround ||
    speedMps == null ||
    courseDeg == null ||
    positionTimeMs == null ||
    nowMs <= positionTimeMs
  )
    return { lat: latitude, lon: longitude };
  const dt = Math.min(nowMs - positionTimeMs, MAX_EXTRAPOLATION_MS) / 1000;
  const distance = speedMps * dt;
  const course = courseDeg * DEG;
  const dLat = (distance * Math.cos(course)) / EARTH_RADIUS_M;
  const cosLat = Math.max(Math.cos(latitude * DEG), 1e-6);
  const dLon = (distance * Math.sin(course)) / (EARTH_RADIUS_M * cosLat);
  return {
    lat: latitude + dLat / DEG,
    lon: ((longitude + dLon / DEG + 540) % 360) - 180,
  };
}

/** Split a matrix into the parts an Object3D stores. */
export function applyMatrix(object, matrix) {
  matrix.decompose(object.position, object.quaternion, object.scale);
  object.updateMatrixWorld(true);
}
