import { describe, expect, it } from 'vitest';
import { AssistFusion } from './assist-fusion';
import { predictRssi, type FusionMap } from './fusion';
import type { BeaconPlacement } from './ble-proximity';

const map: FusionMap = {
  floorId: 'f',
  walkable: [
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ],
  ],
  walls: [],
};
const placements: BeaconPlacement[] = [
  { tag: 'B1', floorId: 'f', x: 2, y: 8, referenceRssi: -59 },
  { tag: 'B2', floorId: 'f', x: 10, y: 1, referenceRssi: -59 },
  { tag: 'B3', floorId: 'f', x: 18, y: 8, referenceRssi: -59 },
];
function feed(
  a: AssistFusion,
  x: number,
  y: number,
  from: number,
  seconds: number,
  tags = ['B1', 'B2', 'B3'],
  noise = 0,
) {
  for (let i = 0; i < seconds * 10; i++) {
    const t = from + i / 10;
    for (const p of placements.filter((b) => tags.includes(b.tag)))
      a.addSample(
        t,
        p.tag,
        predictRssi(
          { refRssi: -59, exponent: 2.3 },
          Math.hypot(x - p.x, y - p.y),
        ) +
          (noise ? ((i * 7919 + p.x * 31) % 11) - 5 : 0) * (noise / 5),
      );
    if (i % 10 === 9) a.tick(t);
  }
}

describe('AssistFusion policy', () => {
  it('does not move while the user stands still, however noisy the radio is', () => {
    const a = new AssistFusion(map, placements, {}, 3);
    a.setPosition(6, 5, 1);
    const before = a.estimate()!;
    feed(a, 6, 5, 0, 60, ['B1', 'B2', 'B3'], 8);
    const after = a.estimate()!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
      0.3,
    );
  });
  it('applies radio at most once per interval and only after walking', () => {
    const a = new AssistFusion(map, placements, { radioIntervalSeconds: 3 }, 3);
    a.setPosition(6, 5, 1);
    a.syncRaw(0, 0);
    feed(a, 6, 5, 0, 5);
    let applied = 0;
    for (let k = 0; k < 12; k++) {
      a.walk(0.3 * (k + 1), 0); // 0.3 m per update
      if (a.tick(5 + k * 0.5).radioApplied) applied++;
    }
    expect(applied).toBeLessThanOrEqual(2); // 6 s of walking, 3 s interval
  });
  it('needs two beacons before a proximity fix may move the estimate', () => {
    const a = new AssistFusion(map, placements, {}, 3);
    a.setPosition(15, 5, 1);
    const before = a.estimate()!;
    // Only B1 is heard, very strongly: not enough to snap to B1 from 14 m away.
    feed(a, 2, 8, 0, 6, ['B1']);
    const after = a.estimate()!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
      0.3,
    );
  });
  it('never claims better than the display uncertainty floor and cold-starts from radio', () => {
    const a = new AssistFusion(map, placements, {}, 3);
    feed(a, 4, 6, 0, 6);
    expect(a.locate(6)).toBe(true);
    const e = a.estimate()!;
    expect(e.displaySigmaMetres).toBeGreaterThanOrEqual(1.5);
    expect(Math.hypot(e.x - 4, e.y - 6)).toBeLessThan(5);
    expect(new AssistFusion(map, [], {}, 1).locate(1)).toBe(false);
  });
  it('refuses to apply a radio update that no position can explain', () => {
    const a = new AssistFusion(map, placements, {}, 3);
    a.setPosition(6, 5, 1);
    a.syncRaw(0, 0);
    // All three beacons read -45 dBm (louder than 1 m from any beacon): impossible everywhere.
    for (let i = 0; i < 30; i++)
      for (const p of placements) a.addSample(i / 10, p.tag, -35);
    a.walk(2, 0);
    const before = a.estimate()!;
    const r = a.tick(3);
    expect(r.radioApplied).toBe(false);
    const after = a.estimate()!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
      0.5,
    );
  });
});
