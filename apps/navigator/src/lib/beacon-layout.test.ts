import { expect, it } from 'vitest';
import {
  adoptionTag,
  describe as describeDevice,
  mergeLayout,
  MODEL_RSSI_AT_1M,
  placementsFor,
  roughDistance,
  type NearbyDevice,
} from './beacon-layout';

const published = [
  { tag: 'B1', floorId: 'g', x: 1, y: 1, referenceRssi: -60 },
  { tag: 'B2', floorId: 'g', x: 5, y: 5 },
];

it('layers this phone’s placements and calibrations over the venue layout', () => {
  const merged = mergeLayout(published, {
    overrides: {
      B1: { referenceRssi: -66, calibratedAt: '2026-10-20T10:00:00.000Z' },
      B2: { removed: true },
    },
    added: [{ tag: 'IB0001000A', floorId: 'g', x: 3, y: 2, txAt1m: -62 }],
  });
  expect(merged.map((b) => [b.tag, b.source])).toEqual([
    ['B1', 'phone'],
    ['IB0001000A', 'phone'],
  ]);
  expect(merged[0]!.referenceRssi).toBe(-66);
  expect(merged[0]!.x).toBe(1);
});

it('gives the fusion a 1 m reference: calibrated, advertised, then the model value', () => {
  const placements = placementsFor(
    [
      {
        tag: 'A',
        floorId: 'g',
        x: 0,
        y: 0,
        referenceRssi: -64,
        source: 'phone',
      },
      { tag: 'B', floorId: 'g', x: 0, y: 0, txAt1m: -58, source: 'phone' },
      { tag: 'C', floorId: 'g', x: 0, y: 0, source: 'phone' },
      // A venue beacon without a reference stays out of the fusion, as before.
      { tag: 'D', floorId: 'g', x: 0, y: 0, source: 'venue' },
      { tag: 'E', floorId: 'u', x: 0, y: 0, source: 'phone' },
    ],
    'g',
  );
  expect(placements.map((p) => [p.tag, p.referenceRssi])).toEqual([
    ['A', -64],
    ['B', -58],
    ['C', MODEL_RSSI_AT_1M],
    ['D', undefined],
  ]);
});

const device = (over: Partial<NearbyDevice>): NearbyDevice => ({
  key: 'k',
  tag: 'IB00010001',
  alt: [],
  rssi: -60,
  rate: 1,
  lastHeard: 0,
  history: [],
  info: { kind: 'ibeacon', major: 1, minor: 1 },
  ...over,
});

it('keeps beacons that share one iBeacon ID apart by address or name', () => {
  const a = device({ key: 'a', alt: ['MCAABBCC01', 'NMbeacon01'] });
  const b = device({ key: 'b', alt: ['MCAABBCC02'] });
  expect(adoptionTag(a, [a])).toEqual({ tag: 'IB00010001', note: null });
  expect(adoptionTag(a, [a, b]).tag).toBe('MCAABBCC01');
  const named = device({ key: 'c', alt: ['NMbeacon03'] });
  expect(adoptionTag(named, [named, b]).tag).toBe('NMbeacon03');
  // iPhone: shared identity and nothing else to tell them apart.
  const ios = device({ key: 'd', info: { kind: 'ibeacon', shared: 3 } });
  expect(adoptionTag(ios, [ios]).tag).toBeNull();
});

it('describes devices for people and estimates rough distances', () => {
  expect(describeDevice(device({})).title).toBe('iBeacon 1 · 1');
  expect(describeDevice({ tag: 'IB0002000A' }).title).toBe('iBeacon 2 · 10');
  expect(describeDevice({ tag: '0A0B0C0D0E0F' }).kind).toBe('Eddystone');
  expect(roughDistance(-59, -59)).toBeCloseTo(1, 5);
  expect(roughDistance(-82, -59)).toBeGreaterThan(8);
});
