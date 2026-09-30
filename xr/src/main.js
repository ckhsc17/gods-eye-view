/**
 * Bootstrap: create the IWSDK world, assemble the tabletop stage and its data
 * layers, and wire the page panel, controllers and hands to one view state.
 */
import {
  createSystem,
  DistanceGrabbable,
  MovementMode,
  SessionMode,
  VisibilityState,
  World,
} from '@iwsdk/core';
import { Ray, Raycaster, Vector2, Vector3 } from 'three';
import {
  CITIES,
  MODES,
  readGoogleKey,
  readUrlState,
  writeGoogleKey,
  writeUrlState,
} from './config.js';
import { createStage } from './globe/stage.js';
import { createEarthquakesLayer } from './layers/earthquakes.js';
import { createFlightsLayer } from './layers/flights.js';
import { createInfoCard } from './ui/infoCard.js';
import { createPanel } from './ui/panel.js';
import { readControls } from './xr/controls.js';
import { prepareXREmulation } from './xr/emulation.js';

/** How far (scene metres) a ray may pass from an aircraft and still pick it. */
const PICK_TOLERANCE_XR_M = 0.03;
const PICK_TOLERANCE_PAGE_M = 0.015;

// Must precede World.create: three.js probes XR bindings once, at renderer setup.
prepareXREmulation();

const container = document.getElementById('scene');
const state = {
  ...readUrlState(),
  tiles: null,
  flights: null,
  quakes: null,
  selected: null,
  layers: { flights: true, quakes: true },
  xr: 'Checking WebXR…',
};

/**
 * Everything that needs the world. Deliberately not a top-level await: in the
 * production bundle IWSDK's lazily imported initializer shares this chunk, and
 * awaiting it during the chunk's own evaluation never resolves.
 */
function start(world) {
  const flights = createFlightsLayer({
    onStatus: (status) => update({ flights: status }),
  });
  const quakes = createEarthquakesLayer({
    onStatus: (status) => update({ quakes: status }),
  });
  const stage = createStage({
    camera: world.camera,
    renderer: world.renderer,
    layers: [flights, quakes],
  });
  const card = createInfoCard();
  world.scene.add(card.object);

  const stageEntity = world.createTransformEntity(stage.root);
  stageEntity.addComponent(DistanceGrabbable, {
    rotate: true,
    translate: true,
    scale: false,
    // Hold the model where the ray grabbed it, rather than pulling it to the hand.
    movementMode: MovementMode.MoveFromTarget,
  });

  const panel = createPanel(document.getElementById('ui'), {
    onCity: (id) => setView({ city: CITIES.find((c) => c.id === id) }),
    onMode: (id) => setView({ mode: MODES[id] }),
    onLayer: (id, on) => setLayer(id, on),
    onClearSelection: () => select(null),
    onEnterXR: () => world.launchXR(),
    onKey: (key) => {
      writeGoogleKey(key);
      mountTiles();
    },
  });

  function update(patch) {
    Object.assign(state, patch);
    panel.render({ ...state, attributions: stage.attributions() });
  }

  function setView(patch) {
    const cityChanged = patch.city && patch.city !== state.city;
    Object.assign(state, patch);
    stage.setView(state);
    writeUrlState(state);
    if (cityChanged) {
      select(null);
      update({ flights: null });
      flights.setFocus(state.city);
    } else update({});
  }

  function setLayer(id, on) {
    const layer = id === 'flights' ? flights : quakes;
    layer.visible = on;
    if (id === 'flights' && !on) select(null);
    update({ layers: { ...state.layers, [id]: on } });
  }

  function select(id) {
    if (id === state.selected?.id) return;
    flights.select(id);
    if (!id) card.hide();
    update({ selected: id ? flights.record(id) : null });
  }

  function mountTiles() {
    const source = stage.mountTiles(readGoogleKey().key);
    update({ tiles: source });
  }

  // Page view: hovering an aircraft with the mouse selects it too.
  const pointer = new Vector2();
  let pointerActive = false;
  const raycaster = new Raycaster();
  world.renderer.domElement.addEventListener('pointermove', (event) => {
    const rect = world.renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    pointerActive = true;
  });

  const ray = new Ray();
  const anchor = new Vector3();
  const rayStart = new Vector3();
  const rayDir = new Vector3();

  /** Controller or hand ray (right preferred) while presenting, else the mouse. */
  function currentRay() {
    if (world.renderer.xr.isPresenting) {
      for (const hand of ['right', 'left']) {
        if (!world.input.xr.getPrimaryInputSource(hand)) continue;
        const space = world.player.raySpaces[hand];
        space.getWorldPosition(rayStart);
        space.getWorldDirection(rayDir);
        // XR ray spaces point down -Z; getWorldDirection returns +Z.
        return {
          ray: ray.set(rayStart, rayDir.negate()),
          tolerance: PICK_TOLERANCE_XR_M,
        };
      }
      return null;
    }
    if (!pointerActive) return null;
    raycaster.setFromCamera(pointer, world.camera);
    return { ray: ray.copy(raycaster.ray), tolerance: PICK_TOLERANCE_PAGE_M };
  }

  /** Per-frame work: tiles, aircraft motion, controls, picking, the card. */
  class GodsEyeSystem extends createSystem() {
    update(delta) {
      stage.update();
      flights.update();

      const intent = readControls(this.input.xr.gamepads, delta);
      if (intent.toggleMode)
        setView({
          mode: state.mode.id === 'globe' ? MODES.diorama : MODES.globe,
        });
      if (intent.nextCity)
        setView({
          city: CITIES[(CITIES.indexOf(state.city) + 1) % CITIES.length],
        });
      if (intent.toggleFlights) setLayer('flights', !state.layers.flights);
      if (intent.toggleQuakes) setLayer('quakes', !state.layers.quakes);
      if (intent.zoomFactor !== 1 || intent.yawRad !== 0)
        stage.nudge({ factor: intent.zoomFactor, yawRad: intent.yawRad });

      const aim = currentRay();
      const hit = aim && flights.pick(aim.ray, aim.tolerance, anchor);
      if (hit) select(hit.id);
      const selected = state.selected && flights.record(state.selected.id);
      if (selected && flights.locate(selected.id, anchor)) {
        card.show(selected, anchor, world.camera);
      } else if (state.selected) {
        // The aircraft left coverage or the layer was hidden.
        select(null);
      }
    }
  }
  world.registerSystem(GodsEyeSystem);

  world.visibilityState.subscribe((visibility) => {
    if (visibility === VisibilityState.NonImmersive) {
      // Leaving the headset returns the model to its home pose on the table.
      stage.setView(state);
      checkXR();
    } else update({ xr: 'In VR' });
  });

  async function checkXR() {
    const supported = await navigator.xr
      ?.isSessionSupported('immersive-vr')
      .catch(() => false);
    update({
      xr: supported ? 'Ready' : 'WebXR VR is not available in this browser',
    });
  }

  // Dev-only handle for scripted checks (scripts/e2e-emulator.mjs).
  if (import.meta.env.DEV)
    window.__gevXR = {
      world,
      stage,
      stageEntity,
      flights,
      quakes,
      state,
      card,
    };

  mountTiles();
  stage.setView(state);
  flights.setFocus(state.city);
  quakes.start();
  checkXR();
  // Attributions arrive as tiles load, and the selected aircraft's fix ages;
  // refresh the page panel once a second.
  setInterval(() => {
    const selected = state.selected && flights.record(state.selected.id);
    update({ selected: selected ?? state.selected });
  }, 1000);
}

World.create(container, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'none',
    // Optional: Quest hand tracking (and IWER's emulated hands). Pinch = select.
    features: { handTracking: true },
  },
  features: {
    grabbing: { useHandPinchForGrab: true },
    locomotion: false,
    spatialUI: false,
  },
  render: {
    near: 0.01,
    far: 100,
    camera: { position: [0, 1.6, 0.35], lookAt: [0, 1.3, -0.9] },
  },
})
  .then(start)
  .catch((error) => {
    console.error('[gev-xr] startup failed', error);
    container.textContent = `Startup failed: ${error.message}`;
  });
