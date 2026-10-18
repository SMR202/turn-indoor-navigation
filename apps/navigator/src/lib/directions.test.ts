import { describe, expect, it } from 'vitest';
import { lightMap } from '@turn/design';
import { buildScene, polylineLength } from '@turn/map-scene';
import { calculateRoute } from '@turn/routing';
import { demoCentre } from '@turn/venue-model';
import {
  buildSteps,
  cleanPolyline,
  formatDistance,
  formatDuration,
} from './directions';

const scene = buildScene(demoCentre, demoCentre.floors[0]!.id, lightMap);
const poi = (id: string) => demoCentre.pois.find((p) => p.id === id)!;

describe('directions', () => {
  it('turns a routed path into named turn-by-turn steps', () => {
    const entrance = demoCentre.pois.find((p) => /entrance/i.test(p.name))!;
    const result = calculateRoute(
      demoCentre,
      entrance.nodeId,
      poi('poi-cafe').nodeId,
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const points = result.route.geometry.map(({ x, y }) => ({ x, y }));
    const steps = buildSteps(points, scene, 'Harbour Café');
    expect(steps[0]!.kind).toBe('depart');
    expect(steps.at(-1)!.text).toBe('Arrive at Harbour Café');
    expect(steps.length).toBeGreaterThanOrEqual(3);
    const sum = steps.reduce((s, x) => s + x.distance, 0);
    expect(sum).toBeCloseTo(polylineLength(cleanPolyline(points)), 5);
    expect(
      steps.slice(1, -1).every((s) => /left|right|around/i.test(s.text)),
    ).toBe(true);
  });
  it('merges a door jog into one turn and ignores straight lines', () => {
    const steps = buildSteps(
      [
        { x: 0, y: 17 },
        { x: 10, y: 17 },
        { x: 10.3, y: 17.2 },
        { x: 20, y: 17.2 },
      ],
      scene,
      'X',
    );
    expect(steps.map((s) => s.kind)).toEqual(['depart', 'arrive']);
  });
  it('formats distances and durations', () => {
    expect(formatDistance(7.4)).toBe('7 m');
    expect(formatDistance(43)).toBe('45 m');
    expect(formatDuration(30)).toBe('<1 min');
    expect(formatDuration(130)).toBe('2 min');
  });
});
