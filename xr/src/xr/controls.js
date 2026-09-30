/**
 * Controller mapping, as data. `readControls` turns this frame's IWSDK
 * gamepad state into intents; `main.js` applies them. Keeping the mapping in
 * one table makes it easy to document and to change.
 *
 *   Right  A            switch Globe / City diorama
 *   Right  B            next city
 *   Left   X            show / hide aircraft
 *   Left   Y            show / hide earthquakes
 *   Left   thumbstick   up/down zoom the model, left/right turn it
 *   Either trigger      (IWSDK) aim at the model and hold to grab and move it
 *   Either ray          aim at an aircraft to open its card
 *
 * Hands have no buttons: pinch acts as the trigger (grab), and the ray still
 * opens aircraft cards. Mode, city and layers are then changed on the page.
 */

/**
 * WebXR gamepad component ids, as used by IWSDK's `InputComponent` enum.
 * Spelled out so this module stays importable in Node tests.
 */
export const BUTTON = {
  thumbstick: 'xr-standard-thumbstick',
  a: 'a-button',
  b: 'b-button',
  x: 'x-button',
  y: 'y-button',
};

export const CONTROL_HELP = [
  ['Trigger (hold)', 'Grab and move / turn the model'],
  ['Aim at aircraft', 'Show its info card'],
  ['Right A', 'Switch Globe / City diorama'],
  ['Right B', 'Next city'],
  ['Left X / Y', 'Aircraft / earthquakes on or off'],
  ['Left stick', 'Up/down zoom · left/right turn'],
  ['Hands', 'Pinch = trigger'],
];

const DEADZONE = 0.2;
/** Zoom speed: full stick for one second changes scale by e^1.2 ≈ 3.3x. */
const ZOOM_RATE = 1.2;
/** Turn speed at full stick, radians per second. */
const TURN_RATE = 1.5;

const pressed = (pad, id) => Boolean(pad?.getButtonDown(id));

function stick(pad) {
  const axes = pad?.getAxesValues(BUTTON.thumbstick);
  if (!axes) return { x: 0, y: 0 };
  const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : v);
  return { x: dz(axes.x), y: dz(axes.y) };
}

/** Intents for one frame. `delta` is in seconds. */
export function readControls({ left, right }, delta) {
  const { x, y } = stick(left);
  return {
    toggleMode: pressed(right, BUTTON.a),
    nextCity: pressed(right, BUTTON.b),
    toggleFlights: pressed(left, BUTTON.x),
    toggleQuakes: pressed(left, BUTTON.y),
    // Stick forward (negative y) zooms in.
    zoomFactor: Math.exp(-y * ZOOM_RATE * delta),
    yawRad: x === 0 ? 0 : -x * TURN_RATE * delta,
  };
}
