import { describe, expect, it } from 'vitest';
import { AssistFusion, pooledReferences } from './assist-fusion';
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

it('pulls scattered hand calibrations of one beacon model towards their median', () => {
  const at = (ref: number, i: number): BeaconPlacement => ({
    tag: 'B' + i,
    floorId: 'f',
    x: i,
    y: 0,
    referenceRssi: ref,
  });
  const pooled = pooledReferences([-58, -62, -67, -79].map(at), 0.5, 4);
  // Median -64.5: each reference moves half way towards it.
  expect(pooled.map((b) => b.referenceRssi)).toEqual([
    -61.25, -63.25, -65.75, -71.75,
  ]);
  // Too few calibrated beacons to know the model's typical value: unchanged.
  expect(
    pooledReferences([-58, -79].map(at), 0.5, 4).map((b) => b.referenceRssi),
  ).toEqual([-58, -79]);
});

describe('nearest beacon zone (synthetic mechanics, not venue accuracy)', () => {
  // Two 10 x 10 m rooms; the wall at x = 10 has a door at y 4-6.
  const rooms: FusionMap = {
    floorId: 'f',
    walkable: [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 10, y: 10 },
      ],
    ],
    walls: [
      { from: { x: 0, y: 0 }, to: { x: 20, y: 0 } },
      { from: { x: 20, y: 0 }, to: { x: 20, y: 10 } },
      { from: { x: 20, y: 10 }, to: { x: 0, y: 10 } },
      { from: { x: 0, y: 10 }, to: { x: 0, y: 0 } },
      { from: { x: 10, y: 0 }, to: { x: 10, y: 4 } },
      { from: { x: 10, y: 6 }, to: { x: 10, y: 10 } },
    ],
  };
  const beacons: BeaconPlacement[] = [
    { tag: 'A1', floorId: 'f', x: 3, y: 8, referenceRssi: -62 },
    { tag: 'A2', floorId: 'f', x: 6, y: 2, referenceRssi: -62 },
    { tag: 'B1', floorId: 'f', x: 17, y: 3, referenceRssi: -62 },
    { tag: 'B2', floorId: 'f', x: 14, y: 8, referenceRssi: -62 },
  ];
  /** One reading per beacon per second (iPhone ranging), 6 dB per wall, ±3 dB noise. */
  function standAt(
    a: AssistFusion,
    p: { x: number; y: number },
    from: number,
    seconds: number,
    set = beacons,
    extraDb: (tag: string) => number = () => 0,
  ) {
    for (let s = 0; s < seconds; s++) {
      const t = from + s;
      for (const b of set) {
        const walls = rooms.walls.filter((w) => {
          const d = (
            u: { x: number; y: number },
            v: { x: number; y: number },
            q: { x: number; y: number },
          ) => (v.x - u.x) * (q.y - u.y) - (v.y - u.y) * (q.x - u.x);
          return (
            d(w.from, w.to, p) * d(w.from, w.to, b) < 0 &&
            d(p, b, w.from) * d(p, b, w.to) < 0
          );
        }).length;
        const noise = (((s * 7 + b.x * 13) % 7) - 3) * 1;
        a.addSample(
          t,
          b.tag,
          predictRssi(
            { refRssi: b.referenceRssi!, exponent: 2.3 },
            Math.hypot(p.x - b.x, p.y - b.y),
          ) -
            6 * walls +
            noise +
            extraDb(b.tag),
        );
      }
      a.tick(t);
    }
  }
  const live = { windowSeconds: 4, minPackets: 2 };

  it('moves a standing walker into the room of the beacon they stand next to', () => {
    const a = new AssistFusion(rooms, beacons, live, 4);
    a.setPosition(4, 5, 1); // wrong: actually beside B1 in the other room
    standAt(a, { x: 16.4, y: 3.4 }, 0, 12);
    const e = a.estimate()!;
    expect(e.x).toBeGreaterThan(10.2); // the right room
    expect(Math.hypot(e.x - 17, e.y - 3)).toBeLessThan(4);
  });
  it('ranks beacons by distance, not loudness: a quiet beacon nearby beats a loud one through a wall', () => {
    const mixed: BeaconPlacement[] = [
      { tag: 'A1', floorId: 'f', x: 3, y: 8, referenceRssi: -70 },
      { tag: 'B1', floorId: 'f', x: 12, y: 8, referenceRssi: -46 },
    ];
    const a = new AssistFusion(rooms, mixed, live, 4);
    a.setPosition(15, 5, 1); // wrong room
    // 2 m from the quiet A1; the loud B1 is heard about 5 dB louder through the wall.
    standAt(a, { x: 5, y: 8 }, 0, 12, mixed);
    expect(a.estimate()!.x).toBeLessThan(9.8);
  });
  it('does not hop rooms when another beacon briefly reads strong', () => {
    const a = new AssistFusion(rooms, beacons, live, 4);
    a.setPosition(4, 6, 1);
    const spot = { x: 3.6, y: 7.4 }; // beside A1
    standAt(a, spot, 0, 8);
    // 4 s in which B2, in the other room, reads 40 dB stronger (a reflection, a door opening).
    standAt(a, spot, 8, 4, beacons, (tag) => (tag === 'B2' ? 40 : 0));
    standAt(a, spot, 12, 4);
    expect(a.estimate()!.x).toBeLessThan(9.8);
  });
  it('stays put between beacons when none is clearly nearest', () => {
    const a = new AssistFusion(rooms, beacons, live, 4);
    a.setPosition(10.5, 5, 1);
    const before = a.estimate()!;
    // In the doorway, about equally far from the beacons of both rooms.
    standAt(a, { x: 10.5, y: 5 }, 0, 20);
    const e = a.estimate()!;
    expect(Math.hypot(e.x - before.x, e.y - before.y)).toBeLessThan(1);
  });
});
