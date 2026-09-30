/**
 * Live aircraft around the focus city.
 *
 * Acquisition goes through the site's `/api/flights` proxy (adsb.lol has no
 * CORS). Records are normalized by the parent app's portable readsb
 * normalizer, so field meanings match the desktop Flights layer. Rendering is
 * one InstancedMesh in ECEF, dead-reckoned every frame between 15 s fixes.
 */
import {
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { readsbSnapshot } from 'gods-eye-view/sources/live';
import { FLIGHT_RADIUS_NM, FLIGHT_REFRESH_MS } from '../config.js';
import { deadReckon, markerMatrix } from '../geo/frames.js';
import { nearestToRay } from '../geo/picking.js';

const CAPACITY = 2000;
const AIRBORNE = new Color(0x4ff0ff);
const GROUND = new Color(0x7a8a99);
const SELECTED = new Color(0xffd60a);
const SELECTED_SCALE = 1.8;
/** Ground traffic and missing altitudes are lifted this far so they clear terrain. */
const MIN_HEIGHT_M = 60;

/** Fetch one regional snapshot and normalize it. */
export async function fetchFlights(
  { lat, lon },
  { signal, fetchImpl = fetch } = {},
) {
  const url = `/api/flights?lat=${lat}&lon=${lon}&radius=${FLIGHT_RADIUS_NM}`;
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`flights HTTP ${response.status}`);
  const payload = await response.json();
  const observedAtMs = Number.isFinite(payload?.now) ? payload.now : Date.now();
  return readsbSnapshot(payload, {
    observedAtMs,
    coverage: `${FLIGHT_RADIUS_NM} nm around the focus city`,
  });
}

/**
 * Height used for drawing: geometric first, then barometric, times the mode's
 * `heightScale`, never below the floor.
 */
export function drawHeightM(record, heightScale = 1) {
  if (record.onGround) return MIN_HEIGHT_M;
  const height = record.ellipsoidAltitudeM ?? record.baroAltitudeM;
  return Math.max((height ?? 0) * heightScale, MIN_HEIGHT_M);
}

export function createFlightsLayer({ onStatus = () => {} } = {}) {
  const geometry = new ConeGeometry(0.35, 1, 6);
  const material = new MeshBasicMaterial({ color: 0xffffff });
  const mesh = new InstancedMesh(geometry, material, CAPACITY);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.name = 'flights';
  // Picking is done by `pick()` against marker centres; keeping the mesh out
  // of IWSDK's pointer raycasts means aiming at an aircraft never starts a grab.
  mesh.raycast = () => {};

  const matrix = new Matrix4();
  /** ECEF marker centres from the last update, index-aligned with `records`. */
  const positions = Array.from({ length: CAPACITY }, () => new Vector3());
  const world = new Vector3();
  let records = [];
  let focus = null;
  let timer = null;
  let controller = null;
  let markerSizeM = 1;
  let heightScale = 1;
  let selectedId = null;

  async function refresh() {
    if (!focus) return;
    controller?.abort();
    controller = new AbortController();
    try {
      const snapshot = await fetchFlights(focus, { signal: controller.signal });
      records = snapshot.records.slice(0, CAPACITY);
      onStatus({ ok: true, count: records.length, source: snapshot.source });
    } catch (error) {
      if (error.name === 'AbortError') return;
      onStatus({ ok: false, error: error.message });
    }
  }

  return {
    object: mesh,
    get visible() {
      return mesh.visible;
    },
    set visible(value) {
      mesh.visible = value;
    },
    /** Start (or restart) polling around a city. */
    setFocus(city) {
      focus = city;
      records = [];
      selectedId = null;
      mesh.count = 0;
      clearInterval(timer);
      refresh();
      timer = setInterval(refresh, FLIGHT_REFRESH_MS);
    },
    /** Marker size in real metres, so it stays a constant size on the table. */
    setMarkerSize(sizeM) {
      markerSizeM = sizeM;
    },
    /** Altitude multiplier for the current mode (see MODES.heightScale). */
    setHeightScale(value) {
      heightScale = value;
    },
    /** Highlight one aircraft by record id (or null). */
    select(id) {
      selectedId = id;
    },
    update(nowMs = Date.now()) {
      let index = 0;
      for (const record of records) {
        const { lat, lon } = deadReckon(record, nowMs);
        const selected = record.id === selectedId;
        markerMatrix(
          lat,
          lon,
          drawHeightM(record, heightScale),
          record.courseDeg,
          markerSizeM * (selected ? SELECTED_SCALE : 1),
          matrix,
        );
        positions[index].setFromMatrixPosition(matrix);
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(
          index,
          selected ? SELECTED : record.onGround ? GROUND : AIRBORNE,
        );
        index += 1;
      }
      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    /**
     * The aircraft whose marker is closest to a world-space ray, within
     * `toleranceM` scene metres of it, or null. `anchor` receives its world
     * position.
     */
    pick(ray, toleranceM, anchor = new Vector3()) {
      if (!mesh.visible || !records.length) return null;
      mesh.updateWorldMatrix(true, false);
      const points = [];
      for (let i = 0; i < mesh.count; i += 1)
        points.push(positions[i].clone().applyMatrix4(mesh.matrixWorld));
      const index = nearestToRay(ray, points, toleranceM);
      if (index < 0) return null;
      anchor.copy(points[index]);
      return records[index];
    },
    /** World position of an aircraft by id, for keeping a card attached. */
    locate(id, target = new Vector3()) {
      const index = records.findIndex((r) => r.id === id);
      if (index < 0 || index >= mesh.count) return null;
      world.copy(positions[index]).applyMatrix4(mesh.matrixWorld);
      return target.copy(world);
    },
    /** Ids of the aircraft currently drawn, in draw order. */
    ids() {
      return records.slice(0, mesh.count).map((r) => r.id);
    },
    record(id) {
      return records.find((r) => r.id === id) ?? null;
    },
    dispose() {
      clearInterval(timer);
      controller?.abort();
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
