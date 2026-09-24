import { z } from 'zod';

export const idSchema = z.string().min(1).max(120);
export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
const headingSchema = z.number().finite().min(-Math.PI).max(Math.PI);
export const anchorSchema = z.object({
  id: idSchema,
  venueId: idSchema,
  floorId: idSchema,
  kind: z.enum(['qr', 'manual', 'nfc', 'ble', 'visual']),
  position: pointSchema,
  orientationRad: headingSchema.optional(),
  label: z.string().min(1),
});

const envelope = {
  schemaVersion: z.literal(1),
  sessionId: idSchema,
  timestampSeconds: z.number().finite().nonnegative(),
  source: idSchema,
};
const vectorSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

/** Normalized inputs. Raw units, source clocks and calibration remain in capture manifests. */
export const observationSchema = z.discriminatedUnion('type', [
  z.object({
    ...envelope,
    type: z.literal('attitude'),
    yawRad: headingSchema,
    tiltRad: z.number().min(0).max(Math.PI),
    units: z.literal('rad'),
    frame: z.literal('session-relative'),
  }),
  z.object({
    ...envelope,
    type: z.literal('heading-alignment'),
    headingRad: headingSchema,
    frame: z.literal('venue'),
  }),
  z.object({
    ...envelope,
    type: z.literal('accelerometer'),
    values: vectorSchema,
    units: z.literal('m/s2'),
    frame: z.literal('device'),
    includesGravity: z.boolean(),
  }),
  z.object({
    ...envelope,
    type: z.literal('gyroscope'),
    values: vectorSchema,
    units: z.literal('rad/s'),
    frame: z.literal('device'),
  }),
  z.object({
    ...envelope,
    type: z.literal('magnetometer'),
    values: vectorSchema,
    units: z.literal('uT'),
    frame: z.literal('device'),
    calibrated: z.boolean(),
  }),
  z.object({
    ...envelope,
    type: z.literal('pressure'),
    value: z.number().positive(),
    units: z.literal('hPa'),
  }),
  z.object({
    ...envelope,
    type: z.literal('anchor'),
    venueId: idSchema,
    venueRevision: idSchema,
    anchorId: idSchema,
  }),
  z.object({
    ...envelope,
    type: z.literal('capability'),
    capability: idSchema,
    status: z.enum(['available', 'unavailable', 'denied', 'degraded']),
    reason: z.string(),
  }),
]);

export const poseSchema = z.object({
  ...envelope,
  venueId: idSchema,
  venueRevision: idSchema,
  floorId: idSchema,
  position: pointSchema,
  headingRad: headingSchema.nullable(),
  horizontalUncertaintyMetres: z.number().finite().nonnegative().nullable(),
  status: z.enum(['anchored', 'tracking', 'degraded', 'lost']),
});

export const routeSchema = z.object({
  schemaVersion: z.literal(1),
  venueId: idSchema,
  venueRevision: idSchema,
  sourceNodeId: idSchema,
  destinationNodeId: idSchema,
  stepFree: z.boolean(),
  distanceMetres: z.number().finite().nonnegative(),
  nodeIds: z.array(idSchema).min(1),
  geometry: z.array(pointSchema.extend({ floorId: idSchema })).min(1),
  instructions: z.array(
    z.object({
      kind: z.enum(['depart', 'continue', 'floor-transition', 'arrive']),
      nodeId: idSchema,
      floorId: idSchema,
      text: z.string(),
    }),
  ),
});

export type Point = z.infer<typeof pointSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Pose = z.infer<typeof poseSchema>;
export type Route = z.infer<typeof routeSchema>;

/** Both acquisition and replay will implement this boundary; no native imports here. */
export interface ObservationSource {
  subscribe(consume: (observation: Observation) => void): () => void;
}
export interface LocalizationEngine {
  reset(): void;
  consume(observation: Observation): Pose | null;
}
