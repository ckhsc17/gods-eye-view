/**
 * The Earth surface as a 3D Tiles stream.
 *
 * With a Google Maps key this is Google Photorealistic 3D Tiles; without one
 * it is a generated ellipsoid textured with keyless Esri World Imagery, the
 * same fallback the desktop app starts on. Either way the result is one
 * TilesRenderer whose `group` is in ECEF, so data layers can be parented to it.
 */
import { TilesRenderer } from '3d-tiles-renderer';
import {
  GeneratedSurfacePlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UnloadTilesPlugin,
  XYZTilesOverlay,
} from '3d-tiles-renderer/plugins';

const ESRI_WORLD_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const TILE_SOURCES = {
  google: {
    id: 'google',
    attribution: 'Google Photorealistic 3D Tiles',
  },
  esri: {
    id: 'esri',
    attribution:
      'Esri World Imagery — Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
};

/**
 * Build a tiles renderer for the given key. Callers own the result and must
 * call `dispose()` on it.
 */
export function createTiles({ googleKey, camera, renderer }) {
  const tiles = new TilesRenderer();
  if (googleKey) {
    tiles.registerPlugin(
      new GoogleCloudAuthPlugin({
        apiToken: googleKey,
        autoRefreshToken: true,
      }),
    );
  } else {
    tiles.registerPlugin(
      new GeneratedSurfacePlugin({
        overlay: new XYZTilesOverlay({ url: ESRI_WORLD_IMAGERY, levels: 19 }),
        applyOverlayTexture: true,
      }),
    );
  }
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  return {
    tiles,
    source: googleKey ? TILE_SOURCES.google : TILE_SOURCES.esri,
  };
}

/**
 * Per-frame update. While presenting, the headset's stereo camera replaces
 * the page camera and resolution comes from one eye's viewport.
 */
export function updateTiles(tiles, { camera, renderer }) {
  const xr = renderer.xr;
  if (xr.isPresenting) {
    const xrCamera = xr.getCamera();
    const eye = xrCamera.cameras[0];
    if (!tiles.hasCamera(xrCamera)) {
      tiles.deleteCamera(camera);
      tiles.setCamera(xrCamera);
    }
    if (eye) tiles.setResolution(xrCamera, eye.viewport.z, eye.viewport.w);
  } else {
    const xrCamera = xr.getCamera();
    if (tiles.hasCamera(xrCamera)) {
      tiles.deleteCamera(xrCamera);
      tiles.setCamera(camera);
    }
    tiles.setResolutionFromRenderer(camera, renderer);
  }
  tiles.update();
}
