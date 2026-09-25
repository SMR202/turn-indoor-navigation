import { describe, expect, it } from 'vitest';
import {
  feetToMetres,
  pathLength,
  segmentsCross,
  wallCrossings,
} from './geometry';
import { parseVenuePackage, sampleVenue } from './index';
describe('metric plans and test courses', () => {
  it('preserves feet, inches and half inches without early rounding', () => {
    expect(feetToMetres(10)).toBe(3.048);
    expect(feetToMetres(100)).toBeCloseTo(30.48, 10);
    expect(feetToMetres(10 + 6.5 / 12)).toBeCloseTo(3.2131, 10);
    expect(
      pathLength([
        { x: 0, y: 0 },
        { x: 0, y: 3 },
        { x: 2, y: 3 },
      ]),
    ).toBe(5);
  });
  it('finds graph edges crossing solid walls', () => {
    const v = structuredClone(sampleVenue);
    v.floors[0]!.walls.push({ from: { x: 6, y: 8 }, to: { x: 6, y: 12 } });
    expect(wallCrossings(v)).toContain('entry-junction');
    expect(
      segmentsCross(
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
        { x: 2, y: 0 },
      ),
    ).toBe(true);
  });
  it('rejects a test start that disagrees with its anchor', () => {
    expect(() =>
      parseVenuePackage({
        ...sampleVenue,
        testCourses: [
          {
            id: 'bad',
            name: 'Bad',
            anchorId: 'entry-qr',
            headingRad: 0,
            points: [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
            ],
            setup: 'Measured path',
          },
        ],
      }),
    ).toThrow(/start/);
  });
  it('rejects plan room geometry outside the floor', () => {
    const v = structuredClone(sampleVenue);
    v.floors[0]!.rooms.push({
      id: 'bad',
      name: 'Bad',
      kind: 'room',
      labelPosition: { x: 1, y: 1 },
      polygon: [
        { x: -1, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
      ],
    });
    expect(() => parseVenuePackage(v)).toThrow(/bounds/);
  });
});
