import { AppState, Platform } from 'react-native';
import type { Observation } from '@turn/contracts';
import {
  GUARDED_PDR_REVISION,
  NavigationEngine,
  type BeaconPlacement,
  type BleTraceRecord,
} from '@turn/positioning-core';
import type { VenuePackage } from '@turn/venue-model';
import { buildFusionMap, nearestAnchor, type P } from './assist-helpers';
import {
  AssistedTracker,
  type BeaconHealth,
  type TrackerEstimate,
} from './assisted-tracker';
import { bleBuildAvailable } from './ble';
import { waitForForeground } from './sensors/foreground';
import { startMotionSource } from './sensors/motion-source';
import { SettledStart } from './sensors/settled-start';

export type LivePhase =
  'idle' | 'starting' | 'settling' | 'tracking' | 'stopped';
export type LiveFix = {
  x: number;
  y: number;
  /** Display uncertainty (metres), never below the fusion floor. */
  sigma: number;
  headingRad: number | null;
  source: TrackerEstimate['source'];
  beaconsUsed: number;
};
export type LiveState = {
  phase: LivePhase;
  /** Seconds left before walking is tracked (hold still, face the route). */
  settling: number;
  fix: LiveFix | null;
  steps: number;
  message: string;
};
/**
 * How sure the start heading is (rad): the walker faced the route, marked their direction, the
 * phone's compass with this venue's learned north offset, or nothing is known (a full circle that
 * walls, doors and beacons narrow down while walking).
 */
export const START_HEADING_SIGMA = {
  route: 0.5,
  chosen: 0.3,
  compass: 0.5,
  unknown: Math.PI,
} as const;
export type LiveStart = {
  /** Where the start heading comes from (default: the route's first direction). */
  facing?: keyof typeof START_HEADING_SIGMA;
  /** Venue heading = this + the phone's yaw (rad); required for `facing: 'compass'`. */
  northOffset?: number;
  /** Start position uncertainty (metres), larger for a beacon fix than for a tap. */
  sigma?: number;
  /** The route being followed on this floor (soft prior and display snapping). */
  route?: P[] | null;
};
/** The phone's heading in the venue frame, and what it says about the venue's north offset. */
export type LiveHeading = {
  /** Venue heading the walker faces (rad, +x counter-clockwise), null while unknown. */
  headingRad: number | null;
  /** Spread of the filter's heading correction (rad). */
  spreadRad: number;
  /** Venue heading minus phone yaw (rad): learn it once and later starts know the heading. */
  northOffset: number | null;
  /** Metres walked in this session, so callers only trust the offset after real walking. */
  walkedMetres: number;
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export type LiveOptions = {
  venue: VenuePackage;
  floorId: string;
  /** Venue beacon layout. Without a measured referenceRssi a beacon is ignored by the fusion. */
  beacons: BeaconPlacement[];
  stepLengthMetres?: number;
  save?: (trace: BleTraceRecord) => void;
};

/** Whether live positioning can run here, and why not. Feature-detected, never assumed. */
export function liveAvailability(
  venue: VenuePackage,
  floorId: string,
): { available: boolean; reason: string | null } {
  if (Platform.OS === 'web')
    return {
      available: false,
      reason: 'Live position needs the TURN app on a phone.',
    };
  if (!venue.anchors.some((a) => a.floorId === floorId))
    return {
      available: false,
      reason:
        'This venue needs at least one entry marker before live position can start.',
    };
  return { available: true, reason: null };
}

/**
 * Live positioning for TURN apps: walking sensors (step detection and heading) are the backbone,
 * the particle filter keeps the walker inside walkable space, and venue beacons correct drift when
 * a layout with reference RSSI is available. Starts from a known point (QR marker or chosen place).
 * Framework-free; screens subscribe to state.
 */
export class LivePositioning {
  private tracker: AssistedTracker | null = null;
  private engine: NavigationEngine | null = null;
  private stopMotion: (() => void) | null = null;
  private listeners = new Set<(s: LiveState) => void>();
  private abort: AbortController | null = null;
  private generation = 0;
  private state: LiveState = {
    phase: 'idle',
    settling: 0,
    fix: null,
    steps: 0,
    message: '',
  };
  private lastStepCount = 0;
  private route: P[] | null = null;
  private lastYaw: number | null = null;
  private facing: LiveStart['facing'] = 'route';

  constructor(private readonly options: LiveOptions) {}

  get beaconCount() {
    return (
      this.tracker?.beaconCount ??
      this.options.beacons.filter((b) => b.referenceRssi !== undefined).length
    );
  }
  snapshot() {
    return this.state;
  }
  subscribe(listener: (s: LiveState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private set(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /**
   * Starts at `start` (venue metres). `headingRad` is the direction the walker faces while the
   * sensors settle (the first route segment, or one they marked), in the venue frame. The filter
   * treats it as approximate and lets walls and doors settle the rest in the first metres.
   */
  async start(start: P, headingRad: number, how: LiveStart = {}) {
    const facing =
      how.facing === 'compass' && how.northOffset === undefined
        ? 'unknown'
        : (how.facing ?? 'route');
    this.facing = facing;
    this.lastYaw = null;
    if (how.route !== undefined) this.route = how.route;
    this.stop();
    const token = ++this.generation;
    const { venue, floorId } = this.options;
    const availability = liveAvailability(venue, floorId);
    if (!availability.available)
      throw new Error(availability.reason ?? 'Live position is unavailable.');
    this.set({
      phase: 'starting',
      settling: 4,
      fix: null,
      steps: 0,
      message: 'Starting sensors…',
    });
    const tracker = new AssistedTracker({
      floorId,
      map: buildFusionMap(venue, floorId),
      placements: this.options.beacons.length
        ? {
            schemaVersion: 1,
            venueId: venue.venueId,
            venueRevision: venue.revision,
            deviceProfile: 'venue-layout',
            beacons: this.options.beacons,
          }
        : null,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      save: this.options.save,
      // iPhones range iBeacons about once a second: a longer window, two packets are enough.
      assist: { windowSeconds: 4, minPackets: 2 },
    });
    this.tracker = tracker;
    tracker.subscribe((e) => {
      if (!e || token !== this.generation) return;
      this.set({
        fix: {
          x: e.x,
          y: e.y,
          sigma: e.displaySigmaMetres,
          headingRad: this.engine?.snapshot().pose?.headingRad ?? null,
          source: e.source,
          beaconsUsed: e.beaconsUsed,
        },
      });
    });
    tracker.setPosition(
      start.x,
      start.y,
      how.sigma ?? 1.2,
      START_HEADING_SIGMA[facing],
    );
    tracker.setRoute(this.route);
    // The step engine is anchored at the nearest venue anchor; the tracker turns its positions
    // into displacements from that point, so any start position works.
    const anchor = nearestAnchor(venue, floorId, start);
    const sessionId = `live-${Date.now()}`;
    const engine = new NavigationEngine(
      venue,
      sessionId,
      this.options.stepLengthMetres ?? 0.62,
      GUARDED_PDR_REVISION,
      'resilient',
    );
    this.engine = engine;
    engine.consume({
      schemaVersion: 1,
      sessionId,
      source: 'known-anchor',
      timestampSeconds: 0,
      type: 'anchor',
      venueId: venue.venueId,
      venueRevision: venue.revision,
      anchorId: anchor.id,
    } satisfies Observation);
    tracker.syncRaw(anchor.position.x, anchor.position.y);
    if (bleBuildAvailable && tracker.beaconCount > 0) await tracker.begin();
    const settled = new SettledStart();
    const abort = new AbortController();
    this.abort = abort;
    try {
      const cleanup = await startMotionSource(
        sessionId,
        (event) => {
          if (token !== this.generation) return;
          if (event.type === 'attitude') this.lastYaw = event.yawRad;
          const north = how.northOffset;
          const s = settled.consume(
            event,
            facing === 'compass' && north !== undefined
              ? (yaw) => wrap(north + yaw)
              : headingRad,
          );
          if (s.alignment) engine.consume(s.alignment);
          const next = engine.consume(event);
          if (next.stopped) {
            this.set({ phase: 'stopped', message: next.message });
            this.stopSensors();
            return;
          }
          if (next.pose && next.steps !== this.lastStepCount) {
            this.lastStepCount = next.steps;
            tracker.walk(next.pose.position.x, next.pose.position.y);
          }
          const phase: LivePhase = s.remaining > 0 ? 'settling' : 'tracking';
          if (
            phase !== this.state.phase ||
            s.remaining !== this.state.settling ||
            next.steps !== this.state.steps
          )
            this.set({
              phase,
              settling: s.remaining,
              steps: next.steps,
              message:
                phase === 'settling'
                  ? facing === 'chosen'
                    ? 'Hold the phone in front of you, facing the way you marked.'
                    : facing === 'route'
                      ? 'Hold the phone in front of you and face along the blue line.'
                      : 'Hold the phone in front of you for a moment.'
                  : (next.warning ?? ''),
            });
        },
        (message) => {
          if (token !== this.generation) return;
          this.set({ phase: 'stopped', message });
          this.stopSensors();
        },
        async () => {
          await waitForForeground(AppState, abort.signal);
        },
      );
      if (token !== this.generation) cleanup();
      else this.stopMotion = cleanup;
    } catch (e) {
      if (token === this.generation) {
        this.set({
          phase: 'stopped',
          message: e instanceof Error ? e.message : String(e),
        });
        this.stopSensors();
      }
      throw e;
    }
  }

  /**
   * Where the phone points in the venue frame (walking-sensor heading corrected by the filter),
   * updated at sensor rate; the heading is null while it is still unknown.
   */
  heading(): LiveHeading | null {
    const pose = this.engine?.snapshot().pose;
    const e = this.tracker?.estimate();
    if (!pose || pose.headingRad === null || !e) return null;
    const venue = wrap(pose.headingRad + e.headingBiasRad);
    const known =
      e.headingBiasSpread < 0.6 ||
      (this.facing !== 'unknown' && this.state.steps < 3);
    return {
      headingRad: known ? venue : null,
      spreadRad: e.headingBiasSpread,
      northOffset: this.lastYaw === null ? null : wrap(venue - this.lastYaw),
      walkedMetres: this.state.steps * (this.options.stepLengthMetres ?? 0.62),
    };
  }

  /** Beacons in the layout and when this phone last heard them (empty without a beacon stream). */
  beaconHealth(): BeaconHealth[] {
    return this.tracker?.health() ?? [];
  }

  /** A trusted correction: the user scanned a marker or confirmed where they are. */
  correct(p: P) {
    this.tracker?.relocate(p.x, p.y, 1.2);
  }
  /** The route now being followed on this floor (after a re-route or a new leg); null clears it. */
  setRoute(route: P[] | null) {
    this.route = route && route.length > 1 ? route : null;
    this.tracker?.setRoute(this.route);
  }

  private stopSensors() {
    this.abort?.abort();
    this.abort = null;
    this.stopMotion?.();
    this.stopMotion = null;
    this.tracker?.finish();
    this.tracker = null;
    this.engine = null;
  }
  stop() {
    this.generation++;
    this.stopSensors();
    this.lastStepCount = 0;
    if (this.state.phase !== 'idle')
      this.set({
        phase: 'idle',
        settling: 0,
        fix: null,
        steps: 0,
        message: '',
      });
  }
}
