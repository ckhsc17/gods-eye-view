/**
 * Ray picking against small markers.
 *
 * Aircraft cones are a centimetre across on the table, too small to hit
 * reliably with a controller ray or a mouse. Instead of testing triangles,
 * pick the marker centre closest to the ray, within a tolerance, preferring
 * the nearest one along the ray when several qualify.
 */
import { Vector3 } from 'three';

const _closest = new Vector3();

/**
 * Index of the point nearest to `ray` (a three.js Ray, world space) whose
 * perpendicular distance is at most `toleranceM`, or -1. Points behind the
 * ray origin are ignored.
 */
export function nearestToRay(ray, points, toleranceM) {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const along = _closest.copy(point).sub(ray.origin).dot(ray.direction);
    if (along <= 0) continue;
    ray.closestPointToPoint(point, _closest);
    const off = _closest.distanceTo(point);
    if (off > toleranceM) continue;
    // Mostly "closest to the ray", lightly biased toward nearer markers.
    const score = off + along * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
