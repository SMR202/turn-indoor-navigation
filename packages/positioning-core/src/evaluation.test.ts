import { it, expect } from 'vitest';
import { evaluateWalk } from './evaluation';
import { NavigationEngine } from './index';
import { sampleVenue } from '@turn/venue-model';
it('separates walked distance error from endpoint error', () => {
  const engine = new NavigationEngine(sampleVenue, 'test', 0.7);
  const snapshot = engine.consume({
    schemaVersion: 1,
    sessionId: 'test',
    source: 'test',
    timestampSeconds: 0,
    type: 'anchor',
    venueId: sampleVenue.venueId,
    venueRevision: sampleVenue.revision,
    anchorId: 'entry-qr',
  });
  snapshot.distanceMetres = 5.5;
  snapshot.steps = 10;
  snapshot.pose!.position = { x: 3.3, y: 15.4 };
  const value = evaluateWalk(snapshot, [
    { x: 3, y: 10 },
    { x: 3, y: 15 },
  ]);
  expect(value.endpointErrorMetres).toBeCloseTo(0.5);
  expect(value.distanceErrorPercent).toBeCloseTo(10);
  expect(value.interrupted).toBe(false);
  snapshot.stopped = true;
  expect(
    evaluateWalk(snapshot, [
      { x: 3, y: 10 },
      { x: 3, y: 15 },
    ]).interrupted,
  ).toBe(true);
});
