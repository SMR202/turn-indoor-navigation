import { useCallback, useEffect, useState } from 'react';
import type { VenuePackage } from '@turn/venue-model';

/** The TURN API runs beside the console on the same host (port 8090) unless VITE_TURN_API is set. */
export const API_BASE: string =
  (import.meta.env.VITE_TURN_API as string | undefined) ??
  `${location.protocol}//${location.hostname}:8090`;

export type Role = 'staff' | 'owner' | 'editor';
export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  org_id: string | null;
};
export type Org = {
  id: string;
  name: string;
  plan: string;
  created_at: string;
};
export type Quality = {
  walks: number;
  medianErrorM: number | null;
  standingDriftM: number | null;
  note: string;
  at: string;
};
export type VenueSummary = {
  id: string;
  orgId: string;
  orgName: string;
  name: string;
  address: string;
  visibility: 'public' | 'private-lan';
  status: 'live' | 'draft' | 'empty';
  publishedVersion: number | null;
  publishedAt: string | null;
  draftVersion: number | null;
  places: number;
  floors: number;
  beacons: number;
  sessions7d: number;
  quality: Quality | null;
  updatedAt: string;
};
export type PlaceContent = {
  description?: string;
  hours?: string;
  phone?: string;
  url?: string;
  tags?: string[];
  accessible?: boolean;
  hidden?: boolean;
  name?: string;
  category?: string;
};
export type Beacon = {
  tag: string;
  floorId: string;
  x: number;
  y: number;
  referenceRssi?: number;
  calibratedAt?: string;
};
export type VenueContent = {
  places: Record<string, PlaceContent>;
  beacons: Beacon[];
  branding: { accent?: string };
};
export type VenueDetail = VenueSummary & { content: VenueContent };
export type Validation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    rooms: number;
    places: number;
    nodes: number;
    edges: number;
    anchors: number;
  };
};
export type PackageResponse = {
  status: 'draft' | 'published';
  number: number;
  package: VenuePackage;
  validation: Validation;
};
export type ImportReport = {
  rooms: number;
  walls: number;
  wallsDerived: boolean;
  doors: number;
  places: number;
  nodes: number;
  edges: number;
  unreachablePlaces: string[];
  warnings: string[];
};
export type Version = {
  number: number;
  status: 'draft' | 'published' | 'archived';
  notes: string | null;
  created_at: string;
  published_at: string | null;
  created_by: string | null;
  places: number;
  rooms: number;
};
export type Analytics = {
  days: number;
  sampleData: boolean;
  totals: {
    sessions: number;
    routes: number;
    arrivals: number;
    completion: number | null;
  };
  daily: { day: string; sessions: number; routes: number; arrivals: number }[];
  topSearches: { query: string; n: number }[];
  topDestinations: { placeId: string; n: number }[];
};
export type BeaconHealth = Beacon & {
  lastSeen: string | null;
  rssi: number | null;
  battery: number | null;
  reports24h: number;
  medianRssi24h: number | null;
  status: 'ok' | 'quiet' | 'never';
};
export type OpsOverview = {
  orgs: number;
  venues: number;
  live: number;
  sessions7d: number;
  pipeline: (VenueSummary & {
    stage: 'created' | 'map' | 'content' | 'live' | 'measured';
  })[];
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

/** This computer's LAN address as seen by the API, so QR codes work on phones. */
export let lanHost: string | null = null;
export async function loadServerInfo() {
  try {
    const h = await api<{ lanHost: string | null }>('/health');
    lanHost = h.lanHost;
  } catch {
    lanHost = null;
  }
}

let token: string | null = localStorage.getItem('turn.token');
export const setToken = (t: string | null) => {
  token = t;
  if (t) localStorage.setItem('turn.token', t);
  else localStorage.removeItem('turn.token');
};
export const hasToken = () => Boolean(token);

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API_BASE + path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(
      0,
      `Cannot reach the TURN API at ${API_BASE}. Start it with "npm run api".`,
      null,
    );
  }
  const data = (await r.json().catch(() => null)) as { error?: string } | null;
  if (!r.ok) throw new ApiError(r.status, data?.error ?? r.statusText, data);
  return data as T;
}

/** Loads `path` (null = skip) and exposes reload/setData for optimistic updates. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: ApiError) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
