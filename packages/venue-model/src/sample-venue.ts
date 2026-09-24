import { parseVenuePackage } from './schema';

/** Original synthetic fixture. Metres are illustrative; this is not a surveyed venue. */
export const sampleVenue = parseVenuePackage({
  schemaVersion: 1,
  venueId: 'turn-demo',
  revision: '1',
  name: 'TURN Demo Hall',
  provenance: {
    kind: 'synthetic',
    rights: 'Original TURN fixture; committed for development and testing.',
    description:
      'Fictional 30 × 20 metre floor. No Centaurus geometry or measurements.',
  },
  frame: {
    units: 'metres',
    axes: 'x-right-y-up',
    originDescription: 'Bottom-left corner of the synthetic floor.',
  },
  floors: [
    {
      id: 'ground',
      label: 'Ground floor',
      level: 0,
      widthMetres: 30,
      heightMetres: 20,
      walkablePolygons: [
        [
          { x: 1, y: 8 },
          { x: 29, y: 8 },
          { x: 29, y: 12 },
          { x: 1, y: 12 },
        ],
        [
          { x: 13, y: 2 },
          { x: 17, y: 2 },
          { x: 17, y: 18 },
          { x: 13, y: 18 },
        ],
      ],
      walls: [
        { from: { x: 1, y: 8 }, to: { x: 13, y: 8 } },
        { from: { x: 17, y: 8 }, to: { x: 29, y: 8 } },
        { from: { x: 1, y: 12 }, to: { x: 13, y: 12 } },
        { from: { x: 17, y: 12 }, to: { x: 29, y: 12 } },
      ],
      doors: [],
    },
  ],
  nodes: [
    { id: 'entrance', floorId: 'ground', x: 3, y: 10 },
    { id: 'junction', floorId: 'ground', x: 15, y: 10 },
    { id: 'cafe', floorId: 'ground', x: 27, y: 10 },
    { id: 'library', floorId: 'ground', x: 15, y: 17 },
    { id: 'help', floorId: 'ground', x: 15, y: 3 },
  ],
  edges: [
    {
      id: 'entry-junction',
      from: 'entrance',
      to: 'junction',
      distanceMetres: 12,
      bidirectional: true,
      stepFree: true,
    },
    {
      id: 'junction-cafe',
      from: 'junction',
      to: 'cafe',
      distanceMetres: 12,
      bidirectional: true,
      stepFree: true,
    },
    {
      id: 'junction-library',
      from: 'junction',
      to: 'library',
      distanceMetres: 7,
      bidirectional: true,
      stepFree: true,
    },
    {
      id: 'junction-help',
      from: 'junction',
      to: 'help',
      distanceMetres: 7,
      bidirectional: true,
      stepFree: true,
    },
  ],
  pois: [
    {
      id: 'poi-cafe',
      name: 'Courtyard Café',
      category: 'Food & drink',
      nodeId: 'cafe',
    },
    {
      id: 'poi-library',
      name: 'Reading Room',
      category: 'Library',
      nodeId: 'library',
    },
    {
      id: 'poi-help',
      name: 'Welcome Desk',
      category: 'Services',
      nodeId: 'help',
    },
  ],
  anchors: [
    {
      id: 'junction-qr',
      venueId: 'turn-demo',
      floorId: 'ground',
      kind: 'qr',
      position: { x: 15, y: 10 },
      label: 'Crossroads',
      nodeId: 'junction',
    },
    {
      id: 'entry-qr',
      venueId: 'turn-demo',
      floorId: 'ground',
      kind: 'qr',
      position: { x: 3, y: 10 },
      label: 'Main entrance',
      nodeId: 'entrance',
    },
  ],
  connectors: [],
  assets: [],
});
