import { parseVenuePackage } from './schema';

/**
 * Fictional public demo venue (Plan 003): a 64 x 36 m centre with two floors. Each floor has a
 * central corridor with rooms either side; a stairs-and-lift core joins them. Generated from room
 * lists so geometry, doors and the walk graph stay consistent. Synthetic: for product demos and
 * tests only, never accuracy claims.
 */
type RoomSpec = {
  id: string;
  name: string;
  category: string;
  x0: number;
  x1: number;
};
type P = { x: number; y: number };
type Room = {
  id: string;
  name: string;
  polygon: P[];
  labelPosition: P;
  kind: 'room' | 'circulation' | 'outdoor' | 'stairs';
};
type Node = { id: string; floorId: string; x: number; y: number };
type Edge = {
  id: string;
  from: string;
  to: string;
  distanceMetres: number;
  bidirectional: boolean;
  stepFree: boolean;
  connectorId?: string;
};
type Poi = { id: string; name: string; category: string; nodeId: string };

const W = 64,
  H = 36;
const corridor = { y0: 15, y1: 21 };
const DOOR = 1.6;
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const dist = (a: P, b: P) =>
  Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;

const groundNorth: RoomSpec[] = [
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
const groundSouth: RoomSpec[] = [
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
const upperNorth: RoomSpec[] = [
  { id: 'l1-food-court', name: 'Food Court', category: 'food', x0: 6, x1: 22 },
  {
    id: 'l1-cinema',
    name: 'Harbour Cinema',
    category: 'other',
    x0: 22,
    x1: 38,
  },
  {
    id: 'l1-play',
    name: 'Kids Play Zone',
    category: 'other',
    x0: 38,
    x1: 48,
  },
  { id: 'l1-gym', name: 'Fitness Club', category: 'other', x0: 48, x1: 56 },
];
const upperSouth: RoomSpec[] = [
  {
    id: 'l1-restrooms',
    name: 'Restrooms L1',
    category: 'restroom',
    x0: 6,
    x1: 13,
  },
  {
    id: 'l1-family',
    name: 'Family Room',
    category: 'service',
    x0: 13,
    x1: 21,
  },
  {
    id: 'l1-electronics',
    name: 'Volt Electronics',
    category: 'shop',
    x0: 21,
    x1: 33,
  },
  {
    id: 'l1-optics',
    name: 'Clear Optics',
    category: 'health',
    x0: 33,
    x1: 44,
  },
  {
    id: 'l1-stairs',
    name: 'Stairs & Lift',
    category: 'stairs',
    x0: 44,
    x1: 50,
  },
  {
    id: 'l1-community',
    name: 'Community Hall',
    category: 'meeting',
    x0: 50,
    x1: 56,
  },
];

/** One floor: corridor, rooms on both sides with doors, and the corridor walk graph. */
function buildFloor(
  floorId: string,
  corridorName: string,
  north: RoomSpec[],
  south: RoomSpec[],
  prefix: string,
) {
  const rooms: Room[] = [];
  const walls: { from: P; to: P }[] = [];
  const doors: { id: string; position: P; widthMetres: number }[] = [];
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const pois: Poi[] = [];
  const node = (id: string, x: number, y: number) =>
    nodes.push({ id, floorId, x, y });
  const edge = (a: string, b: string) => {
    const na = nodes.find((n) => n.id === a)!,
      nb = nodes.find((n) => n.id === b)!;
    edges.push({
      id: `${a}--${b}`,
      from: a,
      to: b,
      distanceMetres: dist(na, nb),
      bidirectional: true,
      stepFree: true,
    });
  };
  rooms.push({
    id: `${prefix}corridor`,
    name: corridorName,
    polygon: rect(6, corridor.y0, 56, corridor.y1),
    labelPosition: { x: 31, y: 18 },
    kind: 'circulation',
  });
  walls.push(
    { from: { x: 6, y: 34 }, to: { x: 56, y: 34 } },
    { from: { x: 6, y: 2 }, to: { x: 56, y: 2 } },
    { from: { x: 56, y: 34 }, to: { x: 56, y: 21 } },
    { from: { x: 56, y: 2 }, to: { x: 56, y: 15 } },
    { from: { x: 6, y: 21 }, to: { x: 6, y: 34 } },
    { from: { x: 6, y: 2 }, to: { x: 6, y: 15 } },
  );
  const corridorNodes: { id: string; x: number }[] = [];
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
      const cNode = `${prefix}c-${side}-${r.id.replace(prefix, '')}`;
      node(cNode, cx, 18);
      node(r.id, cx, cy);
      corridorNodes.push({ id: cNode, x: cx });
      edge(cNode, r.id);
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
  return { rooms, walls, doors, nodes, edges, pois, corridorNodes, node, edge };
}

function build() {
  // Ground floor: entrance hall (west), terrace (east) and the main concourse.
  const g = buildFloor(
    'ground',
    'Main Concourse',
    groundNorth,
    groundSouth,
    '',
  );
  g.rooms.unshift({
    id: 'entrance-hall',
    name: 'Entrance Hall',
    polygon: rect(0, 9, 6, 27),
    labelPosition: { x: 3, y: 24.5 },
    kind: 'circulation',
  });
  g.rooms.push({
    id: 'east-terrace',
    name: 'East Terrace',
    polygon: rect(56, 9, 64, 27),
    labelPosition: { x: 60, y: 18 },
    kind: 'outdoor',
  });
  // Replace the plain west/east shell pieces with the entrance hall and terrace openings.
  g.walls.splice(
    0,
    g.walls.length,
    ...g.walls.filter(
      (w) => !(w.from.x === w.to.x && (w.from.x === 6 || w.from.x === 56)),
    ),
  );
  g.walls.unshift(
    { from: { x: 0, y: 9 }, to: { x: 0, y: 16 } },
    { from: { x: 0, y: 20 }, to: { x: 0, y: 27 } },
    { from: { x: 0, y: 27 }, to: { x: 6, y: 27 } },
    { from: { x: 0, y: 9 }, to: { x: 6, y: 9 } },
    { from: { x: 6, y: 27 }, to: { x: 6, y: 34 } },
    { from: { x: 6, y: 9 }, to: { x: 6, y: 2 } },
    { from: { x: 56, y: 34 }, to: { x: 56, y: 21 } },
    { from: { x: 56, y: 2 }, to: { x: 56, y: 15 } },
    { from: { x: 56, y: 21 }, to: { x: 56, y: 19 } }, // terrace door gap 17-19
    { from: { x: 6, y: 21 }, to: { x: 6, y: 27 } },
    { from: { x: 6, y: 9 }, to: { x: 6, y: 15 } },
  );
  g.doors.unshift(
    { id: 'main-entrance', position: { x: 0, y: 18 }, widthMetres: 4 },
    { id: 'terrace-door', position: { x: 56, y: 17 }, widthMetres: 2 },
  );
  g.node('entrance', 1.5, 18);
  g.node('hall', 4, 18);
  g.edge('entrance', 'hall');
  g.pois.unshift({
    id: 'poi-entrance',
    name: 'Main Entrance',
    category: 'exit',
    nodeId: 'entrance',
  });
  g.corridorNodes.push({ id: 'hall', x: 4 });
  g.node('terrace', 60, 18);
  g.node('c-east', 55, 18);
  g.corridorNodes.push({ id: 'c-east', x: 55 });
  g.corridorNodes.sort((a, b) => a.x - b.x);
  for (let i = 1; i < g.corridorNodes.length; i++)
    g.edge(g.corridorNodes[i - 1]!.id, g.corridorNodes[i]!.id);
  // Terrace through its door at (56, 17-19): approach along y = 18.
  g.edge('c-east', 'terrace');
  g.pois.push({
    id: 'poi-terrace',
    name: 'East Terrace',
    category: 'outdoor',
    nodeId: 'terrace',
  });

  // Level 1: closed shell above the main building.
  const u = buildFloor('level-1', 'Upper Mall', upperNorth, upperSouth, 'l1-');
  u.walls.push({ from: { x: 6, y: 15 }, to: { x: 6, y: 21 } });
  u.walls.push({ from: { x: 56, y: 15 }, to: { x: 56, y: 21 } });
  u.corridorNodes.sort((a, b) => a.x - b.x);
  for (let i = 1; i < u.corridorNodes.length; i++)
    u.edge(u.corridorNodes[i - 1]!.id, u.corridorNodes[i]!.id);
  // The stairs-and-lift core is reached by the floor's own route; Level 1 has no separate place for it.
  u.pois.splice(
    u.pois.findIndex((p) => p.id === 'poi-l1-stairs'),
    1,
  );

  // Vertical core: stairs (not step-free) and a lift (step-free) between the two core rooms.
  const edges: Edge[] = [
    ...g.edges,
    ...u.edges,
    {
      id: 'core-stairs-up',
      from: 'stairs',
      to: 'l1-stairs',
      distanceMetres: 9,
      bidirectional: true,
      stepFree: false,
      connectorId: 'core-stairs',
    },
    {
      id: 'core-lift-up',
      from: 'stairs',
      to: 'l1-stairs',
      distanceMetres: 14,
      bidirectional: true,
      stepFree: true,
      connectorId: 'core-lift',
    },
  ];

  return parseVenuePackage({
    schemaVersion: 1,
    venueId: 'turn-demo-centre',
    revision: '2',
    name: 'TURN Demo Centre',
    provenance: {
      kind: 'synthetic',
      rights: 'Original TURN fixture; committed for product demos and tests.',
      description:
        'Fictional 64 × 36 m two-floor centre generated from room lists. Not a real building.',
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
        rooms: g.rooms,
        walkablePolygons: g.rooms.map((r) => r.polygon),
        walls: g.walls,
        doors: g.doors,
      },
      {
        id: 'level-1',
        label: 'Level 1',
        level: 1,
        widthMetres: W,
        heightMetres: H,
        rooms: u.rooms,
        walkablePolygons: u.rooms.map((r) => r.polygon),
        walls: u.walls,
        doors: u.doors,
      },
    ],
    nodes: [...g.nodes, ...u.nodes],
    edges,
    pois: [...g.pois, ...u.pois],
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
      {
        id: 'upper-qr',
        venueId: 'turn-demo-centre',
        floorId: 'level-1',
        kind: 'qr',
        position: { x: 47, y: 18 },
        label: 'Level 1 lift lobby',
        nodeId: 'l1-c-south-stairs',
      },
    ],
    testCourses: [],
    connectors: [
      { id: 'core-stairs', kind: 'stairs', nodeIds: ['stairs', 'l1-stairs'] },
      { id: 'core-lift', kind: 'lift', nodeIds: ['stairs', 'l1-stairs'] },
    ],
    assets: [],
  });
}

export const demoCentre = build();
