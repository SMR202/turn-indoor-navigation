import { beaconTagKind, type BeaconPlacement } from '@turn/positioning-core';
import type { BeaconInfo } from '@turn/positioning-runtime';
import type { VenueContent } from './api';

/**
 * A venue beacon as this phone uses it: the published layout (TURN Studio) with this phone's own
 * placements and 1 m calibrations on top. Calibrations are per phone because phones hear the same
 * beacon several dB apart.
 */
export type LayoutBeacon = {
  tag: string;
  floorId: string;
  x: number;
  y: number;
  /** Median RSSI one metre away, measured with this phone (or the venue's value). */
  referenceRssi?: number;
  calibratedAt?: string;
  label?: string;
  /** iBeacon proximity UUID (iPhones can only range iBeacons whose UUID they know). */
  uuid?: string;
  /** The beacon's own advertised 1 m power, used until it is calibrated. */
  txAt1m?: number;
  source: 'venue' | 'phone';
};
export type Stored = Omit<LayoutBeacon, 'source'>;
type Override = Partial<Omit<Stored, 'tag'>> & { removed?: boolean };
export type LocalLayout = {
  overrides: Record<string, Override>;
  added: Stored[];
};

/** Typical 1 m RSSI of a beacon at about 0 dBm; a model value until calibrated on site. */
export const MODEL_RSSI_AT_1M = -59;
export const EMPTY_LAYOUT: LocalLayout = { overrides: {}, added: [] };

export function mergeLayout(
  published: VenueContent['beacons'],
  local: LocalLayout,
): LayoutBeacon[] {
  const out: LayoutBeacon[] = [];
  for (const b of published) {
    const o = local.overrides[b.tag];
    if (o?.removed) continue;
    out.push({ ...b, ...o, tag: b.tag, source: o ? 'phone' : 'venue' });
  }
  for (const b of local.added)
    if (!out.some((x) => x.tag === b.tag)) out.push({ ...b, source: 'phone' });
  return out;
}

/** Fusion placements: calibrated, venue or advertised 1 m power, else the model value. */
export function placementsFor(
  beacons: LayoutBeacon[],
  floorId?: string,
): BeaconPlacement[] {
  return beacons
    .filter((b) => !floorId || b.floorId === floorId)
    .map((b) => {
      const reference =
        b.referenceRssi ??
        b.txAt1m ??
        (b.source === 'phone' ? MODEL_RSSI_AT_1M : undefined);
      return {
        tag: b.tag,
        floorId: b.floorId,
        x: b.x,
        y: b.y,
        ...(reference !== undefined ? { referenceRssi: reference } : {}),
        ...(b.calibratedAt ? { calibratedAt: b.calibratedAt } : {}),
      };
    });
}

export type NearbyDevice = {
  /** Per-phone device key (address on Android, peripheral id on iPhone) or the tag. */
  key: string;
  tag: string;
  alt: string[];
  info?: BeaconInfo;
  /** Median RSSI over the last two seconds (dBm). */
  rssi: number;
  /** Packets per second over the last three seconds. */
  rate: number;
  lastHeard: number;
  /** One value per half second over the last 30 s (null when silent). */
  history: (number | null)[];
};

export const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Log-distance estimate (metres) from a 1 m reference; rough, for orientation only. */
export function roughDistance(rssi: number, at1m = MODEL_RSSI_AT_1M, n = 2.3) {
  return 10 ** ((at1m - rssi) / (10 * n));
}

/**
 * The tag to save a newly found beacon under: its own frame identity when that is unique, else its
 * address (Android) or advertised name, so beacons that share an iBeacon identity stay apart.
 */
export function adoptionTag(
  d: NearbyDevice,
  nearby: NearbyDevice[],
): { tag: string; note: string | null } | { tag: null; note: string } {
  const shared =
    nearby.filter((x) => x.tag === d.tag).length > 1 ||
    (d.info?.shared ?? 1) > 1;
  const mac = d.alt.find((a) => beaconTagKind(a) === 'address');
  const name = d.alt.find((a) => beaconTagKind(a) === 'name');
  if (d.info?.kind !== 'ibeacon' || !shared) return { tag: d.tag, note: null };
  if (mac)
    return {
      tag: mac,
      note: 'Other beacons share this iBeacon ID, so TURN uses this beacon’s Bluetooth address. iPhones cannot read addresses: give each beacon its own Minor value in the maker’s app for iPhone support.',
    };
  if (name)
    return {
      tag: name,
      note: 'Other beacons share this iBeacon ID, so TURN uses this beacon’s Bluetooth name.',
    };
  return {
    tag: null,
    note: 'Several beacons share this iBeacon ID and iPhones cannot tell them apart. Give each its own Minor value in the beacon maker’s app (or set them up with an Android phone).',
  };
}

/** Human description of a device for lists. */
export function describe(d: { tag: string; info?: BeaconInfo }) {
  const i = d.info;
  const kind = i?.kind ?? beaconKindLabel(d.tag);
  if (kind === 'ibeacon' || beaconTagKind(d.tag) === 'ibeacon') {
    const major = i?.major ?? parseInt(d.tag.slice(2, 6), 16);
    const minor = i?.minor ?? parseInt(d.tag.slice(6, 10), 16);
    return { title: i?.name ?? `iBeacon ${major} · ${minor}`, kind: 'iBeacon' };
  }
  if (kind === 'eddystone')
    return { title: i?.name ?? `Eddystone ${d.tag}`, kind: 'Eddystone' };
  if (kind === 'turn') return { title: `TURN phone ${d.tag}`, kind: 'TURN' };
  return { title: i?.name ?? d.tag, kind: 'Bluetooth device' };
}
function beaconKindLabel(tag: string): BeaconInfo['kind'] {
  const k = beaconTagKind(tag);
  return k === 'ibeacon'
    ? 'ibeacon'
    : k === 'eddystone'
      ? 'eddystone'
      : k === 'turn'
        ? 'turn'
        : 'other';
}
