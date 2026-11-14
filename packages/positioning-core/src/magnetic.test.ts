import { describe, expect, it } from 'vitest';
import { headingNoiseFactorFor, MagneticMonitor } from './magnetic';

/** Feeds a strength profile (µT over time) at 10 Hz as a field along one axis. Simulated. */
function run(
  monitor: MagneticMonitor,
  seconds: number,
  strength: (t: number) => number,
  from = 0,
) {
  let last = monitor.state;
  for (let i = 0; i < seconds * 10; i++) {
    const t = from + i / 10;
    last = monitor.update({ t, x: 0, y: strength(t), z: 0 });
  }
  return last!;
}
/** Small steady sensor noise. */
const noise = (t: number) => 0.4 * Math.sin(t * 37) + 0.3 * Math.cos(t * 91);

describe('magnetic disturbance', () => {
  it('is calm in a steady field, at any normal strength', () => {
    for (const b of [28, 48, 62]) {
      const s = run(new MagneticMonitor(), 30, (t) => b + noise(t));
      expect(s.disturbance).toBeLessThan(0.05);
      expect(s.baseline).toBeCloseTo(b, 0);
    }
  });

  it('rises at once near steel and falls slowly afterwards', () => {
    const m = new MagneticMonitor();
    run(m, 20, (t) => 48 + noise(t));
    // Past a steel door frame: the strength jumps by 40% and wobbles.
    const near = run(m, 3, (t) => 68 + 6 * Math.sin(t * 5), 20);
    expect(near.disturbance).toBeGreaterThan(0.8);
    const justAfter = run(m, 1, (t) => 48 + noise(t), 23);
    expect(justAfter.disturbance).toBeGreaterThan(0.4);
    const later = run(m, 20, (t) => 48 + noise(t), 24);
    expect(later.disturbance).toBeLessThan(0.1);
  });

  it('does not learn a long disturbance as the new normal', () => {
    const m = new MagneticMonitor();
    run(m, 20, (t) => 48 + noise(t));
    const during = run(m, 60, (t) => 75 + noise(t), 20);
    expect(during.baseline).toBeLessThan(52);
    expect(during.disturbance).toBeGreaterThan(0.6);
  });

  it('treats a first reading far outside Earth’s field as disturbed', () => {
    const s = run(new MagneticMonitor(), 2, () => 140);
    expect(s.disturbance).toBeGreaterThan(0.6);
  });

  it('follows slow changes while walking through a calm building', () => {
    // 48 µT drifting to 51 µT over a minute is the building, not a disturbance.
    const s = run(new MagneticMonitor(), 60, (t) => 48 + t / 20 + noise(t));
    expect(s.disturbance).toBeLessThan(0.1);
  });

  it('maps disturbance to how much less the heading is trusted', () => {
    expect(headingNoiseFactorFor(0)).toBe(1);
    expect(headingNoiseFactorFor(0.5)).toBe(2.5);
    expect(headingNoiseFactorFor(3)).toBe(4);
    expect(new MagneticMonitor().disturbance).toBe(0);
  });
});
