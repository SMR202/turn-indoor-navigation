/**
 * Beacon advertisement formats TURN understands (reference decoder; the native scanners in
 * apps/mobile/modules/turn-motion implement the same rules).
 *
 * - TURN phone beacon: manufacturer data, company 0xFFFF (little endian FF FF) + "TURN" + version 1
 *   + 1–12 ASCII letters/digits. The tag is the ASCII text.
 * - Eddystone-UID (commercial beacons): service data for UUID 0xFEAA, frame type 0x00, signed
 *   calibrated TX power at 0 m, 10-byte namespace, 6-byte instance. The tag is the instance as 12
 *   upper-case hex digits; the namespace is not used for matching.
 * - iBeacon is not supported: iOS hides it from CoreBluetooth scans.
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
