import { describe, expect, it } from 'vitest';
import { entryFix, toLngLat, venueAt, type Georeference } from './geo';

const campus: Georeference = { lat: 33.656, lon: 73.0136, bearingDeg: 37 };
const entrances = [
  { id: 'main', floorId: 'g', x: 0, y: 10 },
  { id: 'back', floorId: 'g', x: 60, y: 10 },
];
/** A GPS fix at a venue position (metres), with a stated accuracy. */
const fixAt = (x: number, y: number, accuracyMetres: number) => {
  const [lon, lat] = toLngLat({ x, y }, campus);
  return { lat, lon, accuracyMetres };
};

describe('GPS as a way in', () => {
  it('starts at the nearest entrance when the fix is good and close', () => {
    const e = entryFix(fixAt(-4, 14, 8), campus, entrances)!;
    expect(e.id).toBe('main');
    expect(e.distanceMetres).toBeCloseTo(Math.hypot(4, 4), 1);
    expect(e.sigmaMetres).toBe(8);
    expect(entryFix(fixAt(58, 6, 5), campus, entrances)!.id).toBe('back');
  });
  it('never claims better than a doorway, nor worse than ten metres', () => {
    expect(entryFix(fixAt(0, 10, 1), campus, entrances)!.sigmaMetres).toBe(3);
    expect(entryFix(fixAt(0, 10, 22), campus, entrances)!.sigmaMetres).toBe(10);
  });
  it('refuses a vague fix (GPS indoors) and a fix nowhere near a door', () => {
    expect(entryFix(fixAt(0, 10, 60), campus, entrances)).toBeNull();
    expect(entryFix(fixAt(-80, 10, 6), campus, entrances)).toBeNull();
    expect(entryFix(fixAt(0, 10, 5), campus, [])).toBeNull();
  });
  it('finds the venue the walker has arrived at', () => {
    const far: Georeference = { lat: 33.7, lon: 73.1, bearingDeg: 0 };
    const venues = [
      { id: 'a', georeference: campus, radiusMetres: 80 },
      { id: 'b', georeference: far, radiusMetres: 80 },
    ];
    expect(venueAt(fixAt(40, 30, 10), venues)!.id).toBe('a');
    expect(venueAt(fixAt(400, 300, 10), venues)).toBeNull();
  });
});
