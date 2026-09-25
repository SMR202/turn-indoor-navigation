import { expect, it } from 'vitest';
import { sampleVenue } from '@turn/venue-model';
import { diagnoseRecording, replayRecording, type Recording } from './index';

function recording(): Recording {
  const r: Recording = {
    schemaVersion: 1,
    algorithm: 'step-yaw-v1',
    sessionId: 'test',
    stepLengthMetres: 0.5,
    venue: sampleVenue,
    metadata: {
      platform: 'synthetic',
      osVersion: 'none',
      timestampBasis: 'native-boot-seconds-minus-session-origin',
      note: 'Not accuracy evidence',
    },
    observations: [],
  };
  const base = {
    schemaVersion: 1 as const,
    sessionId: r.sessionId,
    source: 'synthetic',
    timestampSeconds: 0,
  };
  r.observations.push(
    {
      ...base,
      type: 'anchor',
      venueId: sampleVenue.venueId,
      venueRevision: sampleVenue.revision,
      anchorId: 'entry-qr',
    },
    {
      ...base,
      type: 'heading-alignment',
      headingRad: Math.PI / 2,
      frame: 'venue',
    },
  );
  for (let i = 0; i < 300; i++) {
    const t = i / 50;
    r.observations.push(
      {
        ...base,
        timestampSeconds: t,
        type: 'attitude',
        yawRad: Math.min(t, 1) * 0.1,
        tiltRad: 0,
        units: 'rad',
        frame: 'session-relative',
      },
      {
        ...base,
        timestampSeconds: t,
        type: 'accelerometer',
        includesGravity: true,
        units: 'm/s2',
        frame: 'device',
        values: [
          0,
          0,
          9.80665 + (t > 1 ? 1.8 * Math.sin(4 * Math.PI * (t - 1)) : 0),
        ],
      },
    );
  }
  return r;
}
it('replays exactly, separates peak times from detection, and preserves unknown ground truth', () => {
  const r = recording(),
    d = diagnoseRecording(r),
    final = replayRecording(r, sampleVenue);
  expect(d.steps).toBe(final.steps);
  expect(d.trail.at(-1)).toEqual(final.pose!.position);
  expect(d.manualSteps).toBeNull();
  expect(d.endpointErrorMetres).toBeNull();
  expect(d.leftOffsetMetres).toBeGreaterThan(0);
  expect(d.meanHeadingDeviationDeg).toBeCloseTo((0.1 * 180) / Math.PI);
  expect(d.acceleration.hz).toBeCloseTo(50);
  expect(d.stepsDetail.every((s) => s.time < s.detectedAt)).toBe(true);
});
it('evaluates stationary runs against the anchor and records labelled false steps', () => {
  const r = recording();
  r.labels = {
    mode: 'stationary',
    pace: 'unspecified',
    manualSteps: 0,
    phoneModel: '',
    notes: '',
  };
  const d = diagnoseRecording(r);
  expect(d.stepCountError).toBe(d.steps);
  expect(d.endpointErrorMetres).toBeCloseTo(d.distanceMetres);
  expect(d.completed).toBe(false);
});
it('reports stream gaps and an engine failure without calling the run completed', () => {
  const r = recording();
  r.observations = r.observations.filter(
    (o) => o.timestampSeconds < 2 || o.timestampSeconds > 3,
  );
  const d = diagnoseRecording(r);
  expect(d.acceleration.gapsOver100ms).toBe(1);
  expect(d.failure).toMatch(/gap/i);
  expect(d.completed).toBe(false);
});
