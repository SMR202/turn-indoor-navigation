import { expect, it } from 'vitest';
import type { Observation } from '@turn/contracts';
import { sampleVenue } from '@turn/venue-model';
import { MotionGuard, GUARDED_PDR_REVISION } from './motion-guard';
import {
  NavigationEngine,
  replayRecording,
  diagnoseRecording,
  type Recording,
} from './index';

const base = {
  schemaVersion: 1 as const,
  sessionId: 'guard-test',
  source: 'synthetic',
  timestampSeconds: 0,
};
function samples(time: number, horizontal = 1.4, gyro = 0.1): Observation[] {
  const v = 2 * Math.sin(4 * Math.PI * time),
    h = horizontal * Math.cos(4 * Math.PI * time);
  return [
    {
      ...base,
      timestampSeconds: time,
      type: 'accelerometer',
      includesGravity: true,
      units: 'm/s2',
      frame: 'device',
      values: [h, 0, 9.80665 + v],
    },
    {
      ...base,
      timestampSeconds: time,
      type: 'gyroscope',
      units: 'rad/s',
      frame: 'device',
      values: [gyro, 0, 0],
    },
    {
      ...base,
      timestampSeconds: time,
      type: 'linear-acceleration',
      units: 'm/s2',
      frame: 'device',
      values: [h, 0, v],
    },
  ];
}
function simulate(
  horizontal: number,
  gyro = 0.1,
  missing = false,
  isolated = false,
) {
  const guard = new MotionGuard();
  const accepted: { time: number; heading: number; delivered: number }[] = [];
  for (let i = 0; i < 250; i++) {
    const time = i / 50;
    for (const o of samples(time, horizontal, gyro))
      if (!missing || o.type !== 'linear-acceleration') guard.observe(o);
    if (i === 65 || (!isolated && i === 90))
      guard.candidate(time, i === 65 ? 0 : Math.PI / 2);
    const step = guard.advance(time);
    if (step) accepted.push({ ...step, delivered: time });
  }
  return { guard, accepted };
}
it('buffers start, preserves peak times/headings, and accounts for every candidate', () => {
  const { guard, accepted } = simulate(1.4);
  expect(accepted.map(({ time, heading }) => ({ time, heading }))).toEqual([
    { time: 1.3, heading: 0 },
    { time: 1.8, heading: Math.PI / 2 },
  ]);
  expect(accepted[0]!.delivered).toBeGreaterThanOrEqual(2.45);
  expect(guard.snapshot()).toMatchObject({
    detected: 2,
    rejected: 0,
    pending: 0,
  });
});
it('holds vertical oscillation, rotation, missing sensors and isolated detections', () => {
  for (const result of [
    simulate(0.1),
    simulate(1.4, 2),
    simulate(1.4, 0.1, true),
    simulate(1.4, 0.1, false, true),
  ]) {
    expect(result.accepted).toHaveLength(0);
    expect(result.guard.snapshot().pending).toBe(0);
    expect(result.guard.snapshot().rejected).toBe(
      result.guard.snapshot().detected,
    );
  }
});
it('does not bridge a sensor gap or release pending motion after finish', () => {
  const guard = new MotionGuard();
  for (let i = 0; i <= 110; i++) {
    const time = i / 50;
    if (time < 1.2 || time > 1.5)
      samples(time).forEach((o) => guard.observe(o));
    if (i === 65 || i === 90) guard.candidate(time, 0);
    expect(guard.advance(time)).toBeUndefined();
  }
  guard.finish();
  expect(guard.advance(3)).toBeUndefined();
  expect(guard.snapshot()).toMatchObject({
    detected: 2,
    rejected: 2,
    pending: 0,
  });
});
function recording(): Recording {
  const observations: Observation[] = [
    {
      ...base,
      type: 'anchor',
      venueId: sampleVenue.venueId,
      venueRevision: sampleVenue.revision,
      anchorId: 'entry-qr',
    },
    { ...base, type: 'heading-alignment', headingRad: 0, frame: 'venue' },
  ];
  for (let i = 0; i < 500; i++) {
    const time = i / 50;
    observations.push(
      {
        ...base,
        timestampSeconds: time,
        type: 'attitude',
        yawRad: Math.min(time / 10, 1),
        tiltRad: 0,
        frame: 'session-relative',
        units: 'rad',
      },
      ...samples(time),
    );
  }
  return {
    schemaVersion: 1,
    algorithm: GUARDED_PDR_REVISION,
    sessionId: base.sessionId,
    stepLengthMetres: 0.5,
    venue: sampleVenue,
    metadata: {
      platform: 'synthetic',
      osVersion: 'none',
      timestampBasis: 'native-boot-seconds-minus-session-origin',
      note: 'Not physical accuracy evidence',
    },
    observations,
  };
}
it('has exact live/replay equality and never uses trial labels to decide movement', () => {
  const r = recording();
  const engine = new NavigationEngine(
    sampleVenue,
    r.sessionId,
    r.stepLengthMetres,
    r.algorithm,
  );
  r.observations.forEach((o) => engine.consume(o));
  expect(replayRecording(r, sampleVenue)).toEqual(engine.snapshot());
  const stillLabel = {
    mode: 'stationary',
    activity: 'phone-bobbing',
    pace: 'unspecified',
    manualSteps: 0,
    phoneModel: '',
    notes: '',
  };
  expect(replayRecording({ ...r, labels: stillLabel }, sampleVenue)).toEqual(
    engine.snapshot(),
  );
  expect(engine.snapshot().steps).toBeGreaterThan(10);
  const diagnosis = diagnoseRecording(r);
  expect(
    diagnosis.stepsDetail.every((s) => s.detectedAt - s.time >= 0.65),
  ).toBe(true);
  expect(diagnosis.trail.at(-1)).toEqual(engine.snapshot().pose!.position);
  const final = engine.snapshot();
  expect(final.motion!.detected).toBe(
    final.steps + final.motion!.pending + final.motion!.rejected,
  );
  engine.consume(r.observations[0]!);
  expect(engine.snapshot().motion).toMatchObject({
    detected: 0,
    pending: 0,
    rejected: 0,
  });
  expect(engine.snapshot().steps).toBe(0);
});
it('projects features consistently under a fixed device-axis rotation', () => {
  const a = new MotionGuard(),
    b = new MotionGuard();
  for (let i = 0; i < 150; i++) {
    const time = i / 50;
    for (const o of samples(time)) {
      a.observe(o);
      if ('values' in o)
        b.observe({ ...o, values: [o.values[2], o.values[1], -o.values[0]] });
    }
    if (i === 65 || i === 90) {
      a.candidate(time, 0);
      b.candidate(time, 0);
    }
    expect(b.advance(time)).toEqual(a.advance(time));
  }
  expect(b.snapshot().horizontalRms).toBeCloseTo(a.snapshot().horizontalRms);
});

it('requires a new anchor before changing heading with buffered detections', () => {
  const r = recording();
  const engine = new NavigationEngine(
    sampleVenue,
    r.sessionId,
    r.stepLengthMetres,
    r.algorithm,
  );
  let time = 0;
  for (const o of r.observations) {
    engine.consume(o);
    time = o.timestampSeconds;
    if (engine.snapshot().motion!.detected > 0) break;
  }
  expect(engine.snapshot().steps).toBe(0);
  engine.consume({
    ...base,
    timestampSeconds: time + 0.01,
    type: 'heading-alignment',
    headingRad: 1,
    frame: 'venue',
  });
  expect(engine.snapshot().stopped).toBe(true);
  expect(engine.snapshot().motion!.pending).toBe(0);
  expect(engine.snapshot().steps).toBe(0);
});
