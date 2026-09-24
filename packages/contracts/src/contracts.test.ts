import { describe, expect, it } from 'vitest';
import { observationSchema, poseSchema } from './index';

const envelope = {
  schemaVersion: 1,
  sessionId: 'walk-1',
  timestampSeconds: 0,
  source: 'test',
};
describe('normalized boundary', () => {
  it('rejects wrong units, invalid time and non-finite readings', () => {
    const valid = {
      ...envelope,
      type: 'accelerometer',
      values: [0, 0, 9.81],
      units: 'm/s2',
      frame: 'device',
      includesGravity: true,
    };
    expect(observationSchema.safeParse(valid).success).toBe(true);
    for (const override of [
      { units: 'g' },
      { timestampSeconds: -1 },
      { values: [NaN, 0, 0] },
      { schemaVersion: 2 },
      { frame: 'venue' },
    ]) {
      expect(
        observationSchema.safeParse({ ...valid, ...override }).success,
      ).toBe(false);
    }
  });
  it('keeps unknown heading and uncertainty explicit', () => {
    const pose = {
      ...envelope,
      venueId: 'demo',
      venueRevision: '1',
      floorId: 'g',
      position: { x: 1, y: 2 },
      headingRad: null,
      horizontalUncertaintyMetres: null,
      status: 'anchored',
    };
    expect(poseSchema.parse(pose).headingRad).toBeNull();
    expect(
      poseSchema.safeParse({ ...pose, horizontalUncertaintyMetres: -1 })
        .success,
    ).toBe(false);
    expect(poseSchema.safeParse({ ...pose, headingRad: 360 }).success).toBe(
      false,
    );
  });
  it('records denied capabilities without manufacturing readings', () => {
    expect(
      observationSchema.parse({
        ...envelope,
        type: 'capability',
        capability: 'magnetometer',
        status: 'denied',
        reason: 'Permission denied',
      }).type,
    ).toBe('capability');
  });
});
