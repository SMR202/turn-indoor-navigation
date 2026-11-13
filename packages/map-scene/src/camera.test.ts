import { describe, expect, it } from 'vitest';
import {
  followCamera,
  previewCourse,
  shortestTurnDeg,
  stepBearing,
  stepTowards,
} from './camera';

// East 20 m, then north 20 m.
const route = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
];
const base = {
  route,
  toManoeuvre: null,
  lastLeg: true,
  heading: null,
  viewportWidth: 390,
};

describe('camera director', () => {
  it('points the map along the route, not the compass', () => {
    const cam = followCamera({ ...base, along: 2, heading: 2.5 });
    expect(cam.courseRad).toBeCloseTo(0); // east
    expect(cam.phase).toBe('cruise');
    expect(cam.pitchDeg).toBe(55);
  });

  it('starts turning before the corner and finishes after it', () => {
    const before = followCamera({ ...base, along: 16, toManoeuvre: 4 });
    // 4 m short of the corner, looking 7 m ahead: already turned part of the way north.
    expect(before.courseRad!).toBeGreaterThan(0.3);
    expect(before.courseRad!).toBeLessThan(Math.PI / 2 - 0.3);
    expect(before.phase).toBe('manoeuvre');
    expect(before.metresPerPixel).toBeLessThan(
      followCamera({ ...base, along: 2 }).metresPerPixel,
    );
    const after = followCamera({ ...base, along: 24 });
    expect(after.courseRad).toBeCloseTo(Math.PI / 2);
  });

  it('settles on the destination, and keeps the last direction at the very end', () => {
    const cam = followCamera({ ...base, along: 36 });
    expect(cam.phase).toBe('arrive');
    expect(cam.pitchDeg).toBe(40);
    expect(followCamera({ ...base, along: 40 }).courseRad).toBeCloseTo(
      Math.PI / 2,
    );
    // The end of a leg that continues on another floor is a manoeuvre, not an arrival.
    expect(
      followCamera({ ...base, along: 36, lastLeg: false, toManoeuvre: 4 })
        .phase,
    ).toBe('manoeuvre');
  });

  it('falls back to the walker’s heading without a route, and looks down in 2D', () => {
    const cam = followCamera({
      ...base,
      route: null,
      along: 0,
      heading: 1.1,
      flat: true,
    });
    expect(cam.courseRad).toBe(1.1);
    expect(cam.pitchDeg).toBe(0);
  });

  it('keeps the scale sensible on very small and very large screens', () => {
    expect(
      followCamera({ ...base, along: 0, viewportWidth: 100 }).metresPerPixel,
    ).toBeLessThanOrEqual(0.09);
    expect(
      followCamera({ ...base, along: 0, viewportWidth: 2000 }).metresPerPixel,
    ).toBeGreaterThanOrEqual(0.018);
  });
});

describe('camera easing', () => {
  it('turns the short way round', () => {
    expect(shortestTurnDeg(350, 10)).toBe(20);
    expect(shortestTurnDeg(10, 350)).toBe(-20);
    expect(stepBearing(350, 10, 16)).toBeGreaterThan(350);
  });
  it('never turns faster than the limit', () => {
    const next = stepBearing(0, 170, 100, 110);
    expect(next).toBeLessThanOrEqual(11.0001);
    expect(next).toBeGreaterThan(0);
  });
  it('reaches the target and stays there', () => {
    let b = 0;
    for (let i = 0; i < 400; i++) b = stepBearing(b, 90, 16);
    expect(b).toBeCloseTo(90, 1);
    let z = 18;
    for (let i = 0; i < 400; i++) z = stepTowards(z, 21, 16);
    expect(z).toBeCloseTo(21, 2);
  });
  it('turns a preview so the route reads bottom to top', () => {
    expect(previewCourse(route)).toBeCloseTo(Math.PI / 4);
    expect(
      previewCourse([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toBeNull();
  });
});
