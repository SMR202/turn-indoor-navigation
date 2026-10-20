/**
 * Beacon advertisement formats TURN understands (reference decoder; the native scanners in
 * apps/mobile/modules/turn-motion implement the same rules).
 *
 * - TURN phone beacon: manufacturer data, company 0xFFFF (little endian FF FF) + "TURN" + version 1
 *   + 1–12 ASCII letters/digits. The tag is the ASCII text.
 * - Eddystone-UID (commercial beacons): service data for UUID 0xFEAA, frame type 0x00, signed
 *   calibrated TX power at 0 m, 10-byte namespace, 6-byte instance. The tag is the instance as 12
 *   upper-case hex digits; the namespace is not used for matching.
 * - iBeacon (for example April Brother beacons): Apple manufacturer data (company 0x004C) 02 15,
 *   16-byte proximity UUID, major, minor, measured power at 1 m. The tag is "IB" + major + minor as
 *   8 upper-case hex digits. iOS hides iBeacon from CoreBluetooth, so iPhones range it through Core
 *   Location by UUID (about one reading per second).
 * - Alternatives when frames do not tell beacons apart (several beacons with one iBeacon identity):
 *   "MC" + the last four bytes of the device address (Android only) or "NM" + the last ten letters
 *   and digits of the advertised name (both platforms).
 */
export function turnManufacturerTag(data: ArrayLike<number>): string | null {
  const b = Array.from(data);
  if (b.length < 8 || b.length > 19) return null;
  if (
    b[0] !== 0xff ||
    b[1] !== 0xff ||
    b[2] !== 0x54 ||
    b[3] !== 0x55 ||
    b[4] !== 0x52 ||
    b[5] !== 0x4e ||
    b[6] !== 1
  )
    return null;
  const tag = String.fromCharCode(...b.slice(7));
  return /^[A-Za-z0-9]{1,12}$/.test(tag) ? tag : null;
}

export function eddystoneUidTag(serviceData: ArrayLike<number>): string | null {
  const b = Array.from(serviceData);
  if (b.length < 18 || b[0] !== 0x00) return null;
  return b
    .slice(12, 18)
    .map((x) => (x & 0xff).toString(16).toUpperCase().padStart(2, '0'))
    .join('');
}

/**
 * Expected RSSI one metre from an Eddystone beacon, from its calibrated TX power at 0 m. The
 * Eddystone specification relates them with about 41 dB of free-space loss over the first metre.
 * A starting value only: calibrate on site with the phones that will scan.
 */
export function eddystoneRssiAt1m(
  serviceData: ArrayLike<number>,
): number | null {
  const b = Array.from(serviceData);
  if (b.length < 2 || b[0] !== 0x00) return null;
  const tx = b[1]! > 127 ? b[1]! - 256 : b[1]!;
  return tx - 41;
}

/** iBeacon tag from Apple manufacturer data (company id included, little endian 4C 00). */
export function iBeaconTag(data: ArrayLike<number>): string | null {
  const b = Array.from(data);
  if (
    b.length < 25 ||
    b[0] !== 0x4c ||
    b[1] !== 0x00 ||
    b[2] !== 0x02 ||
    b[3] !== 0x15
  )
    return null;
  return (
    'IB' +
    b
      .slice(20, 24)
      .map((x) => (x & 0xff).toString(16).toUpperCase().padStart(2, '0'))
      .join('')
  );
}

/** Expected RSSI one metre from an iBeacon: its measured-power byte (a vendor value, not a measurement). */
export function iBeaconRssiAt1m(data: ArrayLike<number>): number | null {
  const b = Array.from(data);
  if (b.length < 25 || b[2] !== 0x02 || b[3] !== 0x15) return null;
  return b[24]! > 127 ? b[24]! - 256 : b[24]!;
}

export type BeaconTagKind =
  'ibeacon' | 'eddystone' | 'address' | 'name' | 'turn';
/** What kind of identity a layout tag is, for labels and setup advice. */
export function beaconTagKind(tag: string): BeaconTagKind {
  if (/^IB[0-9A-F]{8}$/.test(tag)) return 'ibeacon';
  if (/^MC[0-9A-F]{8}$/.test(tag)) return 'address';
  if (/^NM[A-Za-z0-9]{1,10}$/.test(tag)) return 'name';
  if (/^[0-9A-F]{12}$/.test(tag)) return 'eddystone';
  return 'turn';
}
