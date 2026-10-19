import { describe, expect, it } from 'vitest';
import { lightMap } from '@turn/design';
import { buildScene } from '@turn/map-scene';
import { demoCentre } from '@turn/venue-model';
import { planJourney, positionOnJourney } from './journey';

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
