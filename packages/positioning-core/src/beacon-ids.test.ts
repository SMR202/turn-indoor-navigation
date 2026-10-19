import { expect, it } from 'vitest';
import {
  eddystoneRssiAt1m,
  eddystoneUidTag,
  turnManufacturerTag,
} from './beacon-ids';
import { BLE_BEACON_ID } from './fingerprints';

it('decodes TURN phone beacons', () => {
  const tag = [
    0xff,
    0xff,
    0x54,
    0x55,
    0x52,
    0x4e,
    1,
    ...'B3'.split('').map((c) => c.charCodeAt(0)),
  ];
  expect(turnManufacturerTag(tag)).toBe('B3');
  expect(turnManufacturerTag([0x4c, 0x00, 0x02, 0x15])).toBeNull(); // iBeacon prefix
  expect(turnManufacturerTag([...tag.slice(0, 6), 2, 0x41])).toBeNull(); // unknown version
});

it('decodes Eddystone-UID instance ids into valid TURN tags', () => {
  // frame 0x00, tx -18 dBm (0xEE), namespace 10 bytes, instance 0A0B0C0D0E0F, 2 reserved bytes.
  const frame = [
    0x00,
    0xee,
    ...Array.from({ length: 10 }, (_, i) => i),
    0x0a,
    0x0b,
    0x0c,
    0x0d,
    0x0e,
    0x0f,
    0,
    0,
  ];
  const tag = eddystoneUidTag(frame);
  expect(tag).toBe('0A0B0C0D0E0F');
  expect(BLE_BEACON_ID.test(tag!)).toBe(true);
  expect(eddystoneRssiAt1m(frame)).toBe(-59);
  expect(eddystoneUidTag([0x10, 0x00, 0x00])).toBeNull(); // URL frame
  expect(eddystoneUidTag(frame.slice(0, 12))).toBeNull();
});
