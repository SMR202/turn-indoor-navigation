import { beforeEach, describe, expect, it } from 'vitest';
import { demoCentre } from '@turn/venue-model';
import { createApp, validatePackage } from './app';
import { openDb } from './db';
import { seed } from './seed';

let app: ReturnType<typeof createApp>;
const json = (body: unknown, token?: string, method = 'POST') => ({
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});
async function login(email: string) {
  const r = await app.request('/auth/dev-login', json({ email }));
  return ((await r.json()) as { token: string }).token;
}
beforeEach(() => {
  const db = openDb(':memory:');
  seed(db);
  app = createApp(db);
});

describe('TURN API', () => {
  it('requires sign-in and scopes venues to the organisation', async () => {
    expect((await app.request('/venues')).status).toBe(401);
    const owner = await login('owner@harbour.demo');
    const venues = (await (
      await app.request('/venues', {
        headers: { Authorization: `Bearer ${owner}` },
      })
    ).json()) as { id: string; status: string; places: number }[];
    expect(venues.map((v) => v.id)).toEqual(['turn-demo-centre']);
    expect(venues[0]!.status).toBe('live');
    expect(venues[0]!.places).toBe(demoCentre.pois.length);
    const ops = await login('ops@turn.local');
    const overview = (await (
      await app.request('/ops/overview', {
        headers: { Authorization: `Bearer ${ops}` },
      })
    ).json()) as { venues: number };
    expect(overview.venues).toBe(1);
    expect(
      (
        await app.request('/ops/overview', {
          headers: { Authorization: `Bearer ${owner}` },
        })
      ).status,
    ).toBe(403);
  });
  it('serves the public catalog and package with an ETag', async () => {
    const catalog = (await (await app.request('/public/venues')).json()) as {
      id: string;
    }[];
    expect(catalog.map((v) => v.id)).toEqual(['turn-demo-centre']);
    const r = await app.request('/public/venues/turn-demo-centre');
    expect(r.status).toBe(200);
    const etag = r.headers.get('ETag')!;
    const body = (await r.json()) as {
      version: number;
      package: { pois: unknown[] };
    };
    expect(body.version).toBe(1);
    expect(body.package.pois.length).toBeGreaterThan(5);
    expect(
      (
        await app.request('/public/venues/turn-demo-centre', {
          headers: { 'If-None-Match': etag },
        })
      ).status,
    ).toBe(304);
  });
  it('creates a venue, imports a floor, refuses a broken map and publishes a valid one', async () => {
    const owner = await login('owner@harbour.demo');
    const created = (await (
      await app.request(
        '/venues',
        json({ orgId: 'org_harbour', name: 'Pier Offices' }, owner),
      )
    ).json()) as { id: string };
    const geo = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 3],
                [5, 3],
                [5, 6],
                [0, 6],
              ],
            ],
          },
          properties: { name: 'Studio' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 3],
                [0, 3],
              ],
            ],
          },
          properties: { kind: 'circulation', name: 'Hall' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [5, 3],
                [10, 3],
                [10, 6],
                [5, 6],
              ],
            ],
          },
          properties: { name: 'Kitchen' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [2.5, 3] },
          properties: { kind: 'door' },
        },
      ],
    };
    const imported = (await (
      await app.request(
        `/venues/${created.id}/import`,
        json({ geojson: geo }, owner),
      )
    ).json()) as { validation: { ok: boolean; errors: string[] } };
    expect(imported.validation.ok).toBe(false); // Kitchen has no door yet
    expect(imported.validation.errors.join(' ')).toMatch(/Unreachable/);
    expect(
      (await app.request(`/venues/${created.id}/publish`, json({}, owner)))
        .status,
    ).toBe(422);
    geo.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [7.5, 3] },
      properties: { kind: 'door' },
    });
    await app.request(
      `/venues/${created.id}/import`,
      json({ geojson: geo }, owner),
    );
    const published = await app.request(
      `/venues/${created.id}/publish`,
      json({ notes: 'first' }, owner),
    );
    expect(published.status).toBe(200);
    const editor = await login('editor@harbour.demo');
    expect(
      (await app.request(`/venues/${created.id}/publish`, json({}, editor)))
        .status,
    ).toBe(403);
    const versions = (await (
      await app.request(`/venues/${created.id}/versions`, {
        headers: { Authorization: `Bearer ${owner}` },
      })
    ).json()) as { status: string }[];
    expect(versions[0]!.status).toBe('published');
  });
  it('stores anonymous visitor events and aggregates them, flagging sample data', async () => {
    const owner = await login('owner@harbour.demo');
    const r = await app.request(
      '/public/events',
      json([
        {
          venueId: 'turn-demo-centre',
          type: 'search',
          query: 'Coffee',
          session: 'abc123',
        },
      ]),
    );
    expect(((await r.json()) as { stored: number }).stored).toBe(1);
    const a = (await (
      await app.request('/venues/turn-demo-centre/analytics?days=30', {
        headers: { Authorization: `Bearer ${owner}` },
      })
    ).json()) as {
      sampleData: boolean;
      totals: { sessions: number; completion: number };
      topSearches: { query: string }[];
    };
    expect(a.sampleData).toBe(true);
    expect(a.totals.sessions).toBeGreaterThan(100);
    expect(a.totals.completion).toBeGreaterThan(0.5);
    expect(a.topSearches.length).toBeGreaterThan(0);
    expect(
      (
        await app.request(
          '/public/events',
          json([{ venueId: 'x', type: 'hack', session: 'abc123' }]),
        )
      ).status,
    ).toBe(400);
  });
  it('validates packages: the demo passes, a wall-crossing graph fails', () => {
    expect(validatePackage(demoCentre).ok).toBe(true);
    const broken = structuredClone(demoCentre);
    broken.floors[0]!.walls.push({
      from: { x: 9, y: 16 },
      to: { x: 9, y: 20 },
    });
    const v = validatePackage(broken);
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/cross walls/);
    expect(validatePackage({ nope: 1 }).ok).toBe(false);
  });
});

describe('content publishing', () => {
  it('publishes place-detail changes as a new version without a map change', async () => {
    const owner = await login('owner@harbour.demo');
    const auth = { Authorization: `Bearer ${owner}` };
    expect(
      (await app.request('/venues/turn-demo-centre/publish', json({}, owner)))
        .status,
    ).toBe(409);
    const patch = await app.request(
      '/venues/turn-demo-centre/places/poi-cafe',
      { ...json({ hours: '08:00–18:00' }, owner), method: 'PATCH' },
    );
    expect(patch.status).toBe(200);
    expect(
      (
        await app.request(
          '/venues/turn-demo-centre/publish',
          json({ notes: 'Café hours' }, owner),
        )
      ).status,
    ).toBe(200);
    const pub = (await (
      await app.request('/public/venues/turn-demo-centre')
    ).json()) as {
      version: number;
      content: { places: Record<string, { hours?: string }> };
    };
    expect(pub.version).toBe(2);
    expect(pub.content.places['poi-cafe']!.hours).toBe('08:00–18:00');
    const versions = (await (
      await app.request('/venues/turn-demo-centre/versions', { headers: auth })
    ).json()) as { status: string }[];
    expect(versions.map((v) => v.status)).toEqual(['published', 'archived']);
  });
});

describe('multi-floor import', () => {
  it('adds a second floor and links the stairs core', async () => {
    const owner = await login('owner@harbour.demo');
    const created = (await (
      await app.request(
        '/venues',
        json({ orgId: 'org_harbour', name: 'Twin Floors' }, owner),
      )
    ).json()) as { id: string };
    const sq = (x0: number, y0: number, x1: number, y1: number) => [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
    ];
    const floor = (shop: string) => ({
      type: 'FeatureCollection',
      turn: { units: 'metres' },
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: sq(0, 0, 20, 4) },
          properties: { kind: 'circulation', name: 'Hall' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: sq(0, 4, 12, 10) },
          properties: { name: shop },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: sq(12, 4, 20, 10) },
          properties: { kind: 'stairs', name: 'Stairs & Lift' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [6, 4] },
          properties: { kind: 'door' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [16, 4] },
          properties: { kind: 'door' },
        },
      ],
    });
    await app.request(
      `/venues/${created.id}/import`,
      json(
        {
          geojson: floor('Bakery'),
          floorId: 'ground',
          floorLabel: 'Ground',
          level: 0,
        },
        owner,
      ),
    );
    const r = (await (
      await app.request(
        `/venues/${created.id}/import`,
        json(
          {
            geojson: floor('Books'),
            floorId: 'level-1',
            floorLabel: 'Level 1',
            level: 1,
          },
          owner,
        ),
      )
    ).json()) as {
      report: { floors: number; verticalLinks: number };
      validation: { ok: boolean };
    };
    expect(r.report.floors).toBe(2);
    expect(r.report.verticalLinks).toBe(2);
    expect(r.validation.ok).toBe(true);
    expect(
      (await app.request(`/venues/${created.id}/publish`, json({}, owner)))
        .status,
    ).toBe(200);
  });
});

describe('beacon health', () => {
  it('accepts reports for the venue layout only and summarises them', async () => {
    const owner = await login('owner@harbour.demo');
    const auth = { Authorization: `Bearer ${owner}` };
    await app.request('/venues/turn-demo-centre/beacons', {
      ...json(
        [
          { tag: 'B1', floorId: 'ground', x: 10, y: 18, referenceRssi: -59 },
          { tag: 'B2', floorId: 'ground', x: 30, y: 18, referenceRssi: -59 },
        ],
        owner,
      ),
      method: 'PUT',
    });
    const r = await app.request(
      '/public/beacon-reports',
      json([
        { venueId: 'turn-demo-centre', tag: 'B1', rssi: -70 },
        { venueId: 'turn-demo-centre', tag: 'B1', rssi: -66 },
        { venueId: 'turn-demo-centre', tag: 'ZZ', rssi: -60 },
      ]),
    );
    expect(((await r.json()) as { stored: number }).stored).toBe(2);
    const h = (await (
      await app.request('/venues/turn-demo-centre/beacons/health', {
        headers: auth,
      })
    ).json()) as {
      tag: string;
      status: string;
      reports24h: number;
      medianRssi24h: number | null;
    }[];
    expect(h.find((b) => b.tag === 'B1')).toMatchObject({
      status: 'ok',
      reports24h: 2,
    });
    expect(h.find((b) => b.tag === 'B2')).toMatchObject({
      status: 'never',
      reports24h: 0,
      medianRssi24h: null,
    });
  });
});
