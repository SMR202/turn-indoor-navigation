import { describe, expect, it } from 'vitest';
import { sampleVenue } from '@turn/venue-model';
import type { Observation } from '@turn/contracts';
import { NavigationEngine } from './index';
import { PDR_REVISION } from '@turn/pdr';

const envelope = {
  schemaVersion: 1 as const,
  sessionId: 'test',
  source: 'synthetic',
  timestampSeconds: 0,
};
function run(
  policy: 'bounded' | 'resilient',
  options: {
    tiltBetween?: [number, number];
    yawJumpAt?: number;
    repeatAccelAt?: number;
  } = {},
) {
  const engine = new NavigationEngine(
    sampleVenue,
    'test',
    0.7,
    PDR_REVISION,
    policy,
  );
  const feed = (o: Observation) => engine.consume(o);
  feed({
    ...envelope,
    type: 'anchor',
    venueId: sampleVenue.venueId,
    venueRevision: sampleVenue.revision,
    anchorId: 'entry-qr',
  });
  feed({
    ...envelope,
    type: 'heading-alignment',
    headingRad: 0,
    frame: 'venue',
  });
  const stepsAt: Record<number, number> = {};
  for (let i = 0; i <= 500; i++) {
    const t = i / 50;
    const tilted =
      options.tiltBetween &&
      t >= options.tiltBetween[0] &&
      t < options.tiltBetween[1];
    const yaw =
      options.yawJumpAt !== undefined && t >= options.yawJumpAt ? 1.5 : 0;
    feed({
      ...envelope,
      type: 'attitude',
      timestampSeconds: t,
      yawRad: yaw,
      tiltRad: tilted ? 1.5 : 0,
      units: 'rad',
      frame: 'session-relative',
    });
    const accel: Observation = {
      ...envelope,
      type: 'accelerometer',
      timestampSeconds: t,
      includesGravity: true,
      units: 'm/s2',
      frame: 'device',
      values: [
        0,
        0,
        9.80665 + (t > 1 ? 1.8 * Math.sin(4 * Math.PI * (t - 1)) : 0),
      ],
    };
    feed(accel);
    if (
      options.repeatAccelAt !== undefined &&
      Math.abs(t - options.repeatAccelAt) < 1e-9
    )
      feed(accel); // duplicate timestamp
    if (i % 50 === 0) stepsAt[i / 50] = engine.snapshot().steps;
  }
  return { engine, stepsAt };
}

describe('resilient tracking policy (Plan 002 P2)', () => {
  it('historical policy still stops on steep tilt (unchanged behaviour)', () => {
    const { engine } = run('bounded', { tiltBetween: [4, 6] });
    expect(engine.snapshot().stopped).toBe(true);
  });
  it('pauses walking updates while tilted past 80 degrees and resumes by itself', () => {
    const { engine, stepsAt } = run('resilient', { tiltBetween: [4, 6] });
    const s = engine.snapshot();
    expect(s.stopped).toBe(false);
    expect(stepsAt[6]! - stepsAt[4]!).toBeLessThanOrEqual(1); // held while tilted
    expect(s.steps).toBeGreaterThan(stepsAt[6]! + 3); // resumed afterwards
    expect(s.droppedSteps).toBeGreaterThan(0);
    expect(s.warning).toBeUndefined(); // hold reason clears on recovery
  });
  it('ignores a repeated sensor sample instead of stopping', () => {
    expect(run('bounded', { repeatAccelAt: 3 }).engine.snapshot().stopped).toBe(
      true,
    );
    const { engine } = run('resilient', { repeatAccelAt: 3 });
    expect(engine.snapshot().stopped).toBe(false);
    expect(engine.snapshot().steps).toBeGreaterThan(8);
  });
  it('accepts a sudden heading change without stopping', () => {
    expect(run('bounded', { yawJumpAt: 3 }).engine.snapshot().stopped).toBe(
      true,
    );
    const { engine } = run('resilient', { yawJumpAt: 3 });
    const s = engine.snapshot();
    expect(s.stopped).toBe(false);
    expect(s.pose?.headingRad).toBeCloseTo(1.5, 1);
  });
});
