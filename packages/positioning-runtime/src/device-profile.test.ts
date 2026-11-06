import { describe, expect, it } from 'vitest';
import { learn, resolveDeviceProfile } from './device-profile';

describe('device profiles', () => {
  it('starts from platform defaults with the iPhone radio window', () => {
    const p = resolveDeviceProfile('ios', 'iPhone16,1', null, null);
    expect(p).toMatchObject({ source: 'platform', rssiOffsetDb: 0 });
    expect(p.scan.windowSeconds).toBeGreaterThan(
      resolveDeviceProfile('android', 'Pixel', null, null).scan.windowSeconds,
    );
  });
  it('layers the model value under this phone’s own learned value', () => {
    const shared = { rssiOffsetDb: -4, stepLengthMetres: 0.7, samples: 9 };
    const own = { stepLengthMetres: 0.62, samples: 3 };
    const p = resolveDeviceProfile('android', 'Pixel 4a (5G)', shared, own);
    expect(p.source).toBe('learned');
    expect(p.stepLengthMetres).toBeCloseTo(0.62);
    // This phone has not learned an offset yet: the model's applies.
    expect(p.rssiOffsetDb).toBe(-4);
  });
  it('clips implausible values', () => {
    const p = resolveDeviceProfile(
      'ios',
      'x',
      { rssiOffsetDb: 40, stepLengthMetres: 3, samples: 1 },
      null,
    );
    expect(p.rssiOffsetDb).toBe(12);
    expect(p.stepLengthMetres).toBe(0.95);
  });
  it('learns quickly at first, then slowly, so one odd walk cannot move it far', () => {
    let v = learn(null, { stepLengthMetres: 0.7 });
    expect(v.stepLengthMetres).toBeCloseTo(0.7);
    for (let i = 0; i < 20; i++) v = learn(v, { stepLengthMetres: 0.6 });
    expect(v.stepLengthMetres!).toBeLessThan(0.62);
    const before = v.stepLengthMetres!;
    v = learn(v, { stepLengthMetres: 0.9 });
    expect(v.stepLengthMetres! - before).toBeLessThan(0.04);
  });
});
