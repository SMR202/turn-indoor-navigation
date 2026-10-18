import { parseVenuePackage } from './schema';

/**
 * Fictional public demo venue (Plan 003): a 64 x 36 m single-floor centre with a central corridor,
 * shops, food, restrooms, services and stairs. Generated from a room list so geometry, doors and the
 * walk graph stay consistent. Synthetic: for product demos and tests only, never accuracy claims.
 */
type RoomSpec = {
  id: string;
  name: string;
  category: string;
  x0: number;
  x1: number;
};
const W = 64,
  H = 36;
const corridor = { y0: 15, y1: 21 };
const north: RoomSpec[] = [
  { id: 'cafe', name: 'Harbour Café', category: 'food', x0: 6, x1: 16 },
  { id: 'books', name: 'Page & Spine Books', category: 'shop', x0: 16, x1: 26 },
  { id: 'pharmacy', name: 'Pharmacy', category: 'health', x0: 26, x1: 34 },
  {
    id: 'meeting',
    name: 'Meeting Room A',
    category: 'meeting',
    x0: 34,
    x1: 44,
  },
  { id: 'studio', name: 'Design Studio', category: 'room', x0: 44, x1: 56 },
];
const south: RoomSpec[] = [
  { id: 'info', name: 'Information Desk', category: 'service', x0: 6, x1: 14 },
  { id: 'restrooms', name: 'Restrooms', category: 'restroom', x0: 14, x1: 21 },
  { id: 'market', name: 'Fresh Market', category: 'food', x0: 21, x1: 33 },
  {
    id: 'outfitters',
    name: 'North Outfitters',
    category: 'shop',
    x0: 33,
    x1: 44,
  },
  { id: 'stairs', name: 'Stairs & Lift', category: 'stairs', x0: 44, x1: 50 },
  { id: 'lounge', name: 'Quiet Lounge', category: 'room', x0: 50, x1: 56 },
];
const DOOR = 1.6;
type P = { x: number; y: number };
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function build() {
  const rooms: {
    id: string;
    name: string;
    polygon: P[];
    labelPosition: P;
    kind: 'room' | 'circulation' | 'outdoor' | 'stairs';
  }[] = [];
  const walls: { from: P; to: P }[] = [];
  const doors: { id: string; position: P; widthMetres: number }[] = [];
  const nodes: { id: string; floorId: string; x: number; y: number }[] = [];
  const edges: {
    id: string;
    from: string;
    to: string;
    distanceMetres: number;
    bidirectional: boolean;
    stepFree: boolean;
  }[] = [];
  const pois: { id: string; name: string; category: string; nodeId: string }[] =
    [];
  const dist = (a: P, b: P) =>
    Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;
  const edge = (a: string, b: string, stepFree = true) => {
    const na = nodes.find((n) => n.id === a)!,
      nb = nodes.find((n) => n.id === b)!;
    edges.push({
      id: `${a}--${b}`,
      from: a,
      to: b,
      distanceMetres: dist(na, nb),
      bidirectional: true,
      stepFree,
    });
  };

  // Entrance hall (west) and the central corridor.
  rooms.push({
    id: 'entrance-hall',
    name: 'Entrance Hall',
    polygon: rect(0, 9, 6, 27),
    labelPosition: { x: 3, y: 24.5 },
    kind: 'circulation',
  });
  rooms.push({
    id: 'corridor',
    name: 'Main Concourse',
    polygon: rect(6, corridor.y0, 56, corridor.y1),
    labelPosition: { x: 31, y: 18 },
    kind: 'circulation',
  });
  rooms.push({
    id: 'east-terrace',
    name: 'East Terrace',
    polygon: rect(56, 9, 64, 27),
    labelPosition: { x: 60, y: 18 },
    kind: 'outdoor',
  });

  // Outer shell walls (with the main entrance gap on the west and a terrace door on the east).
  walls.push(
    { from: { x: 0, y: 9 }, to: { x: 0, y: 16 } },
    { from: { x: 0, y: 20 }, to: { x: 0, y: 27 } },
  );
  walls.push(
    { from: { x: 0, y: 27 }, to: { x: 6, y: 27 } },
    { from: { x: 0, y: 9 }, to: { x: 6, y: 9 } },
  );
  walls.push(
    { from: { x: 6, y: 27 }, to: { x: 6, y: 34 } },
    { from: { x: 6, y: 9 }, to: { x: 6, y: 2 } },
  );
  walls.push(
    { from: { x: 6, y: 34 }, to: { x: 56, y: 34 } },
    { from: { x: 6, y: 2 }, to: { x: 56, y: 2 } },
  );
  walls.push(
    { from: { x: 56, y: 34 }, to: { x: 56, y: 21 } },
    { from: { x: 56, y: 2 }, to: { x: 56, y: 15 } },
  );
  walls.push({ from: { x: 56, y: 21 }, to: { x: 56, y: 19 } }); // terrace door gap 17-19
  walls.push(
    { from: { x: 6, y: 21 }, to: { x: 6, y: 27 } },
    { from: { x: 6, y: 9 }, to: { x: 6, y: 15 } },
  );
  doors.push({
    id: 'main-entrance',
    position: { x: 0, y: 18 },
    widthMetres: 4,
  });
  doors.push({
    id: 'terrace-door',
    position: { x: 56, y: 17 },
    widthMetres: 2,
  });

  nodes.push({ id: 'entrance', floorId: 'ground', x: 1.5, y: 18 });
  nodes.push({ id: 'hall', floorId: 'ground', x: 4, y: 18 });
  edge('entrance', 'hall');
  pois.push({
    id: 'poi-entrance',
    name: 'Main Entrance',
    category: 'exit',
    nodeId: 'entrance',
  });

  const corridorNodes: { id: string; x: number }[] = [{ id: 'hall', x: 4 }];
  const addSide = (list: RoomSpec[], side: 'north' | 'south') => {
    for (const r of list) {
      const wallY = side === 'north' ? corridor.y1 : corridor.y0;
      const farY = side === 'north' ? 34 : 2;
      const cx = (r.x0 + r.x1) / 2;
      const cy = (wallY + farY) / 2;
      rooms.push({
        id: r.id,
        name: r.name,
        polygon:
          side === 'north'
            ? rect(r.x0, wallY, r.x1, farY)
            : rect(r.x0, farY, r.x1, wallY),
        labelPosition: { x: cx, y: cy },
        kind: r.category === 'stairs' ? 'stairs' : 'room',
      });
      // Corridor wall with a door gap centred on the room, and the partition on the room's east side.
      walls.push({
        from: { x: r.x0, y: wallY },
        to: { x: cx - DOOR / 2, y: wallY },
      });
      walls.push({
        from: { x: cx + DOOR / 2, y: wallY },
        to: { x: r.x1, y: wallY },
      });
      if (r.x1 < 56)
        walls.push({ from: { x: r.x1, y: wallY }, to: { x: r.x1, y: farY } });
      doors.push({
        id: `${r.id}-door`,
        position: { x: cx, y: wallY },
        widthMetres: DOOR,
      });
      const cNode = `c-${side}-${r.id}`;
      nodes.push({ id: cNode, floorId: 'ground', x: cx, y: 18 });
      nodes.push({ id: r.id, floorId: 'ground', x: cx, y: cy });
      corridorNodes.push({ id: cNode, x: cx });
      edge(cNode, r.id, r.category !== 'stairs');
      pois.push({
        id: `poi-${r.id}`,
        name: r.name,
        category: r.category,
        nodeId: r.id,
      });
    }
  };
  addSide(north, 'north');
  addSide(south, 'south');
  nodes.push({ id: 'terrace', floorId: 'ground', x: 60, y: 18 });
  nodes.push({ id: 'c-east', floorId: 'ground', x: 55, y: 18 });
  corridorNodes.push({ id: 'c-east', x: 55 });
  corridorNodes.sort((a, b) => a.x - b.x);
  for (let i = 1; i < corridorNodes.length; i++)
    edge(corridorNodes[i - 1]!.id, corridorNodes[i]!.id);
  // Terrace through its door at (56, 17-19): approach along y = 18.
  edge('c-east', 'terrace');
  pois.push({
    id: 'poi-terrace',
    name: 'East Terrace',
    category: 'outdoor',
    nodeId: 'terrace',
  });

  return parseVenuePackage({
    schemaVersion: 1,
    venueId: 'turn-demo-centre',
    revision: '1',
    name: 'TURN Demo Centre',
    provenance: {
      kind: 'synthetic',
      rights: 'Original TURN fixture; committed for product demos and tests.',
      description:
        'Fictional 64 × 36 m single-floor centre generated from a room list. Not a real building.',
    },
    frame: {
      units: 'metres',
      axes: 'x-right-y-up',
      originDescription: 'South-west corner of the fictional site.',
    },
    floors: [
      {
        id: 'ground',
        label: 'Ground floor',
        level: 0,
        widthMetres: W,
        heightMetres: H,
        rooms,
        walkablePolygons: rooms.map((r) => r.polygon),
        walls,
        doors,
      },
    ],
    nodes,
    edges,
    pois,
    anchors: [
      {
        id: 'entrance-qr',
        venueId: 'turn-demo-centre',
        floorId: 'ground',
        kind: 'qr',
        position: { x: 1.5, y: 18 },
        label: 'Main Entrance',
        nodeId: 'entrance',
      },
      {
        id: 'info-qr',
        venueId: 'turn-demo-centre',
        floorId: 'ground',
        kind: 'qr',
        position: { x: 10, y: 18 },
        label: 'Information Desk',
        nodeId: 'c-south-info',
      },
    ],
    testCourses: [],
    connectors: [],
    assets: [],
  });
}

export const demoCentre = build();
