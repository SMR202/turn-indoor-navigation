import type { VenuePackage } from '@turn/venue-model';
import { pointInPolygon, type P } from './scene';

/**
 * Map edits a venue team makes in TURN Studio, stored in venue content beside the geometry (the
 * floor plan from TURN-Mapper stays untouched): places moved or added, rooms renamed, staff-only
 * rooms that routes must not pass through.
 */
export type VenueEdits = {
  places?: Record<string, { position?: P } | undefined>;
  customPlaces?: {
    id: string;
    floorId: string;
    x: number;
    y: number;
    name: string;
    category: string;
  }[];
  rooms?: Record<string, { name?: string; restricted?: boolean } | undefined>;
};

/** Segments ab and cd cross (touching at an end does not count). */
function crosses(a: P, b: P, c: P, d: P) {
  const o = (p: P, q: P, r: P) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}

/**
 * The walk-graph node a new point joins: the nearest one on the floor that can be reached in a
 * straight line without crossing a wall, else simply the nearest.
 */
export function joinNode(
  pkg: VenuePackage,
  floorId: string,
  p: P,
  avoid: Set<string> = new Set(),
) {
  const floor = pkg.floors.find((f) => f.id === floorId);
  const candidates = pkg.nodes
    .filter((n) => n.floorId === floorId && !avoid.has(n.id))
    .map((n) => ({ n, d: Math.hypot(n.x - p.x, n.y - p.y) }))
    .sort((a, b) => a.d - b.d);
  const clear = candidates
    .slice(0, 24)
    .find(({ n }) => !floor?.walls.some((w) => crosses(p, n, w.from, w.to)));
  const pick = clear ?? candidates[0];
  return pick ? { node: pick.n, distance: pick.d, clear: !!clear } : null;
}

/**
 * Applies Studio map edits to a venue package, returning a new package for drawing, search and
 * routing. Moved and added places get their own walk-graph node joined to the nearest reachable
 * node; edges inside restricted rooms are removed so routes go around them.
 */
export function applyVenueEdits(
  pkg: VenuePackage,
  edits: VenueEdits | undefined,
): VenuePackage {
  if (!edits) return pkg;
  const moved = Object.entries(edits.places ?? {}).filter(
    (e): e is [string, { position: P }] => !!e[1]?.position,
  );
  const added = edits.customPlaces ?? [];
  const rooms = edits.rooms ?? {};
  const roomEdits = Object.keys(rooms).length > 0;
  if (!moved.length && !added.length && !roomEdits) return pkg;

  const floors = pkg.floors.map((f) => ({
    ...f,
    rooms: f.rooms.map((r) => {
      const name = rooms[r.id]?.name?.trim();
      return name ? { ...r, name } : r;
    }),
  }));
  // Nodes inside restricted rooms: their edges go, so routes pass around the room.
  const restricted = new Set<string>();
  for (const f of pkg.floors)
    for (const r of f.rooms)
      if (rooms[r.id]?.restricted)
        for (const n of pkg.nodes)
          if (n.floorId === f.id && pointInPolygon(n, r.polygon))
            restricted.add(n.id);
  const nodes = [...pkg.nodes];
  const edges = pkg.edges.filter(
    (e) => !restricted.has(e.from) && !restricted.has(e.to),
  );
  const nodeById = new Map(pkg.nodes.map((n) => [n.id, n]));
  const join = (id: string, floorId: string, p: P) => {
    const near = joinNode(pkg, floorId, p, restricted);
    const nodeId = `edit-${id}`;
    nodes.push({ id: nodeId, floorId, x: p.x, y: p.y });
    if (near)
      edges.push({
        id: `edit-${id}-join`,
        from: nodeId,
        to: near.node.id,
        distanceMetres: Math.max(0.05, near.distance),
        bidirectional: true,
        stepFree: true,
      });
    return nodeId;
  };
  const pois = pkg.pois.map((poi) => {
    const p = edits.places?.[poi.id]?.position;
    const floorId = nodeById.get(poi.nodeId)?.floorId;
    if (!p || !floorId) return poi;
    return { ...poi, nodeId: join(poi.id, floorId, p) };
  });
  const floorIds = new Set(pkg.floors.map((f) => f.id));
  for (const c of added) {
    if (!floorIds.has(c.floorId)) continue;
    pois.push({
      id: c.id,
      name: c.name,
      category: c.category,
      nodeId: join(c.id, c.floorId, c),
    });
  }
  return { ...pkg, floors, nodes, edges, pois };
}
