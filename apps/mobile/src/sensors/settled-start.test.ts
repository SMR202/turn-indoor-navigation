import { expect, it } from 'vitest';
import type { Observation } from '@turn/contracts';
import { SettledStart } from './settled-start';
import { NavigationEngine } from '@turn/positioning-core';
import { sampleVenue } from '@turn/venue-model';

it('ignores grip movement before alignment and counts a walk after the ready cue', () => {
  const gate = new SettledStart();
  const engine = new NavigationEngine(sampleVenue, 'test', 0.5);
  const envelope = {
    schemaVersion: 1 as const,
    sessionId: 'test',
    source: 'synthetic',
  };
  engine.consume({
    ...envelope,
    timestampSeconds: 0,
    type: 'anchor',
    venueId: sampleVenue.venueId,
    venueRevision: sampleVenue.revision,
    anchorId: 'entry-qr',
  });
  const alignments: Observation[] = [];
  for (let i = 0; i < 450; i++) {
    const t = i / 50;
    const events: Observation[] = [
      {
        ...envelope,
        timestampSeconds: t,
        type: 'attitude',
        yawRad: t < 3 ? t / 4 : 0.75,
        tiltRad: 0,
        units: 'rad',
        frame: 'session-relative',
      },
      {
        ...envelope,
        timestampSeconds: t,
        type: 'accelerometer',
        includesGravity: true,
        units: 'm/s2',
        frame: 'device',
        values: [
          0,
          0,
          9.80665 + (t < 3 || t > 4.5 ? 1.8 * Math.sin(4 * Math.PI * t) : 0),
        ],
      },
    ];
    for (const event of events) {
      const state = gate.consume(event, Math.PI / 2);
      if (state.alignment) {
        alignments.push(state.alignment);
        engine.consume(state.alignment);
      }
      engine.consume(event);
      if (t < 4.1) expect(state.remaining).toBeGreaterThan(0);
      if (t < 4.5) expect(engine.snapshot().steps).toBe(0);
    }
  }
  expect(alignments).toHaveLength(1);
  expect(alignments[0]!.timestampSeconds).toBe(3);
  expect(engine.snapshot().stopped).toBe(false);
  expect(engine.snapshot().steps).toBeGreaterThan(5);
  expect(engine.snapshot().pose!.headingRad).toBeCloseTo(Math.PI / 2);
});

it('waits for attitude and acceleration instead of declaring ready on wall-clock time', () => {
  const gate = new SettledStart();
  const attitude: Observation = {
    schemaVersion: 1,
    sessionId: 'test',
    source: 'synthetic',
    timestampSeconds: 8,
    type: 'attitude',
    yawRad: 0,
    tiltRad: 0,
    units: 'rad',
    frame: 'session-relative',
  };
  expect(gate.consume(attitude, 0).remaining).toBe(1);
  expect(
    gate.consume({ ...attitude, timestampSeconds: 10 }, 0).readyAt,
  ).toBeNull();
});
