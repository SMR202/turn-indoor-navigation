import { describe, expect, it } from 'vitest';
import { lightMap } from '@turn/design';
import { buildScene } from '@turn/map-scene';
import { demoCentre } from '@turn/venue-model';
import {
  landingOnFloor,
  planJourney,
  positionOnJourney,
  watchRoute,
} from './journey';

const scenes = Object.fromEntries(
  demoCentre.floors.map((f) => [f.id, buildScene(demoCentre, f.id, lightMap)]),
);
const node = (poi: string) => demoCentre.pois.find((p) => p.id === poi)!.nodeId;

describe('multi-floor journeys', () => {
  it('splits a route into floors with a stairs step, or a lift when step-free', () => {
    const j = planJourney(
      demoCentre,
      'entrance',
      node('poi-l1-cinema'),
      { stepFree: false },
      scenes,
      'Harbour Cinema',
    )!;
    expect(j.legs.map((l) => l.floorId)).toEqual(['ground', 'level-1']);
    expect(j.steps.find((s) => s.kind === 'level-up')!.text).toBe(
      'Take the stairs up to Level 1',
    );
    expect(j.steps.at(-1)!.text).toBe('Arrive at Harbour Cinema');
    expect(j.distanceMetres).toBeGreaterThan(j.length);
    const lift = planJourney(
      demoCentre,
      'entrance',
      node('poi-l1-cinema'),
      { stepFree: true },
      scenes,
      'Harbour Cinema',
    )!;
    expect(lift.steps.find((s) => s.kind === 'level-up')!.text).toBe(
      'Take the lift up to Level 1',
    );
  });
  it('locates a walker on the right floor along the journey', () => {
    const j = planJourney(
      demoCentre,
      'entrance',
      node('poi-l1-cinema'),
      { stepFree: false },
      scenes,
      'Harbour Cinema',
    )!;
    expect(positionOnJourney(j, 1).floorId).toBe('ground');
    expect(positionOnJourney(j, j.legs[1]!.offset + 1).floorId).toBe('level-1');
    const end = positionOnJourney(j, j.length);
    expect(end.floorId).toBe('level-1');
    const steps = j.steps.reduce((s, x) => s + x.distance, 0);
    expect(steps).toBeCloseTo(j.length, 5);
  });
  it('keeps single-floor routes unchanged', () => {
    const j = planJourney(
      demoCentre,
      'entrance',
      node('poi-cafe'),
      { stepFree: false },
      scenes,
      'Harbour Café',
    )!;
    expect(j.legs).toHaveLength(1);
    expect(j.steps.map((s) => s.kind)).toEqual(['depart', 'left', 'arrive']);
  });
});

describe('watching a live walk', () => {
  // A 20 m corridor east, then a left turn north for 10 m.
  const leg = {
    floorId: 'g',
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
    ],
    offset: 0,
    length: 30,
  };
  const steps = [
    { kind: 'depart', along: 0 },
    { kind: 'left', along: 20 },
    { kind: 'arrive', along: 30 },
  ] as Parameters<typeof watchRoute>[0]['steps'];
  const watch = (x: number, y: number, walked: number, sigma = 1.5) =>
    watchRoute({ leg, here: { x, y }, sigma, walked, steps });

  it('stays on the route within the position uncertainty', () => {
    const w = watch(10, 2, 9);
    expect(w).toMatchObject({ offLine: false, behind: false });
    expect(w.along).toBeCloseTo(10);
  });
  it('is off the line further away, and more tolerant when unsure', () => {
    expect(watch(10, 6, 10).offLine).toBe(true);
    expect(watch(10, 6, 10, 4).offLine).toBe(false);
  });
  it('knows the walker carried straight on past the turn', () => {
    const w = watch(27, 0, 19.5);
    expect(w.offLine).toBe(true);
    expect(w.missedTurn).toBe(true);
    expect(watch(10, 8, 10).missedTurn).toBe(false);
  });
  it('notices walking back towards the start', () => {
    expect(watch(12, 0, 19).behind).toBe(true);
    expect(watch(17, 0, 19).behind).toBe(false);
  });
});

describe('landing on another floor', () => {
  it('comes out at the far end of the nearest stairs or lift', () => {
    const connector = demoCentre.connectors[0]!;
    const ends = connector.nodeIds.map((id) =>
      demoCentre.nodes.find((n) => n.id === id)!,
    );
    const below = ends.find((n) => n.floorId === 'ground')!;
    const above = ends.find((n) => n.floorId === 'level-1')!;
    const land = landingOnFloor(demoCentre, 'ground', 'level-1', {
      x: below.x + 1,
      y: below.y,
    })!;
    expect(land.nodeId).toBe(above.id);
    expect(land.connectorKind).toBe(connector.kind);
  });
  it('falls back to the nearest walkable point when no connector joins the floors', () => {
    const cut = { ...demoCentre, connectors: [] };
    const land = landingOnFloor(cut, 'ground', 'level-1', { x: 30, y: 18 })!;
    const n = demoCentre.nodes.find((x) => x.id === land.nodeId)!;
    expect(n.floorId).toBe('level-1');
    expect(land.connectorKind).toBeNull();
  });
});
