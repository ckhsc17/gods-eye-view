/**
 * A floating aircraft card, visible both in the headset and on the page.
 *
 * Text is drawn to a canvas and shown on a plane that always faces the
 * viewer, with a leader line down to the aircraft. It lives in the scene, not
 * in the stage, so it keeps a readable real-world size whatever the model's
 * scale.
 */
import {
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { aircraftRows, aircraftTitle } from './aircraftInfo.js';

const WIDTH_PX = 512;
const HEIGHT_PX = 320;
const WIDTH_M = 0.24;
/** The card floats this far above the aircraft, in scene metres. */
const LIFT_M = 0.12;

export function createInfoCard() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH_PX;
  canvas.height = HEIGHT_PX;
  const ctx = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const panel = new Mesh(
    new PlaneGeometry(WIDTH_M, (WIDTH_M * HEIGHT_PX) / WIDTH_PX),
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  panel.renderOrder = 10;
  const leaderGeometry = new BufferGeometry().setFromPoints([
    new Vector3(),
    new Vector3(),
  ]);
  const leader = new Line(
    leaderGeometry,
    new LineBasicMaterial({ color: 0xffd60a, depthTest: false }),
  );
  leader.renderOrder = 10;

  const group = new Group();
  group.name = 'aircraft-card';
  group.add(panel, leader);
  group.visible = false;
  // Never intercept controller rays.
  panel.raycast = () => {};
  leader.raycast = () => {};

  const cameraPos = new Vector3();

  function draw(record, nowMs) {
    ctx.clearRect(0, 0, WIDTH_PX, HEIGHT_PX);
    ctx.fillStyle = 'rgba(8, 14, 22, 0.9)';
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(2, 2, WIDTH_PX - 4, HEIGHT_PX - 4, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd60a';
    ctx.font = 'bold 44px ui-monospace, Menlo, monospace';
    ctx.fillText(aircraftTitle(record), 26, 62);
    ctx.font = '26px ui-monospace, Menlo, monospace';
    let y = 108;
    for (const [label, value] of aircraftRows(record, nowMs).slice(0, 7)) {
      ctx.fillStyle = '#8aa0b0';
      ctx.fillText(label, 26, y);
      ctx.fillStyle = '#e6f1f7';
      ctx.fillText(value, 190, y);
      y += 32;
    }
    texture.needsUpdate = true;
  }

  let lastDrawn = 0;
  let lastId = null;

  return {
    object: group,
    hide() {
      group.visible = false;
      lastId = null;
    },
    /**
     * Show `record` above world-space `anchor`, facing `camera`. Redraws the
     * text when the aircraft changes and once a second for the fix age.
     */
    show(record, anchor, camera, nowMs = Date.now()) {
      if (record.id !== lastId || nowMs - lastDrawn > 1000) {
        draw(record, nowMs);
        lastDrawn = nowMs;
        lastId = record.id;
      }
      group.visible = true;
      panel.position.copy(anchor).y += LIFT_M;
      camera.getWorldPosition(cameraPos);
      panel.lookAt(cameraPos);
      const points = leaderGeometry.attributes.position;
      points.setXYZ(0, anchor.x, anchor.y, anchor.z);
      points.setXYZ(
        1,
        panel.position.x,
        panel.position.y - 0.06,
        panel.position.z,
      );
      points.needsUpdate = true;
      leaderGeometry.computeBoundingSphere();
    },
  };
}
