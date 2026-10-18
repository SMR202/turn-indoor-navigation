import { expect, it } from 'vitest';
import { RoomZoneClassifier } from './beacon-zones';

const rooms = [
  {
    name: 'West',
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ],
  },
  {
    name: 'East',
    polygon: [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 8 },
      { x: 10, y: 8 },
    ],
  },
];
const beacons = [
  { tag: 'B1', x: 3, y: 4 },
  { tag: 'B2', x: 17, y: 4 },
];

it('maps beacons to rooms and answers with the room of the strongest beacon', () => {
  const z = new RoomZoneClassifier(beacons, rooms);
  expect(z.roomOf('B1')).toBe('West');
  expect(z.roomOf('B2')).toBe('East');
  expect(z.roomOf('nope')).toBeNull();
  const r = z.update(0, [
    { tag: 'B1', rssi: -60 },
    { tag: 'B2', rssi: -80 },
  ]);
  expect(r).toMatchObject({ room: 'West', confidence: 'high' });
});
it('needs a margin and a hold to switch rooms, so boundaries do not flicker', () => {
  const z = new RoomZoneClassifier(beacons, rooms);
  z.update(0, [
    { tag: 'B1', rssi: -60 },
    { tag: 'B2', rssi: -80 },
  ]);
  // East only slightly louder: stays West.
  expect(
    z.update(1, [
      { tag: 'B1', rssi: -70 },
      { tag: 'B2', rssi: -69 },
    ]).room,
  ).toBe('West');
  // East clearly louder but not for long enough: still West.
  expect(
    z.update(2, [
      { tag: 'B1', rssi: -80 },
      { tag: 'B2', rssi: -62 },
    ]).room,
  ).toBe('West');
  // ... held for 2 s: switches.
  expect(
    z.update(4.1, [
      { tag: 'B1', rssi: -80 },
      { tag: 'B2', rssi: -62 },
    ]).room,
  ).toBe('East');
  // A momentary dip back does not switch.
  expect(
    z.update(5, [
      { tag: 'B1', rssi: -58 },
      { tag: 'B2', rssi: -62 },
    ]).room,
  ).toBe('East');
});
it('reports low confidence between rooms and keeps the last room when nothing is heard', () => {
  const z = new RoomZoneClassifier(beacons, rooms);
  expect(
    z.update(0, [
      { tag: 'B1', rssi: -70 },
      { tag: 'B2', rssi: -72 },
    ]).confidence,
  ).toBe('low');
  const silent = z.update(1, [{ tag: 'B1', rssi: -99 }]);
  expect(silent.room).toBe('West');
  expect(silent.confidence).toBe('low');
});
