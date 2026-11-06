import { describe, expect, it } from 'vitest';
import {
  COMPASS_ZERO_DEG,
  northOffsetFromBearing,
  startHeading,
  type VenueOrientation,
} from './compass';

const RAD = Math.PI / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('compass start', () => {
  it('turns an Android compass reading into the right venue heading', () => {
    // Map +y points 30° east of north. Phone top points due east (bearing 90°): Android yaw = −90°.
    const g = { bearingDeg: 30, declinationDeg: 0 };
    const yaw = -90 * RAD;
    const heading = wrap(northOffsetFromBearing(g, 'android') + yaw);
    // East is 60° clockwise of the map's +y, so the venue heading is 90° − 60° = 30° from +x.
    expect(heading).toBeCloseTo(30 * RAD, 6);
  });
  it('applies magnetic declination (true = magnetic + declination)', () => {
    const plain = northOffsetFromBearing({ bearingDeg: 0 }, 'android');
    const east5 = northOffsetFromBearing(
      { bearingDeg: 0, declinationDeg: 5 },
      'android',
    );
    expect(wrap(plain - east5)).toBeCloseTo(5 * RAD, 6);
  });
  it('differs between platforms only by their compass zeros', () => {
    const g = { bearingDeg: 123 };
    expect(
      wrap(
        northOffsetFromBearing(g, 'android') - northOffsetFromBearing(g, 'ios'),
      ),
    ).toBeCloseTo(
      wrap((COMPASS_ZERO_DEG.ios - COMPASS_ZERO_DEG.android) * RAD),
      6,
    );
  });
  it('prefers this phone, then other phones of the same kind, then the map bearing', () => {
    const o: VenueOrientation = {
      georeference: { bearingDeg: 10 },
      learned: { ios: { northOffsetRad: 1, samples: 5 } },
    };
    expect(startHeading('ios', 0.3, o)?.source).toBe('this-phone');
    expect(startHeading('ios', null, o)).toMatchObject({
      source: 'other-phones',
      northOffset: 1,
    });
    // An Android phone cannot use iPhone offsets: their compass zeros differ.
    expect(startHeading('android', null, o)?.source).toBe('venue-bearing');
    expect(
      startHeading('android', null, { georeference: null, learned: {} }),
    ).toBeNull();
    expect(startHeading('android', null, null)).toBeNull();
  });
});
