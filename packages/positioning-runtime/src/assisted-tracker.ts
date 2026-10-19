import {
  AssistFusion,
  BLE_PROXIMITY_REVISION,
  DEFAULT_PROXIMITY_CONFIG,
  bleTraceRecordSchema,
  type AssistEstimate,
  type BeaconPlacementSet,
  type BleTraceRecord,
  type FusionMap,
} from '@turn/positioning-core';
import { startBeaconStream, type StreamSample } from './ble';

const TICK_MS = 1000;
const MAX_SAMPLES = 60000;

export type BeaconHealth = {
  tag: string;
  /** Seconds since the last packet, null if never heard this session. */
  silentSeconds: number | null;
  rssi: number | null;
};
export type TrackerEstimate = AssistEstimate;

type Clock = () => number;
export type TrackerOptions = {
  floorId: string;
  map: FusionMap;
  placements: BeaconPlacementSet | null;
  platform: 'ios' | 'android';
  navigationSessionId?: string;
  start?: typeof startBeaconStream;
  now?: Clock;
  /** Where finished traces go (the test app saves them for upload); none by default. */
  save?: (trace: BleTraceRecord) => void;
  seed?: number;
};

/**
 * Live positioning controller (ADR-0009, ADR-0010): runs the beacon stream and the recorder around
 * the shared AssistFusion policy, so live behaviour and offline replay are the same code.
 * Outside React; the screen only subscribes to its estimates.
 */
export class AssistedTracker {
  readonly assist: AssistFusion;
  private readonly samples: StreamSample[] = [];
  private readonly pdrLog: { t: number; x: number; y: number }[] = [];
  private readonly fusedLog: {
    t: number;
    x: number;
    y: number;
    sigma: number;
  }[] = [];
  private readonly events: BleTraceRecord['events'] = [];
  private readonly landmarks: NonNullable<BleTraceRecord['landmarks']> = [];
  private listeners = new Set<(e: TrackerEstimate | null) => void>();
  private stopStream: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private startedIso = '';
  private dropped = 0;
  private failure: string | null = null;
  private finished = false;
  private started = false;
  private lastFusedLog = -Infinity;

  constructor(private readonly options: TrackerOptions) {
    this.assist = new AssistFusion(
      options.map,
      options.placements?.beacons ?? [],
      {},
      options.seed ?? 1,
    );
  }

  get beaconCount() {
    return this.assist.beaconCount;
  }
  get positioned() {
    return this.assist.hasPosition;
  }
  get streamFailure() {
    return this.failure;
  }
  private clock() {
    return (
      (this.options.now ?? (() => performance.now()))() / 1000 - this.startedAt
    );
  }

  /** Starts the beacon stream. Safe to call without placements: walking + map fusion still works. */
  async begin() {
    if (this.started) return;
    this.started = true;
    this.startedAt = (this.options.now ?? (() => performance.now()))() / 1000;
    this.startedIso = new Date().toISOString();
    if (this.assist.beaconCount === 0) return;
    const start = this.options.start ?? startBeaconStream;
    this.stopStream = await start(
      (batch, drop) => {
        this.dropped += drop;
        const at = this.clock();
        for (const s of batch) {
          if (this.samples.length < MAX_SAMPLES) this.samples.push(s);
          else this.dropped++;
          this.assist.addSample(at, s.tag, s.rssi);
        }
      },
      (message) => {
        this.failure = message;
      },
    );
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  subscribe(listener: (e: TrackerEstimate | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish() {
    const e = this.assist.estimate();
    if (!e) return;
    const t = this.clock();
    if (t - this.lastFusedLog >= 1 && this.fusedLog.length < 20000) {
      this.lastFusedLog = t;
      this.fusedLog.push({ t, x: e.x, y: e.y, sigma: e.displaySigmaMetres });
    }
    for (const l of this.listeners) l(e);
  }
  estimate() {
    return this.assist.estimate();
  }

  private tick() {
    if (this.finished) return;
    const { proximity } = this.assist.tick(this.clock());
    if (proximity) {
      this.events.push({
        t: proximity.t,
        tag: proximity.tag,
        anchorId: proximity.anchorId,
        smoothedRssi: proximity.smoothedRssi,
        referenceRssi: proximity.referenceRssi,
        marginDb: proximity.marginDb,
        runnerUp: proximity.runnerUp,
        samplesInWindow: proximity.samplesInWindow,
        estimate: {
          floorId: this.options.floorId,
          x: proximity.before.x,
          y: proximity.before.y,
        },
        beacon: proximity.beacon,
        discrepancyMetres: Math.hypot(
          proximity.before.x - proximity.beacon.x,
          proximity.before.y - proximity.beacon.y,
        ),
      });
    }
    this.publish();
  }

  /**
   * Finds a starting position from beacon readings alone. Waits for the signal window to fill
   * (default 6 s) and returns null when too few beacons were heard.
   */
  async locate(waitMs = 6000): Promise<TrackerEstimate | null> {
    await new Promise((r) => setTimeout(r, waitMs));
    if (!this.assist.locate(this.clock())) return null;
    this.publish();
    return this.assist.estimate();
  }

  /** A trusted position: user tap, QR, confirmed fingerprint, known anchor. */
  setPosition(x: number, y: number, sigma = 1) {
    this.assist.setPosition(x, y, sigma);
    this.publish();
  }
  /** A measured position (fingerprint candidate): blends with the current belief. */
  fixPosition(x: number, y: number, sigma: number) {
    this.assist.fixPosition(x, y, sigma);
    this.publish();
  }

  /** Sets the walking-sensor reference point; later displacements are deltas from it. */
  syncRaw(x: number, y: number) {
    this.assist.syncRaw(x, y);
  }
  /** Feed the raw PDR position each time it changes. */
  walk(x: number, y: number) {
    if (this.pdrLog.length < 20000) this.pdrLog.push({ t: this.clock(), x, y });
    if (this.assist.walk(x, y)) this.publish();
  }
  /** User-confirmed ground truth: "I am at this map point now". Evaluation only; never moves the dot. */
  markLandmark(id: string, x: number, y: number) {
    const e = this.assist.estimate();
    this.landmarks.push({
      t: this.clock(),
      id,
      x,
      y,
      ...(e ? { estimate: { x: e.x, y: e.y } } : {}),
    });
  }

  health(): BeaconHealth[] {
    return this.assist.health(this.clock());
  }

  /** Stops the stream and saves the assisted-navigation trace (null when nothing was recorded). */
  finish(): BleTraceRecord | null {
    if (this.finished) return null;
    this.finished = true;
    if (this.timer) clearInterval(this.timer);
    this.stopStream?.();
    if (
      !this.options.placements ||
      this.fusedLog.length + this.samples.length === 0
    )
      return null;
    const parsed = bleTraceRecordSchema.safeParse({
      kind: 'ble-trace',
      schemaVersion: 1,
      sessionId: `ble-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      detectorRevision: BLE_PROXIMITY_REVISION,
      mode: 'assist',
      ...(this.options.navigationSessionId
        ? { navigationSessionId: this.options.navigationSessionId }
        : {}),
      startedAt: this.startedIso || new Date().toISOString(),
      platform: this.options.platform,
      placements: this.options.placements,
      config: DEFAULT_PROXIMITY_CONFIG,
      samples: this.samples,
      events: this.events,
      droppedSamples: this.dropped,
      pdr: this.pdrLog,
      fused: this.fusedLog,
      ...(this.landmarks.length ? { landmarks: this.landmarks } : {}),
    });
    if (!parsed.success) return null;
    this.options.save?.(parsed.data);
    return parsed.data;
  }
}
