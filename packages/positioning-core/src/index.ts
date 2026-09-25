import { z } from 'zod';
export { evaluateWalk } from './evaluation';
export { diagnoseRecording } from './diagnostics';
import {
  observationSchema,
  type Observation,
  type Pose,
} from '@turn/contracts';
import {
  parseVenuePackage,
  venuePackageSchema,
  type VenuePackage,
} from '@turn/venue-model';
import { StepDetector, wrapAngle, PDR_REVISION } from '@turn/pdr';

const qrSchema = z
  .object({
    kind: z.literal('turn-anchor'),
    schemaVersion: z.literal(1),
    venueId: z.string().min(1),
    venueRevision: z.string().min(1),
    anchorId: z.string().min(1),
  })
  .strict();
export function anchorPayload(venue: VenuePackage, anchorId: string): string {
  if (!venue.anchors.some((anchor) => anchor.id === anchorId))
    throw new Error('Unknown anchor');
  return JSON.stringify({
    kind: 'turn-anchor',
    schemaVersion: 1,
    venueId: venue.venueId,
    venueRevision: venue.revision,
    anchorId,
  });
}
export function resolveAnchorPayload(raw: string, venue: VenuePackage) {
  if (raw.length > 1024)
    throw new Error('QR is too large. Scan a TURN location marker.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'Not a TURN location QR. The Expo launch QR opens the app; scan a location marker inside TURN.',
    );
  }
  const result = qrSchema.safeParse(parsed);
  if (!result.success) throw new Error('Unsupported TURN QR format/version.');
  if (result.data.venueId !== venue.venueId)
    throw new Error('This marker belongs to another venue.');
  if (result.data.venueRevision !== venue.revision)
    throw new Error('Marker and downloaded venue revisions differ.');
  const anchor = venue.anchors.find((item) => item.id === result.data.anchorId);
  if (!anchor) throw new Error('Unknown location marker.');
  return anchor;
}

export type TrackingSnapshot = {
  lastStepAtSeconds?: number;
  pose: Pose | null;
  steps: number;
  distanceMetres: number;
  message: string;
  stopped: boolean;
};
export class NavigationEngine {
  private pose: Pose | null = null;
  private detector = new StepDetector();
  private alignment: number | null = null;
  private yawOrigin: number | null = null;
  private attitude: { time: number; yaw: number; heading: number } | null =
    null;
  private lastByType = new Map<string, number>();
  private steps = 0;
  private lastStepAt: number | undefined;
  private headingHistory: { time: number; heading: number }[] = [];
  private stopped = false;
  private message = 'Scan a TURN location marker.';
  constructor(
    readonly venue: VenuePackage,
    readonly sessionId: string,
    readonly stepLengthMetres: number,
  ) {
    if (
      !Number.isFinite(stepLengthMetres) ||
      stepLengthMetres < 0.3 ||
      stepLengthMetres > 1.2
    )
      throw new Error('Invalid calibrated step length');
  }
  snapshot(): TrackingSnapshot {
    return {
      lastStepAtSeconds: this.lastStepAt,
      pose: this.pose
        ? { ...this.pose, position: { ...this.pose.position } }
        : null,
      steps: this.steps,
      distanceMetres: this.steps * this.stepLengthMetres,
      message: this.message,
      stopped: this.stopped,
    };
  }
  private stop(reason: string) {
    this.stopped = true;
    this.message = reason;
    if (this.pose)
      this.pose = {
        ...this.pose,
        status: 'lost',
        horizontalUncertaintyMetres: null,
      };
  }
  consume(input: Observation): TrackingSnapshot {
    const observation = observationSchema.parse(input);
    if (observation.sessionId !== this.sessionId)
      throw new Error('Observation session mismatch');
    if (observation.type === 'anchor') {
      const anchor = resolveAnchorPayload(
        JSON.stringify({
          kind: 'turn-anchor',
          schemaVersion: 1,
          venueId: observation.venueId,
          venueRevision: observation.venueRevision,
          anchorId: observation.anchorId,
        }),
        this.venue,
      );
      this.pose = {
        schemaVersion: 1,
        sessionId: this.sessionId,
        source: 'turn-anchor',
        timestampSeconds: observation.timestampSeconds,
        venueId: this.venue.venueId,
        venueRevision: this.venue.revision,
        floorId: anchor.floorId,
        position: { ...anchor.position },
        headingRad: null,
        horizontalUncertaintyMetres: null,
        status: 'anchored',
      };
      this.detector = new StepDetector();
      this.alignment = null;
      this.yawOrigin = null;
      this.attitude = null;
      this.headingHistory = [];
      this.steps = 0;
      this.lastStepAt = undefined;
      this.stopped = false;
      this.lastByType.clear();
      this.message = 'Location established. Align heading before walking.';
      return this.snapshot();
    }
    if (!this.pose || this.stopped) return this.snapshot();
    if (observation.type === 'capability') {
      if (observation.status !== 'available') this.stop(observation.reason);
      return this.snapshot();
    }
    const previous = this.lastByType.get(observation.type) ?? -Infinity;
    if (observation.timestampSeconds <= previous) {
      this.stop('Sensor clock reversed/repeated. Re-anchor.');
      return this.snapshot();
    }
    this.lastByType.set(observation.type, observation.timestampSeconds);
    if (observation.type === 'heading-alignment') {
      if (this.steps > 0) {
        this.stop('Re-anchor before changing heading.');
        return this.snapshot();
      }
      this.alignment = observation.headingRad;
      this.yawOrigin = null;
    }
    if (observation.type === 'attitude' && this.alignment !== null) {
      if (observation.tiltRad > Math.PI / 3) {
        this.stop('Hold phone screen-up below 60° tilt; re-anchor.');
        return this.snapshot();
      }
      if (
        this.attitude &&
        (observation.timestampSeconds - this.attitude.time > 0.4 ||
          Math.abs(wrapAngle(observation.yawRad - this.attitude.yaw)) > 0.8)
      ) {
        this.stop('Heading gap/jump detected; re-anchor.');
        return this.snapshot();
      }
      this.yawOrigin ??= observation.yawRad;
      const heading = wrapAngle(
        this.alignment + wrapAngle(observation.yawRad - this.yawOrigin),
      );
      this.attitude = {
        time: observation.timestampSeconds,
        yaw: observation.yawRad,
        heading,
      };
      this.pose = {
        ...this.pose,
        headingRad: heading,
        timestampSeconds: observation.timestampSeconds,
      };
      this.headingHistory.push({ time: observation.timestampSeconds, heading });
      this.headingHistory = this.headingHistory.filter(
        (item) => observation.timestampSeconds - item.time <= 2,
      );
    }
    if (
      observation.type === 'accelerometer' &&
      observation.includesGravity &&
      this.alignment !== null
    ) {
      const detected = this.detector.update(
        observation.timestampSeconds,
        Math.hypot(...observation.values),
      );
      if (detected.issue) this.stop(detected.issue);
      if (detected.stepAt !== null) {
        const stepTime = detected.stepAt;
        const stepHeading = this.headingHistory.reduce<{
          time: number;
          heading: number;
        } | null>(
          (nearest, item) =>
            !nearest ||
            Math.abs(item.time - stepTime) < Math.abs(nearest.time - stepTime)
              ? item
              : nearest,
          null,
        );
        if (!stepHeading || Math.abs(stepTime - stepHeading.time) > 0.2)
          this.stop('Heading unavailable/stale at step; re-anchor.');
        else {
          const heading = stepHeading.heading;
          this.steps++;
          this.lastStepAt = detected.stepAt;
          this.pose = {
            ...this.pose,
            source: PDR_REVISION,
            timestampSeconds: observation.timestampSeconds,
            headingRad: heading,
            position: {
              x:
                this.pose.position.x +
                this.stepLengthMetres * Math.cos(heading),
              y:
                this.pose.position.y +
                this.stepLengthMetres * Math.sin(heading),
            },
            status: 'degraded',
            horizontalUncertaintyMetres: null,
          };
          this.message = 'Experimental PDR · accuracy unmeasured';
          if (this.steps * this.stepLengthMetres >= 30)
            this.stop(
              '30m experimental tracking limit; re-anchor to limit drift.',
            );
        }
      }
    }
    return this.snapshot();
  }
}

export const recordingSchema = z.object({
  nativePedometer: z
    .object({
      status: z.enum([
        'preparing',
        'ready',
        'collecting',
        'unavailable',
        'denied',
        'error',
        'stopped',
        'querying',
        'complete',
      ]),
      source: z.string(),
      message: z.string(),
      startedAtUnixMs: z.number().nullable(),
      endedAtUnixMs: z.number().nullable(),
      turnStepsAtStart: z.number().int().nonnegative(),
      liveSteps: z.number().int().nonnegative().nullable(),
      queriedSteps: z.number().int().nonnegative().nullable(),
      updates: z
        .array(
          z.object({
            receivedAfterStartSeconds: z.number().nonnegative(),
            steps: z.number().int().nonnegative(),
          }),
        )
        .max(10000),
    })
    .optional(),
  labels: z
    .object({
      mode: z.enum(['walk', 'stationary']),
      activity: z
        .enum([
          'walking',
          'still',
          'phone-bobbing',
          'phone-rotation',
          'typing',
          'walking-in-place',
        ])
        .optional(),
      pace: z.enum(['normal', 'brisk', 'slow', 'unspecified']),
      manualSteps: z.number().int().min(0).max(10000).nullable(),
      phoneModel: z.string().max(100),
      notes: z.string().max(1000),
    })
    .optional(),
  test: z
    .object({
      courseId: z.string().min(1),
      completedAtMarkedEndpoint: z.boolean(),
    })
    .optional(),
  venue: venuePackageSchema.optional(),
  schemaVersion: z.literal(1),
  algorithm: z.literal(PDR_REVISION),
  sessionId: z.string().min(1),
  stepLengthMetres: z.number().min(0.3).max(1.2),
  metadata: z.object({
    platform: z.string(),
    osVersion: z.string(),
    timestampBasis: z.literal('native-boot-seconds-minus-session-origin'),
    note: z.string(),
    acquisitionProtocol: z.string().optional(),
  }),
  observations: z.array(observationSchema).max(100000),
});
export type Recording = z.infer<typeof recordingSchema>;
export function replayRecording(input: unknown, venueInput: unknown) {
  const recording = recordingSchema.parse(input);
  const engine = new NavigationEngine(
    parseVenuePackage(venueInput),
    recording.sessionId,
    recording.stepLengthMetres,
  );
  for (const observation of recording.observations) engine.consume(observation);
  return engine.snapshot();
}
