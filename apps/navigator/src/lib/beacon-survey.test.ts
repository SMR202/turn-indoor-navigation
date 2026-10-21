import { describe, expect, it } from 'vitest';
import {
  fitSurvey,
  spotResult,
  STAND_OFF_METRES,
  type SurveySpot,
} from './beacon-survey';

const beacons = [
  { tag: 'B1', x: 0, y: 0, a: -60 },
  { tag: 'B2', x: 6, y: 0, a: -66 },
  { tag: 'B3', x: 0, y: 8, a: -72 },
  { tag: 'B4', x: 7, y: 9, a: -63 },
];

/** Synthetic survey from a known model (n = 2.8) with a little noise. */
function survey(n = 2.8): SurveySpot[] {
  return beacons.map((at, i) => ({
    tag: at.tag,
    at: '2026-10-21T00:00:00.000Z',
    seconds: 10,
    readings: Object.fromEntries(
      beacons.map((b, j) => {
        const d =
          b.tag === at.tag
            ? STAND_OFF_METRES
            : Math.hypot(b.x - at.x, b.y - at.y);
        const noise = (((i * 5 + j * 3) % 5) - 2) * 0.8;
        return [
          b.tag,
          { median: b.a - 10 * n * Math.log10(d) + noise, count: 10 },
        ];
      }),
    ),
  }));
}

describe('beacon survey (synthetic)', () => {
  it('recovers the building exponent and each beacon level', () => {
    const fit = fitSurvey(survey(), beacons)!;
    expect(fit.exponent).toBeGreaterThan(2.5);
    expect(fit.exponent).toBeLessThan(3.1);
    for (const b of beacons)
      expect(Math.abs(fit.references[b.tag]! - b.a)).toBeLessThan(2.5);
    expect(fit.rmsDb).toBeLessThan(2);
  });
  it('needs three spots', () => {
    expect(fitSurvey(survey().slice(0, 2), beacons)).toBeNull();
  });
  it('tells whether each beacon is the strongest at its own spot', () => {
    const spot = survey()[0]!;
    expect(spotResult(spot)).toMatchObject({ tag: 'B1', pass: true });
    // A weak beacon (or one mounted elsewhere) loses to a neighbour at its own spot.
    const weak = {
      ...spot,
      readings: { ...spot.readings, B1: { median: -90, count: 4 } },
    };
    const r = spotResult(weak);
    expect(r.pass).toBe(false);
    expect(r.strongest).not.toBe('B1');
    expect(spotResult({ ...spot, readings: {} }).own).toBeNull();
  });
});
