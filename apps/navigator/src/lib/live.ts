import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BeaconPlacement } from '@turn/positioning-core';
import {
  LivePositioning,
  liveAvailability,
  type LiveState,
} from '@turn/positioning-runtime';
import type { VenuePackage } from '@turn/venue-model';
import type { VenueContent } from './api';

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

/** Live positioning for one venue screen: start from a known point, stop on leave. */
export function useLiveGuidance(
  pkg: VenuePackage,
  floorId: string,
  content: VenueContent,
) {
  const availability = useMemo(
    () => liveAvailability(pkg, floorId),
    [pkg, floorId],
  );
  const beacons = useMemo(
    () => placementsFrom(content, floorId),
    [content, floorId],
  );
  const ref = useRef<LivePositioning | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const stop = useCallback(() => {
    ref.current?.stop();
    ref.current = null;
    setState(null);
  }, []);
  const start = useCallback(
    async (from: P, headingRad: number) => {
      ref.current?.stop();
      const live = new LivePositioning({ venue: pkg, floorId, beacons });
      ref.current = live;
      live.subscribe(setState);
      try {
        await live.start(from, headingRad);
      } catch {
        // The controller already published a stopped state with the reason.
      }
    },
    [pkg, floorId, beacons],
  );
  useEffect(() => () => ref.current?.stop(), []);
  return {
    availability,
    beaconCount: beacons.filter((b) => b.referenceRssi !== undefined).length,
    state,
    start,
    stop,
  };
}
