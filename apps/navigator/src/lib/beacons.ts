import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bleBuildAvailable,
  registerIBeaconUuids,
  startBeaconStream,
  type BeaconInfo,
  type StreamSample,
} from '@turn/positioning-runtime';
import type { VenueContent } from './api';
import {
  EMPTY_LAYOUT as EMPTY,
  median,
  mergeLayout,
  type LocalLayout,
  type NearbyDevice,
  type Stored,
} from './beacon-layout';
import { load, save } from './storage';

export * from './beacon-layout';

const key = (venueId: string) => `beacon-layout-${venueId}`;

// One store per venue so the venue screen and the beacon screen stay in step.
const listeners = new Map<string, Set<(l: LocalLayout) => void>>();
function emit(venueId: string, layout: LocalLayout) {
  save(key(venueId), layout);
  for (const l of listeners.get(venueId) ?? []) l(layout);
}

export function useBeaconLayout(venueId: string, content: VenueContent) {
  const [local, setLocal] = useState<LocalLayout>(() =>
    load(key(venueId), EMPTY),
  );
  useEffect(() => {
    const set = listeners.get(venueId) ?? new Set();
    listeners.set(venueId, set);
    set.add(setLocal);
    setLocal(load(key(venueId), EMPTY));
    return () => {
      set.delete(setLocal);
    };
  }, [venueId]);
  const beacons = mergeLayout(content.beacons, local);
  // iPhones range only the iBeacon UUIDs they are told about.
  const uuids = beacons
    .map((b) => b.uuid)
    .filter(Boolean)
    .join(',');
  useEffect(() => {
    if (uuids) registerIBeaconUuids(uuids.split(','));
  }, [uuids]);
  const upsert = useCallback(
    (b: Stored) => {
      const current = load<LocalLayout>(key(venueId), EMPTY);
      const published = content.beacons.some((p) => p.tag === b.tag);
      const next: LocalLayout = published
        ? {
            ...current,
            overrides: { ...current.overrides, [b.tag]: { ...b } },
          }
        : {
            ...current,
            added: [...current.added.filter((x) => x.tag !== b.tag), b],
          };
      emit(venueId, next);
    },
    [venueId, content.beacons],
  );
  const remove = useCallback(
    (tag: string) => {
      const current = load<LocalLayout>(key(venueId), EMPTY);
      const published = content.beacons.some((p) => p.tag === tag);
      emit(venueId, {
        overrides: published
          ? { ...current.overrides, [tag]: { removed: true } }
          : current.overrides,
        added: current.added.filter((x) => x.tag !== tag),
      });
    },
    [venueId, content.beacons],
  );
  const reset = useCallback(() => emit(venueId, EMPTY), [venueId]);
  const edited = Object.keys(local.overrides).length + local.added.length > 0;
  return { beacons, upsert, remove, reset, edited };
}

// ---- Nearby devices ------------------------------------------------------------------------------

type Raw = { at: number; rssi: number };
type Track = {
  key: string;
  tag: string;
  alt: string[];
  info?: BeaconInfo;
  raw: Raw[];
  history: (number | null)[];
};

/**
 * Live list of beacons (and, with `discover`, other Bluetooth devices) this phone hears, refreshed
 * twice a second. Nothing is stored. `collect` measures a median RSSI for calibration.
 */
export function useNearbyBeacons(active: boolean, discover: boolean) {
  const tracks = useRef(new Map<string, Track>());
  const [devices, setDevices] = useState<NearbyDevice[]>([]);
  const [error, setError] = useState<string | null>(
    bleBuildAvailable ? null : 'This build of TURN cannot scan for beacons.',
  );
  const [notices, setNotices] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!active || !bleBuildAvailable) return;
    let stop: (() => void) | null = null;
    let alive = true;
    const onSamples = (batch: StreamSample[]) => {
      const now = performance.now();
      for (const s of batch) {
        const k = s.key ?? s.tag;
        let t = tracks.current.get(k);
        if (!t) {
          if (tracks.current.size >= 200) continue;
          t = { key: k, tag: s.tag, alt: [], raw: [], history: [] };
          tracks.current.set(k, t);
        }
        t.tag = s.tag;
        t.alt = s.alt ?? t.alt;
        t.info = s.info ?? t.info;
        t.raw.push({ at: now, rssi: s.rssi });
        if (t.raw.length > 600) t.raw.splice(0, t.raw.length - 600);
      }
    };
    void startBeaconStream(onSamples, (message) => alive && setError(message), {
      discover,
      onNotice: (n) =>
        alive && setNotices((p) => [...new Set([...p, ...n])].slice(-3)),
    })
      .then((s) => {
        if (!alive) s();
        else {
          stop = s;
          setListening(true);
          setError(null);
        }
      })
      .catch(
        (e) => alive && setError(e instanceof Error ? e.message : String(e)),
      );
    const timer = setInterval(() => {
      const now = performance.now();
      const list: NearbyDevice[] = [];
      for (const [k, t] of tracks.current) {
        const last = t.raw.at(-1);
        if (!last || now - last.at > 15000) {
          tracks.current.delete(k);
          continue;
        }
        const recent = t.raw.filter((r) => now - r.at <= 2000);
        const rssi = recent.length ? median(recent.map((r) => r.rssi)) : null;
        t.history.push(rssi);
        if (t.history.length > 60) t.history.shift();
        list.push({
          key: t.key,
          tag: t.tag,
          alt: t.alt,
          info: t.info,
          rssi: rssi ?? last.rssi,
          rate: t.raw.filter((r) => now - r.at <= 3000).length / 3,
          lastHeard: last.at,
          history: [...t.history],
        });
      }
      list.sort((a, b) => b.rssi - a.rssi);
      setDevices(list);
    }, 500);
    return () => {
      alive = false;
      clearInterval(timer);
      stop?.();
      setListening(false);
    };
  }, [active, discover]);
  /** Median RSSI of one device from `since` (performance.now() ms) until now. */
  const collect = useCallback((deviceKey: string, since: number) => {
    const t = tracks.current.get(deviceKey);
    const v = t?.raw.filter((r) => r.at >= since).map((r) => r.rssi) ?? [];
    return { median: v.length ? median(v) : null, count: v.length };
  }, []);
  return { devices, error, notices, listening, collect };
}
