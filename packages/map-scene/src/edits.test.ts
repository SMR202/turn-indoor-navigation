import { describe, expect, it } from 'vitest';
import { lightMap } from '@turn/design';
import { calculateRoute } from '@turn/routing';
import { demoCentre, venuePackageSchema } from '@turn/venue-model';
import { applyVenueEdits, joinNode } from './edits';
import { buildScene } from './scene';

describe('Studio map edits', () => {
  it('returns the package unchanged without edits', () => {
    expect(applyVenueEdits(demoCentre, undefined)).toBe(demoCentre);
    expect(applyVenueEdits(demoCentre, { places: {}, rooms: {} })).toBe(
      demoCentre,
    );
  });

  it('adds a routable place joined to the walk graph', () => {
    const pkg = applyVenueEdits(demoCentre, {
      customPlaces: [
        {
          id: 'custom-water',
          floorId: 'ground',
          x: 20,
          y: 18,
          name: 'Water fountain',
          category: 'service',
        },
      ],
    });
    expect(() => venuePackageSchema.parse(pkg)).not.toThrow();
    const poi = pkg.pois.find((p) => p.id === 'custom-water')!;
    const scene = buildScene(pkg, 'ground', lightMap);
    const place = scene.places.find((p) => p.id === 'custom-water')!;
    expect(place).toMatchObject({ name: 'Water fountain', x: 20, y: 18 });
    const route = calculateRoute(pkg, 'hall', poi.nodeId);
    expect(route.status).toBe('ok');
  });

  it('moves a place and routes to its new position', () => {
    const pkg = applyVenueEdits(demoCentre, {
      places: { 'poi-cafe': { position: { x: 8, y: 28 } } },
    });
    const poi = pkg.pois.find((p) => p.id === 'poi-cafe')!;
    expect(poi.nodeId).toBe('edit-poi-cafe');
    const route = calculateRoute(pkg, 'hall', poi.nodeId);
    if (route.status !== 'ok') throw new Error(route.status);
    expect(route.route.geometry.at(-1)).toMatchObject({ x: 8, y: 28 });
    // The original geometry is untouched.
    expect(demoCentre.pois.find((p) => p.id === 'poi-cafe')!.nodeId).toBe(
      'cafe',
    );
  });

  it('joins through a door, not through a wall', () => {
    // Nearest nodes are corridor nodes behind the corridor wall; the room's own node is reachable.
    const near = joinNode(demoCentre, 'ground', { x: 16.2, y: 22 });
    expect(near?.node.id).toBe('books');
    expect(near?.clear).toBe(true);
  });

  it('renames rooms and keeps routes out of restricted rooms', () => {
    const pkg = applyVenueEdits(demoCentre, {
      rooms: {
        cafe: { restricted: true },
        books: { name: 'Book Exchange' },
      },
    });
    const ground = pkg.floors.find((f) => f.id === 'ground')!;
    expect(ground.rooms.find((r) => r.id === 'books')!.name).toBe(
      'Book Exchange',
    );
    expect(calculateRoute(pkg, 'hall', 'cafe').status).toBe('unreachable');
    expect(calculateRoute(pkg, 'hall', 'books').status).toBe('ok');
  });
});
