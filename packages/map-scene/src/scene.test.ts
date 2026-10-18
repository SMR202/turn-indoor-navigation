import { describe, expect, it } from 'vitest';
import { lightMap } from '@turn/design';
import { demoCentre } from '@turn/venue-model';
import {
  buildScene,
  fitCamera,
  inferPlaceCategory,
  placeLabels,
  pointAlong,
  polylineLength,
  projectOnPolyline,
  roundedRoutePath,
  splitRoute,
  ICON_PATHS,
} from './index';
import { placeCategories } from '@turn/design';

const scene = buildScene(demoCentre, 'ground', lightMap);

describe('scene', () => {
  it('styles rooms by kind, links places to rooms and computes bounds', () => {
    const cafe = scene.rooms.find((r) => r.id === 'cafe')!;
    expect(cafe.fill).toBe(lightMap.room);
    expect(cafe.casts).toBe(true);
    expect(cafe.category).toBe('food');
    expect(scene.rooms.find((r) => r.id === 'corridor')!.fill).toBe(
      lightMap.circulation,
    );
    expect(scene.rooms.find((r) => r.id === 'east-terrace')!.casts).toBe(false);
    expect(scene.places.find((p) => p.id === 'poi-restrooms')!.roomId).toBe(
      'restrooms',
    );
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, maxX: 64, maxY: 36 });
  });
  it('infers categories from names when the venue only says "room"', () => {
    expect(inferPlaceCategory('Bath · rear', 'room')).toBe('restroom');
    expect(inferPlaceCategory('Kitchen', 'room')).toBe('food');
    expect(inferPlaceCategory('Entrance lobby', 'circulation')).toBe('exit');
    expect(inferPlaceCategory('Lounge', 'room')).toBe('room');
    expect(inferPlaceCategory('Café', 'food')).toBe('food');
  });
  it('has an icon for every category', () => {
    for (const c of Object.values(placeCategories))
      expect(ICON_PATHS[c.icon]).toBeDefined();
  });
});

describe('labels', () => {
  it('shows more labels as you zoom in and never overlaps them', () => {
    const far = placeLabels(scene, 5);
    const near = placeLabels(scene, 25);
    expect(near.length).toBeGreaterThan(far.length);
    const boxes = near.map((l) => {
      const w = (l.text.length * l.size * 0.56 + 6) / 25,
        h = (l.size * 1.3) / 25;
      return {
        x0: l.x - w / 2,
        x1: l.x + w / 2,
        y0: l.y - h / 2,
        y1: l.y + h / 2,
      };
    });
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!,
          b = boxes[j]!;
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(
          false,
        );
      }
    expect(near.find((l) => l.id === 'cafe')?.icon).toBe('food');
  });
});

describe('route helpers', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ];
  it('projects, splits and walks along a route', () => {
    expect(polylineLength(line)).toBe(15);
    expect(projectOnPolyline(line, { x: 4, y: 1 })).toMatchObject({
      along: 4,
      distance: 1,
    });
    const { walked, remaining } = splitRoute(line, { x: 10.5, y: 2 });
    expect(walked.at(-1)).toEqual({ x: 10, y: 2 });
    expect(remaining[0]).toEqual({ x: 10, y: 2 });
    expect(pointAlong(line, 12)).toMatchObject({ x: 10, y: 2 });
    expect(pointAlong(line, 99)).toMatchObject({ x: 10, y: 5 });
  });
  it('rounds corners into a valid SVG path and fits the camera', () => {
    const path = roundedRoutePath(line);
    expect(path.startsWith('M 0 0')).toBe(true);
    expect(path).toContain('Q 10 0');
    const cam = fitCamera(
      scene.bounds,
      { width: 400, height: 800 },
      { top: 80, bottom: 200 },
    );
    expect(cam.scale).toBeCloseTo((400 - 32) / 64, 5);
    expect(cam.focusY).toBeGreaterThan(80);
  });
});
