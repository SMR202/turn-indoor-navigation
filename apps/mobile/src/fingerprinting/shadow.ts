import { Platform } from 'react-native';
import {
  BLE_PROXIMITY_REVISION,
  DEFAULT_PROXIMITY_CONFIG,
  ProximityDetector,
  bleTraceRecordSchema,
  type BeaconPlacementSet,
  type BleTraceRecord,
  type ProximityEvent,
} from '@turn/positioning-core';
import { startBeaconStream, type StreamSample } from './ble';
import { saveBleTrace } from './storage';

export type ShadowPose = { floorId: string; x: number; y: number };
type StartStream = typeof startBeaconStream;
const MAX_SAMPLES = 60000;
const TICK = 0.5;

export type ShadowRecorder = {
  /** Stops the stream, saves the trace and returns it (null if it never produced a valid record). */
  finish(): BleTraceRecord | null;
  status(): {
    running: boolean;
    samples: number;
    events: number;
    failure: string | null;
  };
};

/**
 * Shadow mode: runs the proximity detector against live beacon samples and records what it
 * would have corrected, next to the navigation estimate, WITHOUT changing the estimate.
 */
export async function startShadowRecording(options: {
  placements: BeaconPlacementSet;
  getEstimate: () => ShadowPose | undefined;
  navigationSessionId?: string;
  start?: StartStream;
  platform?: 'ios' | 'android';
  save?: (trace: BleTraceRecord) => void;
}): Promise<ShadowRecorder> {
  const { placements } = options;
  const start = options.start ?? startBeaconStream;
  const save = options.save ?? saveBleTrace;
  const detector = new ProximityDetector(
    placements.beacons,
    DEFAULT_PROXIMITY_CONFIG,
  );
  const samples: StreamSample[] = [];
  const events: BleTraceRecord['events'] = [];
  const startedAt = new Date().toISOString();
  const startedPerf = performance.now();
  let dropped = 0;
  let latest = 0;
  let nextTick = TICK;
  let failure: string | null = null;
  let finished = false;

  const record = (e: ProximityEvent) => {
    const beacon = placements.beacons.find((b) => b.tag === e.tag)!;
    const estimate = options.getEstimate();
    events.push({
      ...e,
      ...(estimate ? { estimate } : {}),
      beacon: { floorId: beacon.floorId, x: beacon.x, y: beacon.y },
      discrepancyMetres:
        estimate && estimate.floorId === beacon.floorId
          ? Math.hypot(estimate.x - beacon.x, estimate.y - beacon.y)
          : null,
    });
  };
  const advance = (to: number) => {
    while (nextTick <= to) {
      const e = detector.evaluate(nextTick);
      if (e) record(e);
      nextTick += TICK;
    }
  };
  const stop = await start(
    (batch, drop) => {
      dropped += drop;
      for (const s of batch) {
        if (samples.length < MAX_SAMPLES) samples.push(s);
        else dropped++;
        detector.push(s);
        latest = Math.max(latest, s.t);
      }
      advance(latest);
    },
    (message) => {
      failure = message;
    },
  );
  // Silence must still advance the clock so beacons re-arm after the user leaves them.
  const timer = setInterval(
    () =>
      advance(
        Math.max(latest, (performance.now() - startedPerf) / 1000 - 0.75),
      ),
    1000,
  );
  return {
    finish() {
      if (finished) return null;
      finished = true;
      clearInterval(timer);
      stop();
      const parsed = bleTraceRecordSchema.safeParse({
        kind: 'ble-trace',
        schemaVersion: 1,
        sessionId: `ble-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        detectorRevision: BLE_PROXIMITY_REVISION,
        mode: 'shadow',
        ...(options.navigationSessionId
          ? { navigationSessionId: options.navigationSessionId }
          : {}),
        startedAt,
        platform:
          options.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'),
        placements,
        config: detector.config,
        samples,
        events,
        droppedSamples: dropped,
      });
      if (!parsed.success) return null;
      save(parsed.data);
      return parsed.data;
    },
    status: () => ({
      running: !finished,
      samples: samples.length,
      events: events.length,
      failure,
    }),
  };
}

/** Plain-language result of a shadow walk so a tester can see at once what the beacons did. */
export function summarizeTrace(
  trace: BleTraceRecord,
  labelOf: (anchorId: string) => string,
): string {
  const heard = new Map<string, number>();
  for (const s of trace.samples) heard.set(s.tag, (heard.get(s.tag) ?? 0) + 1);
  const heardText = heard.size
    ? `Heard ${[...heard].map(([tag, n]) => `${tag} ×${n}`).join(', ')}.`
    : 'No TURN beacon was heard during this walk.';
  if (trace.events.length === 0)
    return `Beacon shadow log saved (positions unchanged). ${heardText} No beacon came close enough to count as nearby. Check calibration if you passed one.`;
  const lines = trace.events.map((e) => {
    const gap =
      e.discrepancyMetres === null
        ? 'no position estimate to compare'
        : `your estimate was ${e.discrepancyMetres.toFixed(1)} m from it`;
    return `${e.tag} near ${labelOf(e.anchorId)} at ${e.t.toFixed(0)} s: ${gap}`;
  });
  return `Beacon shadow log saved (positions unchanged). ${heardText}\n${lines.join('\n')}`;
}
