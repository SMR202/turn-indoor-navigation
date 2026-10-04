import type { Observation } from '@turn/contracts';
import { expect, it } from 'vitest';
import { sampleVenue } from '@turn/venue-model';
import {
  appendCheckpoint,
  diagnoseRecording,
  replayRecording,
  recordingSchema,
  type Recording,
} from './index';

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
it('evaluates checkpoints at the tapped observation boundary without changing replay', () => {
  const full = recording();
  const r = structuredClone(full);
  r.navigation = {
    sourceAnchorId: 'entry-qr',
    destinationPoiId: 'cafe',
    guidanceRevision: 'route-progress-v1',
    completion: 'in-progress',
  };
  r.observations = full.observations.slice(0, 250);
  const atTap = replayRecording(r, sampleVenue);
  appendCheckpoint(r, 'junction', 'arrival');
  r.observations = full.observations;
  appendCheckpoint(r, 'junction', 'after-wait');
  const decoded = recordingSchema.parse(JSON.parse(JSON.stringify(r)));
  const diagnosis = diagnoseRecording(decoded);
  expect(diagnosis.checkpoints).toHaveLength(2);
  const node = sampleVenue.nodes.find((n) => n.id === 'junction')!;
  expect(diagnosis.checkpoints[0]!.discrepancyMetres).toBeCloseTo(
    Math.hypot(
      atTap.pose!.position.x - node.x,
      atTap.pose!.position.y - node.y,
    ),
  );
  expect(diagnosis.checkpoints[0]!.steps).toBe(atTap.steps);
  expect(diagnosis.invalidCheckpointCount).toBe(0);
  expect(replayRecording(decoded, sampleVenue)).toEqual(
    replayRecording(full, sampleVenue),
  );
  decoded.checkpoints![0]!.nodeId = 'missing';
  decoded.checkpoints![1]!.afterObservationCount = 99999;
  const invalid = diagnoseRecording(decoded);
  expect(invalid.invalidCheckpointCount).toBe(2);
  expect(invalid.checkpoints[0]!.discrepancyMetres).toBeNull();
});

it('rejects inactive and unknown checkpoint references and invalid timing metadata', () => {
  const r = recording();
  expect(() => appendCheckpoint(r, 'junction', 'arrival')).toThrow(
    'Start navigation',
  );
  r.navigation = {
    sourceAnchorId: 'entry-qr',
    destinationPoiId: 'cafe',
    guidanceRevision: 'route-progress-v1',
    completion: 'in-progress',
  };
  expect(() => appendCheckpoint(r, 'unknown', 'arrival')).toThrow(
    'recorded venue',
  );
  appendCheckpoint(r, 'junction', 'arrival');
  r.checkpoints![0]!.timestampSeconds += 5;
  expect(diagnoseRecording(r).invalidCheckpointCount).toBe(1);
  r.checkpoints![0]!.timestampSeconds = -1;
  expect(recordingSchema.safeParse(r).success).toBe(false);
});
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
it('preserves baseline replay when diagnostic gyro and linear streams are added', () => {
  const original = recording();
  const enriched = structuredClone(original);
  enriched.observations = original.observations.flatMap<Observation>((o) =>
    o.type === 'accelerometer'
      ? [
          o,
          { ...o, type: 'linear-acceleration' as const },
          { ...o, type: 'gyroscope' as const, units: 'rad/s' as const },
        ]
      : [o],
  );
  expect(replayRecording(enriched, sampleVenue)).toEqual(
    replayRecording(original, sampleVenue),
  );
});
