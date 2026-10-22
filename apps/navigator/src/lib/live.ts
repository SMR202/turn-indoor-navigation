import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { BeaconPlacement } from '@turn/positioning-core';
import {
  LivePositioning,
  liveAvailability,
  locateWithBeacons,
  type LiveHeading,
  type LiveStart,
  type LiveState,
} from '@turn/positioning-runtime';
import type { VenuePackage } from '@turn/venue-model';
import { postJson } from './api';
import { load, save } from './storage';

type P = { x: number; y: number };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** What screens re-render for: phase changes and messages, not every step. */
export type LiveStatus = {
  phase: LiveState['phase'];
  settling: number;
  message: string;
  /** Display uncertainty (metres, rounded to 0.5 m). */
  sigma: number | null;
  beaconsUsed: number;
};
const statusOf = (s: LiveState): LiveStatus => ({
  phase: s.phase,
  settling: s.settling,
  message: s.message,
  sigma: s.fix ? Math.round(s.fix.sigma * 2) / 2 : null,
  beaconsUsed: s.fix?.beaconsUsed ?? 0,
});
const sameStatus = (a: LiveStatus | null, b: LiveStatus) =>
  a !== null &&
  a.phase === b.phase &&
  a.settling === b.settling &&
  a.message === b.message &&
  a.sigma === b.sigma &&
  a.beaconsUsed === b.beaconsUsed;

export type LiveFloorStart = {
  /** Venue heading the walker faces (rad), when known from the route or a marked direction. */
  heading?: number | null;
  /** Where that heading came from; without one the compass (or nothing) is used. */
  facing?: 'route' | 'chosen';
  route?: P[] | null;
  sigma?: number;
};

/**
 * The venue's live position session: one continuously running blue dot from the moment the walker
 * is located (venue beacons, a marked spot, a TURN code or the start of a route) until they leave
 * the venue screen, through browsing, route previews and navigation. It restarts itself after the
 * app returns from the background, and learns how this venue's map is turned against the phone's
 * compass so later starts know the heading without asking.
 */
export function useLiveSession(
  pkg: VenuePackage,
  venueId: string,
  /** Every floor's beacon placements (with reference RSSI where known). */
  placements: BeaconPlacement[],
) {
  const ref = useRef<LivePositioning | null>(null);
  const [state, setState] = useState<LiveStatus | null>(null);
  const fixListeners = useRef(new Set<(s: LiveState) => void>());
  const [floorId, setFloorId] = useState<string | null>(null);
  const northKey = `north-${venueId}-${Platform.OS}`;
  const [north, setNorth] = useState<number | null>(() =>
    load<number | null>(northKey, null),
  );
  const lastFix = useRef<{ p: P; floorId: string } | null>(null);
  const restarts = useRef<number[]>([]);
  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  const availableOn = useCallback(
    (f: string) => liveAvailability(pkg, f),
    [pkg],
  );
  const stop = useCallback(() => {
    ref.current?.stop();
    ref.current = null;
    setState(null);
    setFloorId(null);
  }, []);

  /** Blends a measured north offset into this venue's (circular mean, weight 0–1). */
  const learnNorth = useCallback(
    (offset: number, weight: number) => {
      const prev = load<number | null>(northKey, null);
      const next =
        prev === null ? offset : wrap(prev + weight * wrap(offset - prev));
      save(northKey, next);
      setNorth(next);
    },
    [northKey],
  );
  const start = useCallback(
    async (from: P, onFloor: string, how: LiveFloorStart = {}) => {
      ref.current?.stop();
      const live = new LivePositioning({
        venue: pkg,
        floorId: onFloor,
        beacons: placementsRef.current.filter((b) => b.floorId === onFloor),
      });
      ref.current = live;
      setFloorId(onFloor);
      // A marked direction is the surest heading there is: learn the compass offset from it as
      // soon as the sensors settle, so the next start (and auto-locate) knows the direction.
      let learnFromMark = how.facing === 'chosen';
      lastFix.current = { p: from, floorId: onFloor };
      live.subscribe((s) => {
        if (ref.current !== live) return;
        if (s.fix) lastFix.current = { p: s.fix, floorId: onFloor };
        if (learnFromMark && s.phase === 'tracking') {
          const h = live.heading();
          if (h?.northOffset != null) {
            learnFromMark = false;
            learnNorth(h.northOffset, 0.7);
          }
        }
        for (const l of fixListeners.current) l(s);
        const next = statusOf(s);
        setState((prev) => (sameStatus(prev, next) ? prev : next));
      });
      const learned = load<number | null>(northKey, null);
      const options: LiveStart =
        how.facing && how.heading != null
          ? { facing: how.facing, route: how.route, sigma: how.sigma }
          : learned !== null
            ? {
                facing: 'compass',
                northOffset: learned,
                route: how.route,
                sigma: how.sigma,
              }
            : { facing: 'unknown', route: how.route, sigma: how.sigma };
      try {
        await live.start(from, how.heading ?? 0, options);
      } catch {
        // The controller already published a stopped state with the reason.
      }
    },
    [pkg, northKey, learnNorth],
  );

  // While walking, refine it whenever walls, doors and beacons have pinned the heading down.
  const running =
    state !== null && state.phase !== 'idle' && state.phase !== 'stopped';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const h = ref.current?.heading();
      if (
        !h ||
        h.northOffset === null ||
        h.spreadRad > 0.25 ||
        h.walkedMetres < 8
      )
        return;
      learnNorth(h.northOffset, 0.15);
    }, 3000);
    return () => clearInterval(timer);
  }, [running, learnNorth]);

  // Sensors stop in the background: resume from the last position when the app is back.
  useEffect(() => {
    if (state?.phase !== 'stopped') return;
    // A missing permission or sensor does not fix itself by retrying.
    if (/permission|denied|unavailable|lacks|needs/i.test(state.message))
      return;
    const last = lastFix.current;
    if (!last) return;
    const now = Date.now();
    restarts.current = restarts.current.filter((t) => now - t < 60000);
    if (restarts.current.length >= 3) return;
    const resume = () => {
      restarts.current.push(Date.now());
      void start(last.p, last.floorId, { sigma: 2.5 });
    };
    if (AppState.currentState === 'active') {
      const t = setTimeout(resume, 800);
      return () => clearTimeout(t);
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resume();
    });
    return () => sub.remove();
  }, [state?.phase, state?.message, start]);

  useEffect(() => () => ref.current?.stop(), []);

  // A beacon added, moved or calibrated while live: continue from here with the new layout.
  const layoutKey = placements
    .map(
      (b) =>
        `${b.tag}:${b.floorId}:${b.x.toFixed(1)}:${b.y.toFixed(1)}:${b.referenceRssi ?? ''}`,
    )
    .join('|');
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    const last = lastFix.current;
    if (!ref.current || !last) return;
    void start(last.p, last.floorId, { sigma: 1.5 });
  }, [layoutKey]);

  // Beacon health for the venue: every 30 s, the beacons this phone heard recently and how strongly.
  // Anonymous (no session, no position) and only with "Share anonymous usage" on.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (!load('prefs', { shareUsage: true }).shareUsage) return;
      const heard = (ref.current?.beaconHealth() ?? []).filter(
        (b) =>
          b.silentSeconds !== null && b.silentSeconds < 30 && b.rssi !== null,
      );
      if (heard.length)
        void postJson(
          '/public/beacon-reports',
          heard.map((b) => ({
            venueId: pkg.venueId,
            tag: b.tag,
            rssi: b.rssi,
          })),
        ).catch(() => undefined);
    }, 30000);
    return () => clearInterval(timer);
  }, [running, pkg.venueId]);

  const correct = useCallback(
    (p: P, sigma?: number) => ref.current?.correct(p, sigma),
    [],
  );
  /** Rooms the walker is probably in, most likely first. */
  const roomBelief = useCallback(() => ref.current?.roomBelief() ?? [], []);
  /** Median RSSI per beacon the filter is using now. */
  const readings = useCallback(() => ref.current?.readings() ?? [], []);
  /** Every filter update (each step or fix), outside React; returns the unsubscribe function. */
  const onFix = useCallback((listener: (s: LiveState) => void) => {
    fixListeners.current.add(listener);
    return () => {
      fixListeners.current.delete(listener);
    };
  }, []);
  const setRoute = useCallback(
    (route: P[] | null) => ref.current?.setRoute(route),
    [],
  );
  const heading = useCallback(
    (): LiveHeading | null => ref.current?.heading() ?? null,
    [],
  );
  const usable = useMemo(
    () => placements.filter((b) => b.referenceRssi !== undefined),
    [placements],
  );
  /** Beacon-only position, when the venue has at least two beacons with a reference RSSI. */
  const canLocate = Platform.OS !== 'web' && usable.length >= 2;
  const locate = useCallback(
    (waitMs = 6000) => locateWithBeacons(pkg, placementsRef.current, waitMs),
    [pkg],
  );
  return {
    state,
    floorId,
    running,
    north,
    availableOn,
    start,
    stop,
    correct,
    roomBelief,
    readings,
    onFix,
    setRoute,
    heading,
    canLocate,
    locate,
    beaconCount: usable.length,
  };
}
export type LiveSession = ReturnType<typeof useLiveSession>;
