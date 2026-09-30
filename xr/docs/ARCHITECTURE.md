# XR architecture

How the XR companion is put together: its frames, what owns what, what it
reuses from the parent app, and where it is expected to grow.

## Runtime stack

| Concern       | Choice                                   | Why                                                            |
| ------------- | ---------------------------------------- | -------------------------------------------------------------- |
| XR framework  | IWSDK `@iwsdk/core` (ECS on three.js)    | Grab, input and session handling out of the box; Quest-first   |
| Renderer      | `three` aliased to `super-three@0.181.0` | IWSDK requires this fork; one three instance for every package |
| Earth surface | `3d-tiles-renderer`                      | Google Photorealistic 3D Tiles and generated XYZ surfaces      |
| Desktop VR    | IWER via `@iwsdk/vite-plugin-iwer`       | Emulated Quest 3 in ordinary Chrome, injected in prod too      |
| Build         | Vite 7 (own `package.json`)              | The IWER plugin needs Vite 7; the parent app stays on Vite 6   |
| Server        | One Vercel Function (`api/flights.js`)   | adsb.lol has no CORS; everything else is static                |

CesiumJS is not used. The parent app's Cesium scene cannot render into a WebXR
session, which is why this app exists separately (see the parent
[README](../../README.md#-under-the-hood)).

## Frames

Every geographic object lives in **ECEF** as a child of `tiles.group`. That
way tiles and data can never drift apart when the model moves.

```
root            scene frame     placed on the table, grabbable (IWSDK DistanceGrabbable)
└── model       model frame     uniform scale = MODES[mode].scale
    └── tiles.group  ECEF       matrix = tilesetPose(mode, city)
        ├── flights       InstancedMesh, instance matrices in ECEF
        └── earthquakes   InstancedMesh, instance matrices in ECEF
```

`src/geo/frames.js` holds all of the math and is unit tested in Node:

- `tilesetPose(mode, city)`
  - **diorama:** the inverse east-north-up frame at the city, rotated to
    Y-up. The city centre sits at the origin, east is +X and north is −Z.
  - **globe:** only the rotation part, so the Earth spins about its centre. The
    city is then tilted `tiltDeg` toward the viewer.
- `markerMatrix(lat, lon, h, course, size)`: +Y points along the course, +Z is
  local up, scaled uniformly. Cones (`ConeGeometry` points +Y) become heading
  arrows.
- `deadReckon(record, now)`: great-circle-free flat-earth advance along course.
  It is capped at `MAX_EXTRAPOLATION_MS` and wraps at the antimeridian.

Markers stay a constant on-table size. The stage passes
`mode.markerM / mode.scale` (real metres) to each layer on every mode change.

## Ownership

| Module               | Owns                                                               | Must not                      |
| -------------------- | ------------------------------------------------------------------ | ----------------------------- |
| `main.js`            | App state (`city`, `mode`, statuses), wiring, the per-frame system | Hold geometry or fetch data   |
| `config.js`          | Cities, modes, key/URL persistence                                 | Import three.js               |
| `globe/tiles.js`     | TilesRenderer construction, plugins, camera/resolution per frame   | Know about layers             |
| `globe/stage.js`     | Scene graph, grab proxies, remounting tiles on key change          | Fetch data                    |
| `layers/*.js`        | Polling, normalizing, one InstancedMesh each, `dispose()`          | Touch the DOM or other layers |
| `ui/panel.js`        | Page DOM only; renders the state it is given                       | Hold state                    |
| `ui/infoCard.js`     | The floating aircraft card mesh (scene child, not stage child)     | Decide what is selected       |
| `ui/aircraftInfo.js` | Record → display rows (units, fallbacks); pure                     | Touch DOM or three.js         |
| `xr/controls.js`     | Controller mapping table → per-frame intents; pure                 | Apply intents                 |
| `geo/picking.js`     | Nearest marker to a ray; pure                                      | Know about layers             |
| `server/flights.js`  | Query validation, upstream call, CORS and cache headers            | Hold credentials              |

A layer has a small, uniform interface that the stage relies on:
`{ object, visible, setMarkerSize(m), update?(nowMs), dispose() }`, plus its own
start/focus method. Pickable layers (flights) add `pick(ray, tolerance)`,
`locate(id)`, `record(id)` and `select(id)`. To add one, create `src/layers/<name>.js` with that shape
and pass it in `layers: [...]` in `main.js`.

## Interaction

**Grabbing** uses IWSDK's `DistanceGrabbable` on the stage root, in
`MoveFromTarget` mode: the model stays where the ray caught it and follows the
controller, rather than flying to the hand. The trigger (select) drives it,
and so does a pinch, which is `select` for hands.

The ray only ever hits invisible **hit proxies**:

- **Globe:** a sphere the size of the Earth model.
- **Diorama:** an 80 cm-tall cylinder of air over the table.

Only the current mode's proxy is in the scene graph. Both are **double-sided**,
so grabbing still works after zooming until the hands are inside the model.

Everything else opts out of raycasting (`raycast = () => {}`): streamed tile
meshes (on `load-model`), both InstancedMeshes, the table ring and the card.
Tiles come and go and have thousands of triangles, and aiming at an aircraft
must never start a grab.

The globe sits at 1.45 m, 0.9 m ahead, with a 0.35 m radius. A controller held
level, including IWER's default pose, already points at it.

**Picking aircraft** does not use triangles either. `flights.pick()` takes the
marker centre nearest to the ray, within 3 cm in VR or 1.5 cm for the mouse on
the page, and prefers nearer markers (`geo/picking.js`). The ray comes from:

- `world.player.raySpaces.right`, else `.left`, while presenting
- the mouse, via `Raycaster.setFromCamera`, on the page

Selection is sticky. It changes only when another aircraft is aimed at, and it
clears on a city change, when the layer is hidden, or when the aircraft leaves
coverage.

**Buttons and sticks** are read once per frame in `GodsEyeSystem` through
`readControls()`. The mapping table lives in `xr/controls.js` and is the single
source for the page's Controls list (`CONTROL_HELP`). Left-stick zoom and turn
call `stage.nudge()`, which scales the root 0.25×–6× and turns it about world
up in place.

## Emulator notes

- **Button IDs.** The device side (`window.IWER_DEVICE`) uses `trigger`,
  `squeeze`, `thumbstick`, `a-button`, `b-button`, `x-button` and `y-button`.
- **DevUI owns the poses.** The DevUI copies its handle objects
  (`window.transformHandles`, one per hand) onto the device every frame.
  Setting `IWER_DEVICE.controllers.*.position` directly is overwritten, so
  scripts move the handles instead (`scripts/e2e-emulator.mjs`).
- **Play mode key map:**
  - mouse look
  - left click = right trigger, right click = right squeeze
  - Enter / Right Shift = A / B
  - arrows = right stick
  - W A S D = left stick
  - Q / E = left trigger / squeeze
  - X / Z = left X / Y
- **Hands.** `IWER_DEVICE.primaryInputMode = 'hand'` switches to hands, and
  `hands.right.updatePinchValue(1)` pinches.

## Reuse from the parent app

The only imports from `../src` go through the parent's **declared portable
exports**, via Vite aliases in `vite.config.js`:

| Alias                                     | Parent module                      | Used for                    |
| ----------------------------------------- | ---------------------------------- | --------------------------- |
| `gods-eye-view/sources/live`              | `src/sources/live/index.js`        | `readsbSnapshot` normalizer |
| `gods-eye-view/layers/earthquakes/source` | `src/layers/earthquakes/source.js` | USGS fetch + validation     |

The parent's `npm run check:boundaries` guarantees these graphs contain no
Cesium, DOM or Node code (see [CODE-BOUNDARIES](../../docs/CODE-BOUNDARIES.md)).
Do not alias anything that is not a declared portable export. Anything else
may pull Cesium into this bundle.

The XR app lives outside `src/` and `server/`. The parent's formatter,
boundary checks and CI therefore ignore it, and upstream merges touch it only
if upstream adds an `xr/` folder.

## Desktop Chrome workaround

Current desktop Chrome has a native `XRWebGLBinding` with
`createProjectionLayer`. three.js then picks the WebXR Layers path and passes
IWER's emulated session to the native constructor, which throws.
`src/xr/emulation.js` detects IWER (it installs `navigator.xr` as an own
property) and hides the native binding **before** `World.create`. three.js
then uses `XRWebGLLayer`, which IWER emulates. Real headsets are unaffected,
because IWER is not injected in Quest Browser.

## Startup

`World.create` must not be awaited at module top level. In the production
bundle IWSDK's lazily imported world initializer ends up in the same chunk as
`main.js`. A top-level await on it then never settles, leaving a blank page
with no error. `main.js` uses `World.create(...).then(start)` instead.

## Porting desktop features

Only aircraft (with details) and earthquakes exist here so far. The table below
lists what else the desktop app has, and how each feature would reach XR.

| Desktop feature                | XR route                                                                                         | Effort |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ------ |
| Flight track / trail           | adsb.lol `trace` via a second proxy route + `normalizeAircraftTrack` (portable) → `Line` in ECEF | S      |
| Follow an aircraft             | Re-centre the diorama on the selected aircraft each frame (`tilesetPose` at its lat/lon)         | S      |
| Satellites + orbits            | CelesTrak GP JSON (CORS ok) + `satellite.js` SGP4 in the browser; globe mode                     | M      |
| Military aircraft              | adsb.lol `/mil` through the same proxy pattern                                                   | S      |
| Ships (AIS)                    | Needs AISStream key server-side → a Vercel function with a secret; rate-limit before sharing     | M      |
| Weather, wind, cyclones, fires | Mostly keyless GeoJSON/tiles → image overlays or instanced glyphs                                | M      |
| CCTV                           | Video textures on floating panels; upstream CORS varies, needs the parent's frame proxy          | L      |
| Cockpit / first-person view    | Fly the player at 1:1 scale along a dead-reckoned path (the "sit in the plane" mode)             | L      |
| Voice (OpenAI Realtime)        | Server-side key + WebRTC; the parent's portable action schemas (`src/voice/`) map to XR intents  | L      |

## Next steps

1. **Spatial menu:** an IWSDK `PanelUI` (UIKitML) on the wrist or table edge
   for city, mode and layers. The page panel would then not be needed in the
   headset, and hands could change them too.
2. **Two-hand scale:** add `TwoHandsGrabbable` to the stage entity for pinch
   zoom.
3. **Satellites** (see the table above).
4. **Flight trails and follow mode** for the selected aircraft.
5. **Bundle split:** lazy-load IWER only when `navigator.xr` lacks
   `immersive-vr`, and import IWSDK submodules instead of the barrel.
6. **Handoff from the desktop app:** an "Open in VR" chip in the parent UI that
   links to `?city=&mode=` (or lat/lon) on the XR site.
