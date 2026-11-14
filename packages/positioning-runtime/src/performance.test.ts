import { describe, expect, it } from 'vitest';
import {
  capabilityNotes,
  FrameMeter,
  performanceTier,
  TIER_SETTINGS,
} from './performance';

describe('performance tier', () => {
  it('is full when nothing argues otherwise', () => {
    expect(performanceTier({})).toBe('full');
    expect(
      performanceTier({ frameMs: 16.7, memoryGb: 8, yearClass: 2023 }),
    ).toBe('full');
  });
  it('takes the most cautious sign', () => {
    expect(performanceTier({ frameMs: 25, memoryGb: 8 })).toBe('balanced');
    expect(performanceTier({ frameMs: 16.7, memoryGb: 4 })).toBe('balanced');
    expect(performanceTier({ frameMs: 40, memoryGb: 12 })).toBe('light');
    expect(performanceTier({ memoryGb: 2 })).toBe('light');
    expect(performanceTier({ yearClass: 2015, memoryGb: 6 })).toBe('light');
  });
  it('goes light when saving battery, whatever the phone', () => {
    expect(performanceTier({ frameMs: 16, memoryGb: 12, saving: true })).toBe(
      'light',
    );
  });
  it('ignores values the system could not report', () => {
    expect(
      performanceTier({ frameMs: null, memoryGb: 0, yearClass: null }),
    ).toBe('full');
    expect(performanceTier({ frameMs: Number.NaN })).toBe('full');
  });
  it('lightens the filter and flattens the map on the light tier', () => {
    expect(TIER_SETTINGS.light.particles).toBeLessThan(
      TIER_SETTINGS.balanced.particles,
    );
    expect(TIER_SETTINGS.balanced.particles).toBeLessThan(
      TIER_SETTINGS.full.particles,
    );
    expect(TIER_SETTINGS.light.map3d).toBe(false);
  });
});

describe('frame meter', () => {
  it('reports the median gap once enough frames were seen', () => {
    const m = new FrameMeter(30);
    for (let i = 0; i < 20; i++) m.add(i * 16.7);
    expect(m.medianMs).toBeNull();
    for (let i = 20; i < 60; i++) m.add(i * 16.7);
    expect(m.medianMs).toBeCloseTo(16.7, 1);
  });
  it('is not fooled by a few long frames or a pause in the background', () => {
    const m = new FrameMeter(30);
    let t = 0;
    for (let i = 0; i < 80; i++) {
      t += i % 20 === 0 ? 120 : i === 41 ? 5000 : 33;
      m.add(t);
    }
    expect(m.medianMs).toBeCloseTo(33, 0);
  });
});

describe('capabilities in plain words', () => {
  it('says nothing for a fully equipped phone', () => {
    expect(
      capabilityNotes({
        motion: true,
        gyroscope: true,
        compass: true,
        barometer: true,
      }),
    ).toEqual([]);
  });
  it('explains each missing sensor by what changes for the walker', () => {
    const notes = capabilityNotes({
      motion: true,
      gyroscope: false,
      compass: false,
      barometer: false,
    });
    expect(notes).toHaveLength(3);
    expect(notes.join(' ')).toMatch(/floors change from venue beacons/);
    expect(
      capabilityNotes({
        motion: false,
        gyroscope: false,
        compass: false,
        barometer: true,
      }),
    ).toHaveLength(1);
  });
});
