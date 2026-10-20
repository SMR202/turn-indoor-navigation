import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bleBuildAvailable,
  registerIBeaconUuids,
  startBeaconStream,
  type BeaconInfo,
  type StreamSample,
} from '@turn/positioning-runtime';
import { getJson, putJson, type VenueContent } from './api';
import {
  EMPTY_LAYOUT as EMPTY,
  median,
  mergeLayout,
  type LocalLayout,
  type NearbyDevice,
  syncPlan,
  type SharedLayout,
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

/** `local`: a public venue, whose shared layout is set up in TURN Studio. */
export type SyncState = 'idle' | 'syncing' | 'saved' | 'offline' | 'local';
const syncListeners = new Map<string, Set<(s: SyncState) => void>>();
const syncing = new Set<string>();
function setSync(venueId: string, s: SyncState) {
  for (const l of syncListeners.get(venueId) ?? []) l(s);
}

/**
 * Exchanges this phone's beacon layout with the TURN server so every phone sees the same setup
 * (private LAN venues). Safe to call often: one request runs at a time per venue.
 */
async function syncLayout(venueId: string, shared: boolean) {
  if (syncing.has(venueId)) return;
  syncing.add(venueId);
  setSync(venueId, 'syncing');
  const path = `/public/venues/${encodeURIComponent(venueId)}/beacon-layout`;
  try {
    const { status, body } = await getJson<{
      layout: SharedLayout | null;
      updatedAt: string | null;
    }>(path);
    if (status !== 200 || !body) {
      setSync(venueId, 'offline');
      return;
    }
    const local = load<LocalLayout>(key(venueId), EMPTY);
    const plan = syncPlan(local, body);
    if (plan && 'push' in plan && !shared) {
      setSync(venueId, 'local');
      return;
    }
    if (plan && 'push' in plan) {
      const saved = await putJson<{ updatedAt: string }>(path, plan.push);
      if (!saved) {
        setSync(venueId, 'offline');
        return;
      }
      // Keep edits made while the request was in flight.
      const now = load<LocalLayout>(key(venueId), EMPTY);
      const changed =
        JSON.stringify([now.overrides, now.added]) !==
        JSON.stringify([local.overrides, local.added]);
      emit(
        venueId,
        changed
          ? { ...now, dirty: true, syncedAt: saved.updatedAt }
          : { ...plan.push, dirty: false, syncedAt: saved.updatedAt },
      );
    } else if (plan && 'take' in plan)
      emit(venueId, { ...plan.take, dirty: false, syncedAt: plan.at });
    setSync(venueId, 'saved');
  } catch {
    setSync(venueId, 'offline');
  } finally {
    syncing.delete(venueId);
  }
}

export function useBeaconLayout(
  venueId: string,
  content: VenueContent,
  /** Private LAN venues share phone setups through the TURN server. */
  shared: boolean,
) {
  const [local, setLocal] = useState<LocalLayout>(() =>
    load(key(venueId), EMPTY),
  );
  const [sync, setSyncState] = useState<SyncState>('idle');
  useEffect(() => {
    const set = listeners.get(venueId) ?? new Set();
    listeners.set(venueId, set);
    set.add(setLocal);
    const ss = syncListeners.get(venueId) ?? new Set();
    syncListeners.set(venueId, ss);
    ss.add(setSyncState);
    setLocal(load(key(venueId), EMPTY));
    // Share with the other phones now and every 15 s while the venue is open.
    void syncLayout(venueId, shared);
    const timer = setInterval(() => void syncLayout(venueId, shared), 15000);
    return () => {
      clearInterval(timer);
      set.delete(setLocal);
      ss.delete(setSyncState);
    };
  }, [venueId, shared]);
  const beacons = mergeLayout(content.beacons, local);
  // iPhones range only the iBeacon UUIDs they are told about.
  const uuids = beacons
    .map((b) => b.uuid)
    .filter(Boolean)
    .join(',');
  useEffect(() => {
    if (uuids) registerIBeaconUuids(uuids.split(','));
  }, [uuids]);
  const edit = useCallback(
    (next: LocalLayout) => {
      emit(venueId, { ...next, dirty: true });
      void syncLayout(venueId, shared);
    },
    [venueId, shared],
  );
  const upsert = useCallback(
    (b: Stored) => {
      const current = load<LocalLayout>(key(venueId), EMPTY);
      const published = content.beacons.some((p) => p.tag === b.tag);
      edit(
        published
          ? {
              ...current,
              overrides: { ...current.overrides, [b.tag]: { ...b } },
            }
          : {
              ...current,
              added: [...current.added.filter((x) => x.tag !== b.tag), b],
            },
      );
    },
    [venueId, content.beacons, edit],
  );
  const remove = useCallback(
    (tag: string) => {
      const current = load<LocalLayout>(key(venueId), EMPTY);
      const published = content.beacons.some((p) => p.tag === tag);
      edit({
        ...current,
        overrides: published
          ? { ...current.overrides, [tag]: { removed: true } }
          : current.overrides,
        added: current.added.filter((x) => x.tag !== tag),
      });
    },
    [venueId, content.beacons, edit],
  );
  const reset = useCallback(
    () =>
      edit({
        ...EMPTY,
        syncedAt: load<LocalLayout>(key(venueId), EMPTY).syncedAt,
      }),
    [venueId, edit],
  );
  const refresh = useCallback(
    () => void syncLayout(venueId, shared),
    [venueId, shared],
  );
  const edited = Object.keys(local.overrides).length + local.added.length > 0;
  return { beacons, upsert, remove, reset, refresh, edited, sync };
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
