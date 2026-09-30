import assert from 'node:assert/strict';
import test from 'node:test';
import { Ray, Vector3 } from 'three';
import { nearestToRay } from './picking.js';

const forward = () => new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));

test('picks the marker closest to the ray within tolerance', () => {
  const points = [
    new Vector3(0.02, 0, -1),
    new Vector3(0.005, 0, -1),
    new Vector3(0.5, 0, -1),
  ];
  assert.equal(nearestToRay(forward(), points, 0.03), 1);
});

test('ignores markers outside tolerance or behind the ray', () => {
  assert.equal(nearestToRay(forward(), [new Vector3(0.1, 0, -1)], 0.03), -1);
  assert.equal(nearestToRay(forward(), [new Vector3(0, 0, 1)], 0.03), -1);
  assert.equal(nearestToRay(forward(), [], 0.03), -1);
});

test('prefers the nearer of two equally aligned markers', () => {
  const points = [new Vector3(0, 0, -3), new Vector3(0, 0, -1)];
  assert.equal(nearestToRay(forward(), points, 0.03), 1);
});
