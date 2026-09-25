import { z } from 'zod';
import { anchorSchema, idSchema, pointSchema } from '@turn/contracts';

const floorSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  level: z.number().int(),
  widthMetres: z.number().positive(),
  heightMetres: z.number().positive(),
  windows: z
    .array(
      z.object({
        from: pointSchema,
        to: pointSchema,
        label: z.string().optional(),
      }),
    )
    .default([]),
  rooms: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        polygon: z.array(pointSchema).min(3),
        labelPosition: pointSchema,
        dimensionLabel: z.string().optional(),
        kind: z
          .enum(['room', 'circulation', 'outdoor', 'stairs', 'fixture'])
          .default('room'),
        note: z.string().optional(),
      }),
    )
    .default([]),
  walkablePolygons: z.array(z.array(pointSchema).min(3)).min(1),
  walls: z.array(z.object({ from: pointSchema, to: pointSchema })),
  doors: z.array(
    z.object({
      id: idSchema,
      position: pointSchema,
      widthMetres: z.number().positive(),
    }),
  ),
});
const nodeSchema = pointSchema.extend({ id: idSchema, floorId: idSchema });
const edgeSchema = z.object({
  id: idSchema,
  from: idSchema,
  to: idSchema,
  distanceMetres: z.number().finite().positive(),
  bidirectional: z.boolean(),
  stepFree: z.boolean(),
  connectorId: idSchema.optional(),
});
const baseSchema = z.object({
  schemaVersion: z.literal(1),
  venueId: idSchema,
  revision: idSchema,
  name: z.string().min(1),
  provenance: z.object({
    kind: z.enum(['synthetic', 'surveyed', 'plan-derived']),
    rights: z.string().min(1),
    description: z.string(),
    sourceSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    notes: z.array(z.string()).default([]),
  }),
  frame: z.object({
    units: z.literal('metres'),
    axes: z.literal('x-right-y-up'),
    originDescription: z.string().min(1),
  }),
  floors: z.array(floorSchema).min(1),
  nodes: z.array(nodeSchema).min(1),
  edges: z.array(edgeSchema),
  pois: z.array(
    z.object({
      id: idSchema,
      name: z.string().min(1),
      category: z.string(),
      nodeId: idSchema,
    }),
  ),
  anchors: z.array(anchorSchema.extend({ nodeId: idSchema })),
  testCourses: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        anchorId: idSchema,
        headingRad: z.number().min(-Math.PI).max(Math.PI),
        points: z.array(pointSchema).min(2),
        setup: z.string().min(1),
      }),
    )
    .default([]),
  connectors: z.array(
    z.object({
      id: idSchema,
      kind: z.enum(['stairs', 'lift', 'escalator', 'ramp']),
      nodeIds: z.array(idSchema).min(2),
    }),
  ),
  assets: z
    .array(
      z.object({
        id: idSchema,
        kind: z.enum(['map', 'magnetic', 'ble']),
        path: z.string().regex(/^(?!\/)(?!.*\.\.)[a-zA-Z0-9_./-]+$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .default([]),
});

export const venuePackageSchema = baseSchema.superRefine((venue, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  for (const [kind, items] of Object.entries({
    floors: venue.floors,
    nodes: venue.nodes,
    edges: venue.edges,
    pois: venue.pois,
    anchors: venue.anchors,
    connectors: venue.connectors,
    assets: venue.assets,
  })) {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      issue(`Duplicate ${kind} ID`);
  }
  const floors = new Map(venue.floors.map((floor) => [floor.id, floor]));
  const nodes = new Map(venue.nodes.map((node) => [node.id, node]));
  const connectors = new Map(
    venue.connectors.map((connector) => [connector.id, connector]),
  );
  for (const node of venue.nodes) {
    const floor = floors.get(node.floorId);
    if (!floor) issue(`Unknown floor for node ${node.id}`);
    else if (
      node.x < 0 ||
      node.y < 0 ||
      node.x > floor.widthMetres ||
      node.y > floor.heightMetres
    )
      issue(`Node ${node.id} outside floor bounds`);
  }
  for (const edge of venue.edges) {
    const from = nodes.get(edge.from),
      to = nodes.get(edge.to);
    if (!from || !to) {
      issue(`Unknown endpoint for edge ${edge.id}`);
      continue;
    }
    if (edge.from === edge.to) issue(`Self edge ${edge.id}`);
    const connector = edge.connectorId
      ? connectors.get(edge.connectorId)
      : undefined;
    if (edge.connectorId && !connector)
      issue(`Unknown connector on ${edge.id}`);
    if (from.floorId !== to.floorId && !connector)
      issue(`Cross-floor edge ${edge.id} requires a connector`);
    if (
      connector &&
      (!connector.nodeIds.includes(edge.from) ||
        !connector.nodeIds.includes(edge.to))
    )
      issue(`Connector endpoints disagree on ${edge.id}`);
    if (
      connector &&
      ['stairs', 'escalator'].includes(connector.kind) &&
      edge.stepFree
    )
      issue(`Connector ${connector.id} is not step-free`);
    if (
      from.floorId === to.floorId &&
      edge.distanceMetres + 0.001 < Math.hypot(to.x - from.x, to.y - from.y)
    )
      issue(`Edge ${edge.id} shorter than geometry`);
  }
  for (const connector of venue.connectors) {
    if (new Set(connector.nodeIds).size !== connector.nodeIds.length)
      issue(`Duplicate connector node ${connector.id}`);
    if (connector.nodeIds.some((id) => !nodes.has(id)))
      issue(`Unknown node on connector ${connector.id}`);
  }
  for (const poi of venue.pois)
    if (!nodes.has(poi.nodeId)) issue(`Unknown POI node ${poi.id}`);
  for (const anchor of venue.anchors) {
    const node = nodes.get(anchor.nodeId);
    if (
      anchor.venueId !== venue.venueId ||
      !node ||
      node.floorId !== anchor.floorId ||
      node.x !== anchor.position.x ||
      node.y !== anchor.position.y
    )
      issue(`Anchor ${anchor.id} does not match its venue/node`);
  }
  for (const floor of venue.floors) {
    for (const room of floor.rooms) {
      if (
        room.polygon.some(
          (p) =>
            p.x < 0 ||
            p.y < 0 ||
            p.x > floor.widthMetres ||
            p.y > floor.heightMetres,
        )
      )
        issue(`Room ${room.id} outside floor bounds`);
    }
  }
  for (const course of venue.testCourses) {
    const anchor = venue.anchors.find((a) => a.id === course.anchorId);
    if (
      !anchor ||
      Math.hypot(
        anchor.position.x - course.points[0]!.x,
        anchor.position.y - course.points[0]!.y,
      ) > 0.001
    )
      issue(`Test course ${course.id} must start at its anchor`);
    const floor = floors.get(anchor?.floorId ?? '');
    if (
      floor &&
      course.points.some(
        (p) =>
          p.x < 0 ||
          p.y < 0 ||
          p.x > floor.widthMetres ||
          p.y > floor.heightMetres,
      )
    )
      issue(`Test course ${course.id} outside floor bounds`);
  }
});

export type VenuePackage = z.infer<typeof venuePackageSchema>;
export function parseVenuePackage(input: unknown): VenuePackage {
  return venuePackageSchema.parse(input);
}
