import assert from 'node:assert/strict';
import test from 'node:test';
import { BUTTON, readControls } from './controls.js';

function pad({ down = [], axes = { x: 0, y: 0 } } = {}) {
  return {
    getButtonDown: (id) => down.includes(id),
    getAxesValues: (id) => (id === BUTTON.thumbstick ? axes : undefined),
  };
}

test('buttons map to intents on the documented hands', () => {
  const intent = readControls(
    {
      left: pad({ down: [BUTTON.x, BUTTON.y] }),
      right: pad({ down: [BUTTON.a, BUTTON.b] }),
    },
    1 / 72,
  );
  assert.equal(intent.toggleMode, true);
  assert.equal(intent.nextCity, true);
  assert.equal(intent.toggleFlights, true);
  assert.equal(intent.toggleQuakes, true);
  // A and B on the left hand do nothing.
  const wrongHand = readControls(
    { left: pad({ down: [BUTTON.a, BUTTON.b] }), right: pad() },
    1 / 72,
  );
  assert.equal(wrongHand.toggleMode, false);
  assert.equal(wrongHand.nextCity, false);
});

test('left stick forward zooms in, right turns clockwise, deadzone holds', () => {
  const push = readControls(
    { left: pad({ axes: { x: 1, y: -1 } }), right: undefined },
    0.5,
  );
  assert.ok(push.zoomFactor > 1);
  assert.ok(push.yawRad < 0);
  const rest = readControls(
    { left: pad({ axes: { x: 0.1, y: -0.15 } }), right: undefined },
    0.5,
  );
  assert.equal(rest.zoomFactor, 1);
  assert.equal(rest.yawRad, 0);
});

test('missing controllers (hands, disconnected) produce no intents', () => {
  const none = readControls({ left: undefined, right: undefined }, 0.1);
  assert.deepEqual(none, {
    toggleMode: false,
    nextCity: false,
    toggleFlights: false,
    toggleQuakes: false,
    zoomFactor: 1,
    yawRad: 0,
  });
});
