import { describe, it, expect } from 'vitest';
import { sampleVenue } from '@turn/venue-model';
import type { Observation } from '@turn/contracts';
import {
  NavigationEngine,
  anchorPayload,
  resolveAnchorPayload,
  replayRecording,
} from './index';
import { calibratedStepLength, PDR_REVISION } from '@turn/pdr';

const envelope = {
  schemaVersion: 1 as const,
  sessionId: 'test',
  source: 'synthetic',
  timestampSeconds: 0,
};
const anchor: Observation = {
  ...envelope,
  type: 'anchor',
  venueId: sampleVenue.venueId,
  venueRevision: sampleVenue.revision,
  anchorId: 'entry-qr',
};
const alignment: Observation = {
  ...envelope,
  type: 'heading-alignment',
  headingRad: 0,
  frame: 'venue',
};
function walk() {
  const observations: Observation[] = [anchor, alignment];
  for (let i = 0; i <= 550; i++) {
    const time = i / 50;
    observations.push({
      ...envelope,
      type: 'attitude',
      timestampSeconds: time,
      yawRad: 0,
      tiltRad: 0,
      units: 'rad',
      frame: 'session-relative',
    });
    observations.push({
      ...envelope,
      type: 'accelerometer',
      timestampSeconds: time,
      includesGravity: true,
      units: 'm/s2',
      frame: 'device',
      values: [
        0,
        0,
        9.80665 + (time > 1 ? 1.8 * Math.sin(4 * Math.PI * (time - 1)) : 0),
      ],
    });
  }
  return observations;
}
describe('anchored experimental tracking', () => {
  it('integrates smooth left turns in venue coordinates across yaw wrap', () => {
    const engine = new NavigationEngine(sampleVenue, 'test', 0.7);
    const observations = walk().map((o) =>
      o.type === 'attitude'
        ? {
            ...o,
            yawRad: Math.atan2(
              Math.sin(
                3 +
                  (Math.min(Math.max(o.timestampSeconds - 4, 0), 1) * Math.PI) /
                    2,
              ),
              Math.cos(
                3 +
                  (Math.min(Math.max(o.timestampSeconds - 4, 0), 1) * Math.PI) /
                    2,
              ),
            ),
          }
        : o,
    );
    observations.forEach((o) => engine.consume(o));
    expect(engine.snapshot().stopped).toBe(false);
    expect(engine.snapshot().pose!.headingRad).toBeCloseTo(Math.PI / 2);
    expect(engine.snapshot().pose!.position.y).toBeGreaterThan(17);
  });
  it('stops rather than integrating steps with missing heading', () => {
    const engine = new NavigationEngine(sampleVenue, 'test', 0.7);
    walk()
      .filter((o) => o.type !== 'attitude')
      .forEach((o) => engine.consume(o));
    expect(engine.snapshot().stopped).toBe(true);
    expect(engine.snapshot().steps).toBe(0);
  });
  it('validates marker identity and revision; never accepts a launch URL', () => {
    expect(
      resolveAnchorPayload(anchorPayload(sampleVenue, 'entry-qr'), sampleVenue)
        .nodeId,
    ).toBe('entrance');
    for (const raw of [
      'exp://192.168.1.1:8081',
      '{}',
      anchorPayload(sampleVenue, 'entry-qr').replace(
        '"venueRevision":"1"',
        '"venueRevision":"99"',
      ),
      anchorPayload(sampleVenue, 'entry-qr').replace('entry-qr', 'unknown'),
    ])
      expect(() => resolveAnchorPayload(raw, sampleVenue)).toThrow();
  });
  it('requires plausible measured calibration', () => {
    expect(calibratedStepLength(10, 14)).toBeCloseTo(0.7143);
    for (const [distance, steps] of [
      [0, 0],
      [10, 2],
      [100, 10],
      [NaN, 10],
    ])
      expect(() => calibratedStepLength(distance!, steps!)).toThrow();
  });
  it('replays the same stream exactly and integrates synthetic steps, not time', () => {
    const observations = walk();
    const live = new NavigationEngine(sampleVenue, 'test', 0.7);
    observations.forEach((o) => live.consume(o));
    const replay = replayRecording(
      {
        schemaVersion: 1,
        algorithm: PDR_REVISION,
        sessionId: 'test',
        stepLengthMetres: 0.7,
        metadata: {
          platform: 'synthetic',
          osVersion: 'none',
          timestampBasis: 'native-boot-seconds-minus-session-origin',
          note: 'Not accuracy evidence',
        },
        observations,
      },
      sampleVenue,
    );
    expect(replay).toEqual(live.snapshot());
    expect(replay.stopped).toBe(false);
    expect(replay.steps).toBe(20);
    expect(replay.pose!.position.x).toBeCloseTo(3 + 20 * 0.7);
    expect(replay.pose!.horizontalUncertaintyMetres).toBeNull();
  });
  it('rejects stale heading, high tilt and reversed clocks, and resets at an anchor', () => {
    for (const failure of ['gap', 'tilt', 'clock']) {
      const engine = new NavigationEngine(sampleVenue, 'test', 0.7);
      const first: Observation = {
        ...envelope,
        type: 'attitude',
        yawRad: 0,
        tiltRad: 0,
        units: 'rad',
        frame: 'session-relative',
      };
      [anchor, alignment, first].forEach((o) => engine.consume(o));
      engine.consume({
        ...first,
        timestampSeconds:
          failure === 'clock' ? 0 : failure === 'gap' ? 1 : 0.02,
        tiltRad: failure === 'tilt' ? 1.4 : 0,
      });
      expect(engine.snapshot().pose!.status).toBe('lost');
      engine.consume({
        ...anchor,
        anchorId: 'junction-qr',
        timestampSeconds: 2,
      });
      expect(engine.snapshot().stopped).toBe(false);
      expect(engine.snapshot().pose!.position.x).toBe(15);
    }
  });
  it('does not move while stationary', () => {
    const engine = new NavigationEngine(sampleVenue, 'test', 0.7);
    walk()
      .map((o) =>
        o.type === 'accelerometer'
          ? { ...o, values: [0, 0, 9.80665] as [number, number, number] }
          : o,
      )
      .forEach((o) => engine.consume(o));
    expect(engine.snapshot().steps).toBe(0);
  });
});
