import { z } from 'zod';
import { BLE_BEACON_ID } from './fingerprints';

export const BLE_PROXIMITY_REVISION = 'ble-proximity-v1' as const;
const id = z.string().min(1).max(160);
const finite = z.number().finite();

/** Where a TURN beacon is physically mounted. RSSI reference is measured about 1 m from the beacon on the same phone model that will scan. */
export const beaconPlacementSchema = z.object({
  tag: z.string().regex(BLE_BEACON_ID),
  /** Optional links to named venue points; placements set on the map need only floor and coordinates. */
  anchorId: id.optional(),
  nodeId: id.optional(),
  floorId: id,
  x: finite,
  y: finite,
  /** Path-loss exponent (about 2 in free space, 2-3.5 indoors); the fusion default applies when absent. */
  exponent: finite.min(1.5).max(4).optional(),
  /** Median RSSI (dBm) one metre from the beacon, measured with the scanning phone. Required for proximity decisions. */
  referenceRssi: finite.min(-110).max(0).optional(),
  calibratedAt: z.string().datetime().optional(),
});
export type BeaconPlacement = z.infer<typeof beaconPlacementSchema>;
export const beaconPlacementSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    venueId: id,
    venueRevision: id,
    deviceProfile: id,
    beacons: z.array(beaconPlacementSchema).max(32),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.beacons.map((b) => b.tag)).size !== s.beacons.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate beacon tags.' });
  });
export type BeaconPlacementSet = z.infer<typeof beaconPlacementSetSchema>;

export type BleStreamSample = { t: number; tag: string; rssi: number };
export type ProximityConfig = {
  windowSeconds: number;
  minSamples: number;
  /** Near when the smoothed RSSI is at least reference − nearDeltaDb. */
  nearDeltaDb: number;
  /** The nearest beacon must beat the runner-up (or silence) by this margin. */
  marginDb: number;
  holdSeconds: number;
  /** Re-arm after the smoothed RSSI falls below reference − releaseDeltaDb or another beacon becomes nearest. */
  releaseDeltaDb: number;
};
export const DEFAULT_PROXIMITY_CONFIG: ProximityConfig = {
  windowSeconds: 2,
  minSamples: 3,
  nearDeltaDb: 8,
  marginDb: 6,
  holdSeconds: 1,
  releaseDeltaDb: 14,
};

export type ProximityEvent = {
  t: number;
  tag: string;
  anchorId: string;
  smoothedRssi: number;
  referenceRssi: number;
  marginDb: number | null;
  runnerUp: string | null;
  samplesInWindow: number;
};

function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/**
 * Deterministic passive-proximity detector. Test labels, PDR and routes never enter it.
 * Beacons without a calibrated reference are ignored: absolute RSSI differs by phone, beacon and mounting.
 */
export class ProximityDetector {
  private readonly buffers = new Map<string, { t: number; rssi: number }[]>();
  private readonly placements = new Map<string, BeaconPlacement>();
  private candidate: { tag: string; since: number } | null = null;
  private armed = new Set<string>();
  private lastTime = -Infinity;
  constructor(
    placements: BeaconPlacement[],
    readonly config: ProximityConfig = DEFAULT_PROXIMITY_CONFIG,
  ) {
    for (const p of placements)
      if (p.referenceRssi !== undefined) {
        this.placements.set(p.tag, p);
        this.armed.add(p.tag);
      }
  }

  push(sample: BleStreamSample) {
    if (
      !this.placements.has(sample.tag) ||
      !Number.isFinite(sample.t) ||
      !Number.isFinite(sample.rssi)
    )
      return;
    const list = this.buffers.get(sample.tag) ?? [];
    list.push({ t: sample.t, rssi: sample.rssi });
    this.buffers.set(sample.tag, list);
  }

  /** Evaluate at monotonic time `now`; emits at most one entry event. */
  evaluate(now: number): ProximityEvent | null {
    if (now < this.lastTime) return null;
    this.lastTime = now;
    const { windowSeconds, minSamples } = this.config;
    const smoothed: { tag: string; rssi: number; n: number }[] = [];
    for (const [tag, list] of this.buffers) {
      while (list.length && list[0]!.t < now - windowSeconds) list.shift();
      if (list.length >= minSamples)
        smoothed.push({
          tag,
          rssi: median(list.map((s) => s.rssi)),
          n: list.length,
        });
    }
    // Re-arm beacons that are no longer near or no longer heard.
    for (const [tag, placement] of this.placements) {
      const s = smoothed.find((v) => v.tag === tag);
      if (!s || s.rssi < placement.referenceRssi! - this.config.releaseDeltaDb)
        this.armed.add(tag);
    }
    smoothed.sort((a, b) => b.rssi - a.rssi);
    const best = smoothed[0];
    if (!best) {
      this.candidate = null;
      return null;
    }
    const placement = this.placements.get(best.tag)!;
    const runner = smoothed[1] ?? null;
    const margin = runner ? best.rssi - runner.rssi : null;
    const near =
      best.rssi >= placement.referenceRssi! - this.config.nearDeltaDb;
    const clear = margin === null || margin >= this.config.marginDb;
    if (!near || !clear) {
      this.candidate = null;
      return null;
    }
    if (this.candidate?.tag !== best.tag)
      this.candidate = { tag: best.tag, since: now };
    if (now - this.candidate.since < this.config.holdSeconds) return null;
    if (!this.armed.has(best.tag)) return null;
    this.armed.delete(best.tag);
    return {
      t: now,
      tag: best.tag,
      anchorId: placement.anchorId ?? placement.tag,
      smoothedRssi: best.rssi,
      referenceRssi: placement.referenceRssi!,
      marginDb: margin,
      runnerUp: runner?.tag ?? null,
      samplesInWindow: best.n,
    };
  }
}

const poseSchema = z.object({ floorId: id, x: finite, y: finite });
/** Shadow trace: what beacons would have corrected, recorded without changing the navigation estimate. */
export const bleTraceRecordSchema = z
  .object({
    kind: z.literal('ble-trace'),
    schemaVersion: z.literal(1),
    sessionId: z.string().regex(/^ble-trace-[a-z0-9-]+$/),
    detectorRevision: z.literal(BLE_PROXIMITY_REVISION),
    mode: z.enum(['shadow', 'assist']),
    navigationSessionId: id.optional(),
    startedAt: z.string().datetime(),
    platform: z.enum(['ios', 'android']),
    placements: beaconPlacementSetSchema,
    config: z.object({
      windowSeconds: finite.positive(),
      minSamples: finite.positive(),
      nearDeltaDb: finite,
      marginDb: finite,
      holdSeconds: finite,
      releaseDeltaDb: finite,
    }),
    /** Raw TURN-beacon samples, bounded; t is seconds on the stream's monotonic clock. */
    samples: z
      .array(
        z.object({
          t: finite.min(0),
          tag: z.string().regex(BLE_BEACON_ID),
          rssi: finite.min(-127).max(20),
        }),
      )
      .max(60000),
    events: z
      .array(
        z.object({
          t: finite.min(0),
          tag: z.string().regex(BLE_BEACON_ID),
          anchorId: id,
          smoothedRssi: finite,
          referenceRssi: finite,
          marginDb: finite.nullable(),
          runnerUp: z.string().nullable(),
          samplesInWindow: finite,
          /** Navigation estimate at the event; absent when no pose existed. */
          estimate: poseSchema.optional(),
          /** Known beacon position. */
          beacon: poseSchema,
          /** Estimate-to-beacon distance in metres, same floor only. */
          discrepancyMetres: finite.nullable(),
        }),
      )
      .max(2000),
    droppedSamples: finite.nonnegative(),
    /** Raw walking-sensor positions (assist mode), for offline replay and tuning. */
    pdr: z
      .array(z.object({ t: finite.min(0), x: finite, y: finite }))
      .max(20000)
      .optional(),
    /** User-confirmed ground-truth marks (evaluation only; they never move the estimate). */
    landmarks: z
      .array(
        z.object({
          t: finite.min(0),
          id: id,
          x: finite,
          y: finite,
          estimate: z.object({ x: finite, y: finite }).optional(),
        }),
      )
      .max(500)
      .optional(),
    /** Fused estimate over time (assist mode). */
    fused: z
      .array(
        z.object({
          t: finite.min(0),
          x: finite,
          y: finite,
          sigma: finite.nonnegative(),
        }),
      )
      .max(20000)
      .optional(),
  })
  .superRefine((r, ctx) => {
    if (
      r.samples.some((s, i) => i > 0 && s.t < r.samples[i - 1]!.t - 1e-6) ||
      r.events.some((e, i) => i > 0 && e.t < r.events[i - 1]!.t)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Trace times must not decrease.',
      });
  });
export type BleTraceRecord = z.infer<typeof bleTraceRecordSchema>;

/** Replays a trace's raw samples through the detector; used to verify recorded events and to retune thresholds offline. */
export function replayBleTrace(
  trace: BleTraceRecord,
  config: ProximityConfig = trace.config,
  tickSeconds = 0.5,
): ProximityEvent[] {
  const detector = new ProximityDetector(trace.placements.beacons, config);
  const events: ProximityEvent[] = [];
  let next = tickSeconds;
  for (const sample of trace.samples) {
    while (sample.t >= next) {
      const e = detector.evaluate(next);
      if (e) events.push(e);
      next += tickSeconds;
    }
    detector.push(sample);
  }
  const end = (trace.samples.at(-1)?.t ?? 0) + tickSeconds;
  while (next <= end) {
    const e = detector.evaluate(next);
    if (e) events.push(e);
    next += tickSeconds;
  }
  return events;
}
