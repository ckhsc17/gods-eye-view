/**
 * Scripted interaction check against the dev server, driving IWER's emulated
 * Quest 3 through `window.IWER_DEVICE` instead of the on-screen panels.
 *
 *   npm run dev            # in another terminal
 *   npm run e2e            # CHROME_PATH=... to override the browser
 *
 * Checks, in order: enter VR, controller trigger grab, left-stick zoom,
 * left X layer toggle, aiming at an aircraft opens its card, hand pinch grab.
 * Screenshots go to SCREENSHOT_DIR (default: the OS temp directory).
 * Requires `puppeteer-core` (not a dependency: `npm i --no-save puppeteer-core`)
 * and a local Chrome (CHROME_PATH).
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const URL =
  process.env.XR_URL ?? 'http://localhost:4180/?city=taipei&mode=globe';
const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.SCREENSHOT_DIR ?? join(tmpdir(), 'gev-xr-e2e');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
  );
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gevXR && window.IWER_DEVICE, {
    timeout: 30000,
  });
  // Let flights load before aiming at one.
  await page.waitForFunction(
    () =>
      window.__gevXR.state.flights?.ok &&
      window.__gevXR.state.flights.count > 0,
    { timeout: 30000 },
  );
  await page.evaluate(() => document.querySelector('.primary').click());
  await page.waitForFunction(() => window.__gevXR.state.xr === 'In VR', {
    timeout: 15000,
  });
  check('enter VR (emulated Quest 3)', true);
  await sleep(1500);

  // IWER's DevUI owns the controller poses: it copies its own handle objects
  // (window.transformHandles, children of its camera rig) onto the emulated
  // device every frame, so poses are driven through those handles, exactly
  // like dragging the on-screen gizmos.
  const nudgeHand = (hand, axis, amount) =>
    page.evaluate(
      (hand, axis, amount) => {
        window.transformHandles.get(hand).position[axis] += amount;
      },
      hand,
      axis,
      amount,
    );
  const drag = async (hand, axis, total, steps = 10) => {
    for (let i = 0; i < steps; i += 1) {
      await nudgeHand(hand, axis, total / steps);
      await sleep(60);
    }
  };

  const rootPos = () =>
    page.evaluate(() => window.__gevXR.stage.root.position.toArray());

  // Trigger grab: default right controller pose aims at the globe.
  const before = await rootPos();
  await page.evaluate(() => {
    const c = window.IWER_DEVICE.controllers.right;
    c.updateButtonValue('trigger', 1);
  });
  await sleep(400);
  await drag('right', 'x', -0.2);
  await page.evaluate(() =>
    window.IWER_DEVICE.controllers.right.updateButtonValue('trigger', 0),
  );
  await sleep(300);
  const after = await rootPos();
  const moved = Math.hypot(...after.map((v, i) => v - before[i]));
  check(
    'trigger grab moves the globe',
    moved > 0.05,
    `moved ${moved.toFixed(3)} m`,
  );
  await page.screenshot({ path: join(OUT, '1-grab.png') });

  // Left stick forward zooms in.
  const scale0 = await page.evaluate(() => window.__gevXR.stage.root.scale.x);
  await page.evaluate(() =>
    window.IWER_DEVICE.controllers.left.updateAxes('thumbstick', 0, -1),
  );
  await sleep(700);
  await page.evaluate(() =>
    window.IWER_DEVICE.controllers.left.updateAxes('thumbstick', 0, 0),
  );
  const scale1 = await page.evaluate(() => window.__gevXR.stage.root.scale.x);
  check(
    'left stick zooms',
    scale1 > scale0 * 1.2,
    `${scale0.toFixed(2)} → ${scale1.toFixed(2)}`,
  );

  // Left X hides aircraft, pressing again shows them.
  const press = (hand, id) =>
    page.evaluate(
      async (hand, id) => {
        const c = window.IWER_DEVICE.controllers[hand];
        c.updateButtonValue(id, 1);
        await new Promise((r) => setTimeout(r, 150));
        c.updateButtonValue(id, 0);
        await new Promise((r) => setTimeout(r, 150));
      },
      hand,
      id,
    );
  await press('left', 'x-button');
  // Zoomed in this far the controller sits inside the globe; the proxy is
  // double-sided so grabbing must still work from there.
  const insideBefore = await rootPos();
  await page.evaluate(() =>
    window.IWER_DEVICE.controllers.right.updateButtonValue('trigger', 1),
  );
  await sleep(300);
  await drag('right', 'y', 0.1);
  await page.evaluate(() =>
    window.IWER_DEVICE.controllers.right.updateButtonValue('trigger', 0),
  );
  await sleep(200);
  const insideAfter = await rootPos();
  check(
    'grab still works from inside a zoomed globe',
    Math.hypot(...insideAfter.map((v, i) => v - insideBefore[i])) > 0.05,
  );

  const hidden = await page.evaluate(() => !window.__gevXR.flights.visible);
  await press('left', 'x-button');
  const shown = await page.evaluate(() => window.__gevXR.flights.visible);
  check('left X toggles aircraft', hidden && shown);

  // Aim the right controller at an aircraft: its card should open.
  const aimed = await page.evaluate(async () => {
    const { flights, state, card } = window.__gevXR;
    const c = window.IWER_DEVICE.controllers.right;
    const handle = window.transformHandles.get('right');
    const id = flights.ids()[0];
    const target = flights.locate(id);
    if (!target) return { ok: false, reason: 'no aircraft position' };
    // Rotate the controller's -Z (its pointing ray) onto the target direction.
    // The DevUI camera rig starts unrotated, so world and rig directions match.
    const d = [
      target.x - c.position.x,
      target.y - c.position.y,
      target.z - c.position.z,
    ];
    const len = Math.hypot(...d);
    const b = d.map((v) => v / len);
    // q = normalize([a × b, 1 + a·b]) with a = (0, 0, -1).
    let q = [b[1], -b[0], 0, 1 - b[2]];
    const n = Math.hypot(...q);
    q = q.map((v) => v / n);
    handle.quaternion.set(q[0], q[1], q[2], q[3]);
    await new Promise((r) => setTimeout(r, 800));
    return { ok: state.selected?.id === id, card: card.object.visible, id };
  });
  check(
    'aiming at an aircraft opens its card',
    aimed.ok && aimed.card,
    aimed.reason ?? `aircraft ${aimed.id}`,
  );
  await page.screenshot({ path: join(OUT, '2-aircraft-card.png') });

  // Hands: switch the emulator to hand tracking and pinch-grab.
  await page.evaluate(() => {
    window.transformHandles.get('right').quaternion.set(0, 0, 0, 1);
    window.__gevXR.stage.setView(window.__gevXR.state);
    window.IWER_DEVICE.primaryInputMode = 'hand';
  });
  // Wait until the hand's ray is actually on the model before pinching.
  await page.waitForFunction(
    () => {
      const mp = window.__gevXR.world.input.xr.multiPointers.right;
      return (
        window.__gevXR.world.input.xr.isPrimary('hand', 'right') &&
        mp.pointerStates.get('ray') === 'hover'
      );
    },
    { timeout: 10000 },
  );
  const handsOn = await page.evaluate(() =>
    Boolean(window.__gevXR.world.input.xr.isPrimary('hand', 'right')),
  );
  check('emulator switched to hand tracking', handsOn);
  const beforeHand = await rootPos();
  await page.evaluate(() => window.IWER_DEVICE.hands.right.updatePinchValue(1));
  await sleep(400);
  await drag('right', 'y', 0.2);
  await page.evaluate(() => window.IWER_DEVICE.hands.right.updatePinchValue(0));
  await sleep(300);
  const afterHand = await rootPos();
  const handMoved = Math.hypot(...afterHand.map((v, i) => v - beforeHand[i]));
  check(
    'hand pinch grab moves the globe',
    handMoved > 0.05,
    `moved ${handMoved.toFixed(3)} m`,
  );
  await page.screenshot({ path: join(OUT, '3-hands.png') });
} catch (error) {
  check('script', false, error.message);
}
await browser.close();
if (errors.length) console.log('Page errors:\n  ' + errors.join('\n  '));
console.log(`Screenshots: ${OUT}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
