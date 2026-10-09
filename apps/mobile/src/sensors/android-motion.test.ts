import { expect, it, vi } from 'vitest';
import type { RawMotionEvent } from '../../modules/turn-motion';
import { MotionGuard } from '../../../../packages/positioning-core/src/motion-guard';
import {
  NavigationEngine,
  GUARDED_PDR_REVISION,
  replayRecording,
  recordingSchema,
} from '@turn/positioning-core';
import { sampleVenue } from '@turn/venue-model';
import type { Observation } from '@turn/contracts';
vi.mock('../../modules/turn-motion', () => ({ default: null }));
import { createAndroidBatchNormalizer } from './android-motion';

function raw(walking: boolean): RawMotionEvent[] {
  const result: RawMotionEvent[] = [];
  for (let i = 0; i < 300; i++) {
    const time = i / 50,
      timestamp = 100 + time;
    const z = 2 * Math.sin(time * 4 * Math.PI);
    const x = (walking ? 1.4 : 0.1) * Math.cos(time * 4 * Math.PI);
    result.push(
      { type: 9, timestamp, values: [0, 0, 9.81] },
      { type: 11, timestamp, values: [0.15, 0, 0] },
      { type: 1, timestamp, values: [x, 0, 9.81 + z] },
      { type: 4, timestamp, values: [0.1, 0, 0] },
      { type: 10, timestamp, values: [x, 0, z] },
    );
  }
  return result;
}
it('retains native times/counts and frame/units when delivery is delayed or batch sizes change', () => {
  const events = raw(true);
  const individual = createAndroidBatchNormalizer('test');
  const expected = events.flatMap((event) => individual([event]));
  const batch = createAndroidBatchNormalizer('test');
  const actual = [];
  for (let i = 0; i < events.length; i += 67)
    actual.push(...batch(events.slice(i, i + 67)));
  expect(actual).toEqual(expected);
  for (const type of [
    'accelerometer',
    'attitude',
    'gyroscope',
    'linear-acceleration',
  ]) {
    const stream = actual.filter((o) => o.type === type);
    expect(stream).toHaveLength(300);
    expect(stream.at(-1)!.timestampSeconds).toBeCloseTo(5.98);
    expect(stream[0]!.source).toBe('turn-android-imu-1');
  }
  expect(actual.find((o) => o.type === 'accelerometer')).toMatchObject({
    values: [1.4, 0, -9.81],
    units: 'm/s2',
  });
  expect(actual.find((o) => o.type === 'gyroscope')).toMatchObject({
    values: [0.1, 0, 0],
    units: 'rad/s',
  });
  expect(actual.find((o) => o.type === 'attitude')).toMatchObject({
    tiltRad: 0,
  });
});
it('feeds the unchanged motion guard: walking-like synthetic motion passes, vertical bobbing is rejected', () => {
  for (const walking of [true, false]) {
    const guard = new MotionGuard(),
      accepted = [];
    const normalize = createAndroidBatchNormalizer('test');
    let first = false,
      second = false;
    for (const observation of normalize(raw(walking))) {
      guard.observe(observation);
      const time = observation.timestampSeconds;
      if (!first && time >= 1.3) {
        first = true;
        guard.candidate(time, 0);
      }
      if (!second && time >= 1.8) {
        second = true;
        guard.candidate(time, 0);
      }
      const step = guard.advance(time);
      if (step) accepted.push(step);
    }
    expect(accepted).toHaveLength(walking ? 2 : 0);
    expect(guard.snapshot().rejected).toBe(walking ? 0 : 2);
  }
});
it('moves the full navigation engine from batched walking data and retains exact replay parity', () => {
  for (const walking of [true, false]) {
    const engine = new NavigationEngine(
      sampleVenue,
      'test',
      0.5,
      GUARDED_PDR_REVISION,
    );
    const base = {
      schemaVersion: 1 as const,
      sessionId: 'test',
      source: 'synthetic-test',
      timestampSeconds: 0,
    };
    const observations: Observation[] = [
      {
        ...base,
        type: 'anchor',
        venueId: sampleVenue.venueId,
        venueRevision: sampleVenue.revision,
        anchorId: 'entry-qr',
      },
      { ...base, type: 'heading-alignment', headingRad: 0, frame: 'venue' },
      ...createAndroidBatchNormalizer('test')(raw(walking)),
    ];
    observations.forEach((observation) => engine.consume(observation));
    expect(engine.snapshot().stopped).toBe(false);
    if (walking) expect(engine.snapshot().steps).toBeGreaterThan(4);
    else expect(engine.snapshot().steps).toBe(0);
    const recording = recordingSchema.parse({
      schemaVersion: 1,
      sessionId: 'test',
      algorithm: GUARDED_PDR_REVISION,
      stepLengthMetres: 0.5,
      metadata: {
        platform: 'android',
        osVersion: 'synthetic',
        acquisitionSource: 'turn-android-imu-1',
        timestampBasis: 'native-boot-seconds-minus-session-origin',
        note: 'Synthetic only; not device accuracy evidence',
      },
      observations,
    });
    expect(recording.metadata.acquisitionSource).toBe('turn-android-imu-1');
    expect(replayRecording(recording, sampleVenue)).toEqual(engine.snapshot());
  }
});
it('does not manufacture frames for partial startup, duplicate samples or invalid/reversed native clocks', () => {
  const normalize = createAndroidBatchNormalizer('test');
  expect(normalize([{ type: 1, timestamp: 10, values: [0, 0, 9.81] }])).toEqual(
    [],
  );
  const events = raw(true).slice(0, 5);
  expect(normalize(events)).toHaveLength(4);
  expect(normalize(events)).toEqual([]);
  expect(() =>
    normalize([{ type: 1, timestamp: 99, values: [0, 0, 9.81] }]),
  ).toThrow('timestamp reversal');
  expect(() =>
    normalize([{ type: 1, timestamp: NaN, values: [0, 0, 9.81] }]),
  ).toThrow('Invalid');
});
