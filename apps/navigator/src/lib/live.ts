import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BeaconPlacement } from '@turn/positioning-core';
import {
  LivePositioning,
  liveAvailability,
  locateWithBeacons,
  type LiveStart,
  type LiveState,
} from '@turn/positioning-runtime';
import type { VenuePackage } from '@turn/venue-model';
import { postJson, type VenueContent } from './api';
import { load } from './storage';

type P = { x: number; y: number };

/** Venue beacon layout (from TURN Studio) as fusion placements. */
export function placementsFrom(
  content: VenueContent,
  floorId: string,
): BeaconPlacement[] {
  return content.beacons
    .filter((b) => b.floorId === floorId && /^[A-Za-z0-9]{1,12}$/.test(b.tag))
    .map((b) => ({
      tag: b.tag,
      floorId: b.floorId,
      x: b.x,
      y: b.y,
      ...(b.referenceRssi !== undefined
        ? { referenceRssi: b.referenceRssi }
        : {}),
      ...(b.calibratedAt ? { calibratedAt: b.calibratedAt } : {}),
    }));
}

/** Every floor's beacons, for "locate me" (which picks the floor it hears best). */
export function allPlacements(content: VenueContent): BeaconPlacement[] {
  const floors = new Set(content.beacons.map((b) => b.floorId));
  return [...floors].flatMap((f) => placementsFrom(content, f));
}

/** Live positioning for one venue screen: start from a known point, stop on leave. */
export function useLiveGuidance(
  pkg: VenuePackage,
  content: VenueContent,
  /** Floor where guidance would start (for availability and the beacon count). */
  startFloorId: string,
) {
  const availability = useMemo(
    () => liveAvailability(pkg, startFloorId),
    [pkg, startFloorId],
  );
  const beacons = useMemo(
    () => placementsFrom(content, startFloorId),
    [content, startFloorId],
  );
  const ref = useRef<LivePositioning | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const stop = useCallback(() => {
    ref.current?.stop();
    ref.current = null;
    setState(null);
  }, []);
  const start = useCallback(
    async (
      from: P,
      headingRad: number,
      floorId: string,
      how: LiveStart = {},
    ) => {
      ref.current?.stop();
      const live = new LivePositioning({
        venue: pkg,
        floorId,
        beacons: placementsFrom(content, floorId),
      });
      ref.current = live;
      live.subscribe(setState);
      try {
        await live.start(from, headingRad, how);
      } catch {
        // The controller already published a stopped state with the reason.
      }
    },
    [pkg, content],
  );
  useEffect(() => () => ref.current?.stop(), []);
  // Beacon health for the venue: every 30 s, the beacons this phone heard recently and how strongly.
  // Anonymous (no session, no position) and only with "Share anonymous usage" on.
  const running =
    state !== null && state.phase !== 'idle' && state.phase !== 'stopped';
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
  const correct = useCallback((p: P) => ref.current?.correct(p), []);
  const setRoute = useCallback(
    (route: P[] | null) => ref.current?.setRoute(route),
    [],
  );
  const everyBeacon = useMemo(() => allPlacements(content), [content]);
  /** Beacon-only start position, when the venue has at least two beacons with a reference RSSI. */
  const canLocate =
    availability.available &&
    everyBeacon.filter((b) => b.referenceRssi !== undefined).length >= 2;
  const locate = useCallback(
    () => locateWithBeacons(pkg, everyBeacon, 6000),
    [pkg, everyBeacon],
  );
  return {
    availability,
    beaconCount: beacons.filter((b) => b.referenceRssi !== undefined).length,
    state,
    start,
    stop,
    correct,
    setRoute,
    canLocate,
    locate,
  };
}
