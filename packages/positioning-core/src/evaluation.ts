import { pathLength } from '@turn/venue-model';
import type { TrackingSnapshot } from './index';
export function evaluateWalk(
  snapshot: TrackingSnapshot,
  points: { x: number; y: number }[],
) {
  if (!snapshot.pose || points.length < 2)
    throw new Error('A pose and test course are required');
  const expected = points[points.length - 1]!;
  const expectedDistanceMetres = pathLength(points);
  if (expectedDistanceMetres <= 0)
    throw new Error('Test course must have positive length');
  return {
    expectedDistanceMetres,
    measuredDistanceMetres: snapshot.distanceMetres,
    steps: snapshot.steps,
    endpointErrorMetres: Math.hypot(
      snapshot.pose.position.x - expected.x,
      snapshot.pose.position.y - expected.y,
    ),
    distanceErrorPercent:
      (100 * (snapshot.distanceMetres - expectedDistanceMetres)) /
      expectedDistanceMetres,
    interrupted: snapshot.stopped,
  };
}
