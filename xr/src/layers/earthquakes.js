/**
 * USGS earthquakes (M2.5+, past day), worldwide.
 *
 * USGS serves CORS, so the parent app's portable source is used as-is and the
 * browser fetches directly. Each event is a sphere sized by magnitude and
 * coloured with the desktop app's depth bands (shallow red, intermediate
 * orange, deep yellow).
 */
import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';
import { createUsgsEarthquakeSource } from 'gods-eye-view/layers/earthquakes/source';
import { EARTHQUAKE_REFRESH_MS } from '../config.js';
import { uprightMatrix } from '../geo/frames.js';

const CAPACITY = 1000;
const SHALLOW = new Color(0xff3b30);
const INTERMEDIATE = new Color(0xff9f0a);
const DEEP = new Color(0xffd60a);
/** Earthquakes are drawn smaller than aircraft markers so they never hide traffic. */
const SIZE_FACTOR = 0.4;

/** Same thresholds as the desktop `depthColor` (src/layers/earthquakes/model.js). */
export function depthBand(depthKm) {
  if (depthKm == null || depthKm < 70) return SHALLOW;
  if (depthKm < 300) return INTERMEDIATE;
  return DEEP;
}

/** Marker radius multiplier: M2.5 is 1x, each magnitude step adds ~60%. */
export function magnitudeScale(mag) {
  return 1.6 ** Math.max(0, mag - 2.5);
}

export function createEarthquakesLayer({ onStatus = () => {} } = {}) {
  const source = createUsgsEarthquakeSource();
  const geometry = new SphereGeometry(0.5, 12, 8);
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
  });
  const mesh = new InstancedMesh(geometry, material, CAPACITY);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.name = 'earthquakes';
  mesh.raycast = () => {};

  const matrix = new Matrix4();
  let rows = [];
  let markerSizeM = 1;
  let timer = null;

  function layout() {
    let index = 0;
    for (const row of rows.slice(0, CAPACITY)) {
      uprightMatrix(
        row.lat,
        row.lon,
        0,
        markerSizeM * magnitudeScale(row.mag),
        matrix,
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, depthBand(row.depthKm));
      index += 1;
    }
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  async function refresh() {
    try {
      rows = await source.getSnapshot();
      layout();
      onStatus({ ok: true, count: rows.length });
    } catch (error) {
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
    start() {
      refresh();
      timer = setInterval(refresh, EARTHQUAKE_REFRESH_MS);
    },
    setMarkerSize(sizeM) {
      markerSizeM = sizeM * SIZE_FACTOR;
      layout();
    },
    dispose() {
      clearInterval(timer);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
