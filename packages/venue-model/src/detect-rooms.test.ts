import { describe, expect, it } from 'vitest';
import {
  detectRooms,
  inkFromRgba,
  tidyOutline,
  type Bitmap,
} from './detect-rooms';

/** A blank sheet to draw wall lines on. */
function sheet(width: number, height: number) {
  const ink = new Uint8Array(width * height);
  const bitmap: Bitmap = { width, height, ink };
  const fill = (x0: number, y0: number, x1: number, y1: number, v: 0 | 1) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) ink[y * width + x] = v;
  };
  return {
    bitmap,
    /** A horizontal wall three pixels thick. */
    h: (x0: number, x1: number, y: number) => fill(x0, y - 1, x1, y + 1, 1),
    v: (x: number, y0: number, y1: number) => fill(x - 1, y0, x + 1, y1, 1),
    /** A door opening: clears the wall there. */
    gap: (x0: number, y0: number, x1: number, y1: number) =>
      fill(x0, y0, x1, y1, 0),
  };
}

/**
 * Three rooms along the top, a corridor below, a door from each room to the corridor and one
 * entrance from outside.
 */
function plan() {
  const s = sheet(200, 120);
  s.h(10, 190, 10);
  s.h(10, 190, 110);
  s.v(10, 10, 110);
  s.v(190, 10, 110);
  s.h(10, 190, 60);
  s.v(70, 10, 60);
  s.v(130, 10, 60);
  s.gap(40, 58, 50, 62);
  s.gap(100, 58, 110, 62);
  s.gap(160, 58, 170, 62);
  s.gap(95, 108, 105, 112); // entrance
  return s.bitmap;
}
const bbox = (poly: { x: number; y: number }[]) => ({
  x0: Math.min(...poly.map((p) => p.x)),
  y0: Math.min(...poly.map((p) => p.y)),
  x1: Math.max(...poly.map((p) => p.x)),
  y1: Math.max(...poly.map((p) => p.y)),
});

describe('room detection (synthetic plans)', () => {
  it('finds the rooms and the corridor, and leaves the outside out', () => {
    const { rooms } = detectRooms(plan(), { closeRadius: 6, minArea: 200 });
    expect(rooms).toHaveLength(4);
    const corridor = rooms.filter((r) => r.circulation);
    expect(corridor).toHaveLength(1);
    const c = bbox(corridor[0]!.polygon);
    // The corridor fills the lower half between the walls, to within a few pixels.
    expect(c.x0).toBeLessThan(16);
    expect(c.x1).toBeGreaterThan(184);
    expect(c.y0).toBeGreaterThan(56);
    expect(c.y0).toBeLessThan(66);
    expect(c.y1).toBeGreaterThan(104);
    // The three rooms sit side by side above it, each about 57 x 47 pixels.
    const tops = rooms
      .filter((r) => !r.circulation)
      .map((r) => bbox(r.polygon))
      .sort((a, b) => a.x0 - b.x0);
    expect(tops).toHaveLength(3);
    for (const t of tops) {
      expect(t.x1 - t.x0).toBeGreaterThan(50);
      expect(t.x1 - t.x0).toBeLessThan(62);
      expect(t.y1).toBeLessThan(64);
    }
    expect(tops[0]!.x1).toBeLessThan(tops[1]!.x0 + 6);
    // Simple rooms come out as simple shapes.
    for (const r of rooms) expect(r.polygon.length).toBeLessThanOrEqual(8);
  });

  it('finds a door at each opening, between the right rooms', () => {
    const { rooms, doors } = detectRooms(plan(), {
      closeRadius: 6,
      minArea: 200,
    });
    const corridor = rooms.findIndex((r) => r.circulation);
    const inner = doors.filter((d) => d.between.length === 2);
    expect(inner).toHaveLength(3);
    for (const d of inner) {
      expect(d.between).toContain(corridor);
      expect(Math.abs(d.y - 60)).toBeLessThan(4);
    }
    // Openings are centred at x = 45, 105 and 165.
    const xs = inner.map((d) => d.x).sort((a, b) => a - b);
    [45, 105, 165].forEach((x, i) =>
      expect(Math.abs(xs[i]! - x)).toBeLessThan(4),
    );
    // The entrance is a door with only one room behind it.
    const outside = doors.filter((d) => d.between.length === 1);
    expect(outside).toHaveLength(1);
    expect(outside[0]!.between).toEqual([corridor]);
    expect(Math.abs(outside[0]!.x - 100)).toBeLessThan(4);
  });

  it('merges rooms when the walls are not thickened enough to close the doors', () => {
    const { rooms } = detectRooms(plan(), { closeRadius: 2, minArea: 200 });
    // Honest failure mode: one big area instead of four. The radius must match the door width.
    expect(rooms.length).toBeLessThan(4);
  });

  it('ignores specks and text-sized areas', () => {
    const s = sheet(120, 80);
    s.h(10, 110, 10);
    s.h(10, 110, 70);
    s.v(10, 10, 70);
    s.v(110, 10, 70);
    // A small closed box, like a letter or a column.
    s.h(40, 52, 30);
    s.h(40, 52, 42);
    s.v(40, 30, 42);
    s.v(52, 30, 42);
    const { rooms } = detectRooms(s.bitmap, { closeRadius: 3, minArea: 300 });
    expect(rooms).toHaveLength(1);
  });
});

describe('plan pictures', () => {
  it('treats dark pixels as ink and transparent ones as blank', () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255, 90, 90, 90, 255, 0, 0, 0, 0,
    ]);
    expect([...inkFromRgba(rgba, 4, 1).ink]).toEqual([1, 0, 1, 0]);
  });
  it('straightens a jagged outline into a rectangle', () => {
    const jagged = [
      { x: 0, y: 0 },
      { x: 20, y: 1 },
      { x: 40, y: 0 },
      { x: 41, y: 15 },
      { x: 40, y: 30 },
      { x: 20, y: 31 },
      { x: 0, y: 30 },
      { x: 1, y: 15 },
    ];
    const tidy = tidyOutline(jagged, 2.5);
    expect(tidy).toHaveLength(4);
    for (const p of tidy) {
      expect([0, 40, 41, 1]).toContain(p.x);
    }
  });
});
