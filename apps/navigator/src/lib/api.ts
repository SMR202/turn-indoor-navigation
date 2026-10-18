import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  demoCentre,
  parseVenuePackage,
  type VenuePackage,
} from '@turn/venue-model';
import { load, save } from './storage';

export type PlaceContent = {
  description?: string;
  hours?: string;
  phone?: string;
  url?: string;
  tags?: string[];
  accessible?: boolean;
  hidden?: boolean;
};
export type VenueContent = {
  places: Record<string, PlaceContent>;
  beacons: { tag: string; floorId: string; x: number; y: number }[];
  branding: { accent?: string };
};
export type VenueSummary = {
  id: string;
  name: string;
  address: string;
  organisation: string;
  version: number;
  places: number;
  floors: number;
  private: boolean;
  accent: string | null;
};
export type VenueBundle = {
  summary: VenueSummary;
  pkg: VenuePackage;
  content: VenueContent;
  /** Where this copy came from, shown to the user when it matters. */
  source: 'live' | 'cached' | 'bundled';
};

const emptyContent: VenueContent = { places: {}, beacons: [], branding: {} };
const demoContent: VenueContent = {
  ...emptyContent,
  places: {
    'poi-cafe': {
      description: 'Specialty coffee, pastries and quiet tables by the window.',
      hours: '07:30–19:00',
      accessible: true,
    },
    'poi-restrooms': {
      description: 'Accessible restrooms and baby changing.',
      accessible: true,
    },
    'poi-pharmacy': {
      description: 'Prescriptions, first aid and travel health.',
      hours: '09:00–20:00',
      accessible: true,
    },
    'poi-info': {
      description: 'Maps, lost and found, mobility scooters on request.',
      hours: '09:00–18:00',
      accessible: true,
    },
  },
};
export const bundledDemo: VenueBundle = {
  summary: {
    id: demoCentre.venueId,
    name: demoCentre.name,
    address: '1 Harbour Walk (fictional)',
    organisation: 'TURN',
    version: 1,
    places: demoCentre.pois.length,
    floors: demoCentre.floors.length,
    private: false,
    accent: null,
  },
  pkg: demoCentre,
  content: demoContent,
  source: 'bundled',
};

/** The TURN API runs beside the dev server on the same computer (port 8090) unless configured. */
export function apiBase(): string | null {
  const configured = process.env.EXPO_PUBLIC_TURN_API;
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web') {
    const host = globalThis.location?.hostname;
    return host ? `http://${host}:8090` : null;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (
      Constants as unknown as {
        manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
      }
    ).manifest2?.extra?.expoClient?.hostUri;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:8090` : null;
}

async function getJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 5000,
): Promise<{ status: number; body: T | null; etag: string | null }> {
  const base = apiBase();
  if (!base) throw new Error('No TURN server configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const body = r.status === 200 ? ((await r.json()) as T) : null;
    return { status: r.status, body, etag: r.headers.get('ETag') };
  } finally {
    clearTimeout(timer);
  }
}

export type CatalogState = {
  venues: VenueSummary[];
  online: boolean;
  loading: boolean;
};

export function useCatalog(refreshKey = 0): CatalogState {
  const [state, setState] = useState<CatalogState>(() => {
    const cached = load<VenueSummary[]>('catalog', []);
    return { venues: merge(cached), online: false, loading: true };
  });
  useEffect(() => {
    let alive = true;
    getJson<VenueSummary[]>('/public/venues')
      .then(({ body }) => {
        if (!alive) return;
        const venues = (body ?? []).map((v) => ({
          ...v,
          private: Boolean(v.private),
        }));
        save('catalog', venues);
        setState({ venues: merge(venues), online: true, loading: false });
      })
      .catch(
        () =>
          alive && setState((s) => ({ ...s, online: false, loading: false })),
      );
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return state;
}

function merge(venues: VenueSummary[]) {
  const list = [...venues];
  if (!list.some((v) => v.id === bundledDemo.summary.id))
    list.push(bundledDemo.summary);
  return list;
}

type CachedVenue = {
  etag: string | null;
  version: number;
  summary: VenueSummary;
  pkg: unknown;
  content: VenueContent;
};

export type VenueState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: VenueBundle }
  | { status: 'error'; message: string };

/** Loads a published venue: live from the server (ETag revalidated), else the cached copy, else the bundled demo. */
export function useVenue(id: string): VenueState {
  const [state, setState] = useState<VenueState>(() => {
    const cached = fromCache(id);
    if (cached) return { status: 'ready', bundle: cached };
    if (id === bundledDemo.summary.id)
      return { status: 'ready', bundle: bundledDemo };
    return { status: 'loading' };
  });
  useEffect(() => {
    let alive = true;
    const cached = load<CachedVenue | null>(`venue-${id}`, null);
    const catalog = load<VenueSummary[]>('catalog', []);
    getJson<{
      version: number;
      package: unknown;
      content: Partial<VenueContent>;
    }>(
      `/public/venues/${encodeURIComponent(id)}`,
      cached?.etag ? { headers: { 'If-None-Match': cached.etag } } : undefined,
    )
      .then(({ status, body, etag }) => {
        if (!alive) return;
        if (status === 304 && cached) {
          setState({
            status: 'ready',
            bundle: { ...fromCache(id)!, source: 'live' },
          });
          return;
        }
        if (!body) {
          if (!fromCache(id) && id !== bundledDemo.summary.id)
            setState({
              status: 'error',
              message:
                status === 404
                  ? 'This venue is not published.'
                  : 'The venue could not be loaded.',
            });
          return;
        }
        const pkg = parseVenuePackage(body.package);
        const content = { ...emptyContent, ...body.content } as VenueContent;
        const summary: VenueSummary = catalog.find((v) => v.id === id) ?? {
          ...bundledDemo.summary,
          id,
          name: pkg.name,
          address: '',
          organisation: '',
          places: pkg.pois.length,
          floors: pkg.floors.length,
        };
        const record: CachedVenue = {
          etag,
          version: body.version,
          summary: { ...summary, version: body.version },
          pkg: body.package,
          content,
        };
        save(`venue-${id}`, record);
        setState({
          status: 'ready',
          bundle: { summary: record.summary, pkg, content, source: 'live' },
        });
      })
      .catch(() => {
        if (alive && !fromCache(id) && id !== bundledDemo.summary.id)
          setState({
            status: 'error',
            message:
              'You are offline and this venue has not been downloaded yet.',
          });
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return state;
}

function fromCache(id: string): VenueBundle | null {
  const cached = load<CachedVenue | null>(`venue-${id}`, null);
  if (!cached) return null;
  try {
    return {
      summary: cached.summary,
      pkg: parseVenuePackage(cached.pkg),
      content: cached.content,
      source: 'cached',
    };
  } catch {
    return null;
  }
}

export async function postJson(path: string, body: unknown) {
  const base = apiBase();
  if (!base) return;
  await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
