import { AssistFusion, type BeaconPlacement } from '@turn/positioning-core';
import type { VenuePackage } from '@turn/venue-model';
import { buildFusionMap } from './assist-helpers';
import { matchTag } from './assisted-tracker';
import { bleBuildAvailable, startBeaconStream } from './ble';

export type BeaconLocateResult =
  | {
      fix: { x: number; y: number; sigma: number; floorId: string };
      /** Distinct layout beacons heard on the chosen floor. */
      heard: number;
    }
  | { fix: null; reason: string };

type Sample = { at: number; tag: string; rssi: number };

/**
 * Picks the floor whose beacons were heard most and fits a position from the readings, with the
 * same fusion model as live guidance. Pure, so it can be replayed and tested.
 */
export function locateFromSamples(
  venue: VenuePackage,
  beacons: BeaconPlacement[],
  samples: Sample[],
  at: number,
): BeaconLocateResult {
  const usable = beacons.filter((b) => b.referenceRssi !== undefined);
  const heard = new Set(samples.map((s) => s.tag));
  const floors = new Map<string, number>();
  for (const b of usable)
    if (heard.has(b.tag))
      floors.set(b.floorId, (floors.get(b.floorId) ?? 0) + 1);
  const best = [...floors.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 2)
    return {
      fix: null,
      reason: heard.size
        ? 'Heard fewer than two of this venue’s beacons here.'
        : 'No venue beacons heard here.',
    };
  const [floorId, count] = best;
  const assist = new AssistFusion(
    buildFusionMap(venue, floorId),
    usable.filter((b) => b.floorId === floorId),
    {},
    1,
  );
  for (const s of samples) assist.addSample(s.at, s.tag, s.rssi);
  if (!assist.locate(at))
    return {
      fix: null,
      reason: 'The beacon readings were too weak to place you.',
    };
  const e = assist.estimate()!;
  return {
    fix: { x: e.x, y: e.y, sigma: e.displaySigmaMetres, floorId },
    heard: count,
  };
}

/**
 * "Locate me": listens to venue beacons for `waitMs` (no walking needed) and returns an estimated
 * start position, or why not. Needs a TURN build that can scan and at least two beacons with a
 * reference RSSI on one floor.
 */
export async function locateWithBeacons(
  venue: VenuePackage,
  beacons: BeaconPlacement[],
  waitMs = 6000,
): Promise<BeaconLocateResult> {
  if (!bleBuildAvailable)
    return { fix: null, reason: 'This build of TURN cannot scan for beacons.' };
  if (beacons.filter((b) => b.referenceRssi !== undefined).length < 2)
    return {
      fix: null,
      reason: 'This venue has fewer than two beacons set up.',
    };
  const samples: Sample[] = [];
  const tags = new Set(beacons.map((b) => b.tag));
  const t0 = performance.now() / 1000;
  let failure: string | null = null;
  let stop: (() => void) | null = null;
  try {
    stop = await startBeaconStream(
      (batch) => {
        const at = performance.now() / 1000 - t0;
        for (const s of batch) {
          const tag = matchTag(s, tags);
          if (tag) samples.push({ at, tag, rssi: s.rssi });
        }
      },
      (message) => {
        failure = message;
      },
      { discover: [...tags].some((t) => t.startsWith('NM')) },
    );
    await new Promise((r) => setTimeout(r, waitMs));
  } catch (e) {
    return { fix: null, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    stop?.();
  }
  if (failure) return { fix: null, reason: failure };
  return locateFromSamples(
    venue,
    beacons,
    samples,
    performance.now() / 1000 - t0,
  );
}
