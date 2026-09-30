/**
 * The tabletop model: one grabbable root that carries the tiles and every
 * data layer.
 *
 *   root (scene frame: placed + scaled on the table, grabbable)
 *   ├── hit proxy (invisible sphere / air cylinder the grab ray hits)
 *   ├── table ring (visual anchor under the model)
 *   └── model (unscaled Y-up model frame, see geo/frames.js)
 *       └── tiles.group (ECEF)
 *           ├── flights
 *           └── earthquakes
 *
 * Streamed tile meshes come and go, so grabbing targets the stable proxy
 * instead. Tiles are rebuilt only when the key changes; switching city or
 * mode only moves matrices.
 */
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { applyMatrix, tilesetPose } from '../geo/frames.js';
import { createTiles, updateTiles } from './tiles.js';

const GLOBE_RADIUS_M = 6_378_137;
/**
 * Diorama proxy: the air volume over the 1.2 m table, up to 0.8 m high. It
 * covers where the aircraft fly and catches a controller held level, so the
 * city can be grabbed without aiming down at the table.
 */
const DIORAMA_HIT_RADIUS = 0.6;
const DIORAMA_HIT_HEIGHT = 0.8;

const noRaycast = () => {};
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const _yaw = new Quaternion();
const _up = new Vector3(0, 1, 0);

function invisibleMaterial() {
  // Double-sided so the proxy can still be grabbed after zooming the globe
  // until the viewer's hands are inside it.
  return new MeshBasicMaterial({
    side: DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
}

export function createStage({ camera, renderer, layers }) {
  const root = new Group();
  root.name = 'gev-stage';
  const model = new Group();
  root.add(model);

  const globeHit = new Mesh(new SphereGeometry(1, 24, 16), invisibleMaterial());
  const dioramaHit = new Mesh(
    new CylinderGeometry(
      DIORAMA_HIT_RADIUS,
      DIORAMA_HIT_RADIUS,
      DIORAMA_HIT_HEIGHT,
      32,
    ).translate(0, DIORAMA_HIT_HEIGHT / 2, 0),
    invisibleMaterial(),
  );
  const ring = new Mesh(
    new RingGeometry(0.58, 0.6, 64),
    new MeshBasicMaterial({
      color: 0x4ff0ff,
      transparent: true,
      opacity: 0.35,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.raycast = noRaycast;
  root.add(ring);

  let current = null;
  let view = null;
  const pose = new Matrix4();

  function mountTiles(googleKey) {
    if (current) {
      model.remove(current.tiles.group);
      for (const layer of layers) current.tiles.group.remove(layer.object);
      current.tiles.dispose();
    }
    current = createTiles({ googleKey, camera, renderer });
    // Streamed tiles never take part in pointer raycasts: grabbing uses the
    // proxies, and ray-testing thousands of tile triangles per frame is slow.
    current.tiles.addEventListener('load-model', ({ scene }) =>
      scene.traverse((object) => {
        object.raycast = noRaycast;
      }),
    );
    for (const layer of layers) current.tiles.group.add(layer.object);
    model.add(current.tiles.group);
    if (view) setView(view);
    return current.source;
  }

  /** Place the model for a mode and focus city. Resets any grab offset. */
  function setView({ mode, city }) {
    view = { mode, city };
    root.position.fromArray(mode.position);
    root.quaternion.identity();
    root.scale.setScalar(1);
    model.scale.setScalar(mode.scale);
    const isGlobe = mode.id === 'globe';
    const globeRadius = GLOBE_RADIUS_M * mode.scale;
    globeHit.scale.setScalar(globeRadius);
    // Only the current mode's proxy is in the graph, so only it can be hit.
    globeHit.removeFromParent();
    dioramaHit.removeFromParent();
    root.add(isGlobe ? globeHit : dioramaHit);
    ring.visible = !isGlobe;
    if (current)
      applyMatrix(current.tiles.group, tilesetPose(mode, city, pose));
    // Real metres per on-table metre, for constant-size markers.
    for (const layer of layers) {
      layer.setMarkerSize(mode.markerM / mode.scale);
      layer.setHeightScale?.(mode.heightScale);
    }
    root.updateMatrixWorld(true);
  }

  /**
   * Zoom by `factor` and turn by `yawRad` about the vertical axis, in place.
   * Used by the left thumbstick; grabbing still moves the whole root.
   */
  function nudge({ factor = 1, yawRad = 0 }) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, root.scale.x * factor));
    root.scale.setScalar(next);
    if (yawRad) root.quaternion.premultiply(_yaw.setFromAxisAngle(_up, yawRad));
    root.updateMatrixWorld(true);
  }

  return {
    root,
    mountTiles,
    setView,
    nudge,
    get tiles() {
      return current?.tiles ?? null;
    },
    update() {
      if (current) updateTiles(current.tiles, { camera, renderer });
    },
    attributions() {
      if (!current) return [];
      return current.tiles
        .getAttributions()
        .filter((item) => item.type === 'string')
        .map((item) => item.value);
    },
  };
}
