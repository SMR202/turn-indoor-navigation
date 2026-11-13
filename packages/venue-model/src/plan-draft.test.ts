import { describe, expect, it } from 'vitest';
import { demoCentre } from './demo-centre';
import { importFloorGeoJson } from './geojson-import';
import {
  checkDraft,
  draftToGeoJson,
  emptyDraft,
  floorToDraft,
  nearestEdge,
  snapPoint,
  type PlanDraft,
} from './plan-draft';

// 20 units per metre: a 6 x 4 m office above a 12 x 3 m corridor, a door between them.
const draft = (): PlanDraft => ({
  ...emptyDraft(400, 300, 0.05),
  scaled: true,
  rooms: [
    {
      id: 'office',
      name: 'Office',
      kind: 'room',
      points: [
        { x: 40, y: 40 },
        { x: 160, y: 40 },
        { x: 160, y: 120 },
        { x: 40, y: 120 },
      ],
    },
    {
      id: 'corridor',
      name: 'Corridor',
      kind: 'circulation',
      points: [
        { x: 40, y: 120 },
        { x: 280, y: 120 },
        { x: 280, y: 180 },
        { x: 40, y: 180 },
      ],
    },
  ],
  doors: [{ id: 'd1', x: 100, y: 120 }],
});

describe('snapping while drawing', () => {
  it('lands on a nearby corner, then on an edge, then in line with the last point', () => {
    const d = draft();
    expect(snapPoint({ x: 163, y: 43 }, d, 6)).toEqual({
      point: { x: 160, y: 40 },
      to: 'corner',
    });
    const edge = snapPoint({ x: 100, y: 37 }, d, 6);
    expect(edge.to).toBe('edge');
    expect(edge.point).toEqual({ x: 100, y: 40 });
    expect(
      snapPoint({ x: 300, y: 251 }, d, 6, { anchor: { x: 200, y: 250 } }),
    ).toEqual({ point: { x: 300, y: 250 }, to: 'axis' });
    expect(snapPoint({ x: 300, y: 290 }, d, 6).to).toBeNull();
  });
  it('ignores the room being reshaped', () => {
    const s = snapPoint({ x: 41, y: 41 }, draft(), 6, { skipRoom: 'office' });
    expect(s.to).toBeNull();
  });
  it('finds the wall a door belongs on', () => {
    const e = nearestEdge({ x: 220, y: 126 }, draft())!;
    expect(e.roomId).toBe('corridor');
    expect(e.point).toEqual({ x: 220, y: 120 });
  });
});

describe('checks while drawing', () => {
  it('is quiet for a sound floor', () => {
    const c = checkDraft(draft());
    expect(c.errors).toEqual([]);
    expect(c.warnings).toEqual([]);
  });
  it('names rooms without doors, stray doors, a missing scale and missing names', () => {
    const d = draft();
    d.scaled = false;
    d.doors = [{ id: 'd1', x: 300, y: 20 }];
    d.rooms[0]!.name = '';
    const c = checkDraft(d);
    expect(c.roomsWithoutDoor.sort()).toEqual(['corridor', 'office']);
    expect(c.strayDoors).toEqual(['d1']);
    expect(c.warnings.join(' ')).toMatch(/scale is not set/);
    expect(c.warnings.join(' ')).toMatch(/no name/);
    expect(checkDraft(emptyDraft()).errors).toEqual([
      'Draw at least one room.',
    ]);
  });
});

describe('from draft to floor and back', () => {
  it('builds a routable floor in metres with y up', () => {
    const { venue, report } = importFloorGeoJson(draftToGeoJson(draft()), {
      venueId: 'drawn',
      name: 'Drawn',
    });
    expect(report.rooms).toBe(2);
    expect(report.doors).toBe(1);
    expect(report.unreachablePlaces).toEqual([]);
    const office = venue.floors[0]!.rooms.find((r) => r.id === 'office')!;
    // 40..160 units wide is 2..8 m; the sheet is 300 units (15 m) tall and y flips.
    expect(Math.min(...office.polygon.map((p) => p.x))).toBeCloseTo(2);
    expect(Math.max(...office.polygon.map((p) => p.x))).toBeCloseTo(8);
    expect(Math.max(...office.polygon.map((p) => p.y))).toBeCloseTo(13);
    expect(venue.pois.map((p) => p.name)).toEqual(['Office']);
  });
  it('turns an existing floor into a draft that rebuilds to the same rooms', () => {
    const { draft: d } = floorToDraft(demoCentre, 'ground')!;
    const floor = demoCentre.floors.find((f) => f.id === 'ground')!;
    expect(d.rooms.map((r) => r.id)).toEqual(floor.rooms.map((r) => r.id));
    expect(d.doors).toHaveLength(floor.doors.length);
    expect(d.scaled).toBe(true);
    const { venue } = importFloorGeoJson(draftToGeoJson(d), {
      venueId: 'again',
      name: 'Again',
    });
    const cafe = venue.floors[0]!.rooms.find((r) => r.id === 'cafe')!;
    const original = floor.rooms.find((r) => r.id === 'cafe')!;
    cafe.polygon.forEach((p, i) => {
      expect(p.x).toBeCloseTo(original.polygon[i]!.x, 1);
      expect(p.y).toBeCloseTo(original.polygon[i]!.y, 1);
    });
    expect(floorToDraft(demoCentre, 'nowhere')).toBeNull();
  });
});
