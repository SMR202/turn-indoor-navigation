import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  importFloorGeoJson,
  parseVenuePackage,
  wallCrossings,
  type TurnFloorGeoJson,
  type VenuePackage,
} from '@turn/venue-model';
import type { Db } from './db';

/** Venue content that lives beside the geometry: place details, beacon layout, branding. */
export const placeContentSchema = z.object({
  description: z.string().max(600).optional(),
  hours: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  url: z.string().max(200).optional(),
  tags: z.array(z.string().max(30)).max(12).optional(),
  accessible: z.boolean().optional(),
  hidden: z.boolean().optional(),
  category: z.string().max(40).optional(),
  name: z.string().min(1).max(80).optional(),
});
export const venueContentSchema = z.object({
  places: z.record(z.string(), placeContentSchema).default({}),
  beacons: z
    .array(
      z.object({
        tag: z.string().min(1).max(24),
        floorId: z.string(),
        x: z.number(),
        y: z.number(),
      }),
    )
    .max(64)
    .default([]),
  branding: z
    .object({
      accent: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    })
    .default({}),
});
export type VenueContent = z.infer<typeof venueContentSchema>;

const eventSchema = z.object({
  venueId: z.string().min(1).max(80),
  type: z.enum([
    'venue_opened',
    'search',
    'place_viewed',
    'route_started',
    'arrived',
    'route_cancelled',
  ]),
  placeId: z.string().max(80).optional(),
  query: z.string().max(80).optional(),
  session: z.string().min(6).max(64),
  at: z.string().datetime().optional(),
});

type User = {
  id: string;
  email: string;
  name: string;
  role: 'staff' | 'owner' | 'editor';
  org_id: string | null;
};
type Vars = { user: User };
const now = () => new Date().toISOString();
/** Path parameter (always present for the routes that use it). */
const param = (c: Context, name: string) => c.req.param(name) ?? '';
const id = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'venue';

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: Record<string, number>;
};
/** The publish gate: schema, walk graph never crossing walls, every place reachable. */
export function validatePackage(pkg: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let venue: VenuePackage;
  try {
    venue = parseVenuePackage(pkg);
  } catch (e) {
    return {
      ok: false,
      errors: [
        `Invalid venue package: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`,
      ],
      warnings,
      stats: {},
    };
  }
  const crossing = wallCrossings(venue);
  if (crossing.length)
    errors.push(`${crossing.length} walking connections cross walls.`);
  const adj = new Map<string, string[]>();
  for (const e of venue.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    if (e.bidirectional) adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const start = venue.pois[0]?.nodeId;
  const seen = new Set<string>(start ? [start] : []);
  const queue = start ? [start] : [];
  while (queue.length)
    for (const n of adj.get(queue.shift()!) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  const unreachable = venue.pois.filter((p) => !seen.has(p.nodeId));
  if (unreachable.length)
    errors.push(
      `Unreachable places: ${unreachable.map((p) => p.name).join(', ')}.`,
    );
  if (!venue.pois.length)
    errors.push('A venue needs at least one destination.');
  if (!venue.anchors.length)
    warnings.push('No QR entry points: visitors can still tap their position.');
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      floors: venue.floors.length,
      rooms: venue.floors.reduce((n, f) => n + f.rooms.length, 0),
      places: venue.pois.length,
      doors: venue.floors.reduce((n, f) => n + f.doors.length, 0),
      paths: venue.edges.length,
      entryPoints: venue.anchors.length,
    },
  };
}

export function createApp(
  db: Db,
  options: { devAuth?: boolean; includePrivateLan?: boolean } = {},
) {
  const app = new Hono<{ Variables: Vars }>();
  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Authorization', 'Content-Type', 'If-None-Match'],
      exposeHeaders: ['ETag'],
    }),
  );
  app.onError((err, c) => {
    if (err instanceof z.ZodError)
      return c.json(
        { error: 'Invalid request', issues: err.issues.slice(0, 5) },
        400,
      );
    return c.json({ error: err.message || 'Server error' }, 500);
  });
  const one = <T>(sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).get(...args) as T | undefined;
  const all = <T>(sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).all(...args) as T[];
  const run = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).run(...args);

  // ---------- auth ----------
  const auth = async (
    c: Context<{ Variables: Vars }>,
    next: () => Promise<void>,
  ) => {
    const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
    const user = token
      ? one<User>(
          'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
          token,
        )
      : undefined;
    if (!user) return c.json({ error: 'Sign in required' }, 401);
    c.set('user', user);
    await next();
  };
  const canSee = (u: User, orgId: string) =>
    u.role === 'staff' || u.org_id === orgId;
  const venueFor = (c: Context<{ Variables: Vars }>, venueId: string) => {
    const v = one<{
      id: string;
      org_id: string;
      name: string;
      address: string;
      visibility: string;
      content: string;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM venues WHERE id = ?', venueId);
    if (!v || !canSee(c.get('user'), v.org_id)) return null;
    return v;
  };

  app.get('/health', (c) =>
    c.json({ ok: true, service: 'turn-api', time: now() }),
  );
  app.post('/auth/dev-login', async (c) => {
    if (options.devAuth === false)
      return c.json({ error: 'Development sign-in is disabled' }, 403);
    const { email } = z
      .object({ email: z.string().email() })
      .parse(await c.req.json());
    const user = one<User>(
      'SELECT * FROM users WHERE email = ?',
      email.toLowerCase(),
    );
    if (!user) return c.json({ error: 'No account for that email' }, 404);
    const token = randomBytes(24).toString('hex');
    run(
      'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
      token,
      user.id,
      now(),
    );
    return c.json({ token, user });
  });
  app.get('/me', auth, (c) => {
    const u = c.get('user');
    const orgs =
      u.role === 'staff'
        ? all('SELECT * FROM orgs ORDER BY name')
        : all('SELECT * FROM orgs WHERE id = ?', u.org_id);
    return c.json({ user: u, orgs });
  });

  // ---------- organisations (staff) ----------
  app.get('/orgs', auth, (c) => {
    const u = c.get('user');
    const rows =
      u.role === 'staff'
        ? all('SELECT * FROM orgs ORDER BY name')
        : all('SELECT * FROM orgs WHERE id = ?', u.org_id);
    return c.json(rows);
  });
  app.post('/orgs', auth, async (c) => {
    if (c.get('user').role !== 'staff')
      return c.json({ error: 'TURN staff only' }, 403);
    const body = z
      .object({
        name: z.string().min(2).max(80),
        plan: z.enum(['pilot', 'standard', 'enterprise']).default('pilot'),
      })
      .parse(await c.req.json());
    const org = {
      id: id('org'),
      name: body.name,
      plan: body.plan,
      created_at: now(),
    };
    run(
      'INSERT INTO orgs (id, name, plan, created_at) VALUES (?, ?, ?, ?)',
      org.id,
      org.name,
      org.plan,
      org.created_at,
    );
    return c.json(org, 201);
  });

  // ---------- venues ----------
  const summary = (v: {
    id: string;
    org_id: string;
    name: string;
    address: string;
    visibility: string;
    content: string;
    created_at: string;
    updated_at: string;
  }) => {
    const published = one<{
      number: number;
      published_at: string;
      package: string;
    }>(
      "SELECT number, published_at, package FROM versions WHERE venue_id = ? AND status = 'published'",
      v.id,
    );
    const draft = one<{ number: number; created_at: string }>(
      "SELECT number, created_at FROM versions WHERE venue_id = ? AND status = 'draft'",
      v.id,
    );
    const content = venueContentSchema.parse(JSON.parse(v.content));
    const pkg = published
      ? (JSON.parse(published.package) as VenuePackage)
      : null;
    const lastWeek = new Date(Date.now() - 7 * 864e5).toISOString();
    const sessions =
      one<{ n: number }>(
        'SELECT COUNT(DISTINCT session) AS n FROM events WHERE venue_id = ? AND at >= ?',
        v.id,
        lastWeek,
      )?.n ?? 0;
    const evalRow = one<{ summary: string; at: string }>(
      'SELECT summary, at FROM eval_results WHERE venue_id = ? ORDER BY at DESC LIMIT 1',
      v.id,
    );
    return {
      id: v.id,
      orgId: v.org_id,
      orgName:
        one<{ name: string }>('SELECT name FROM orgs WHERE id = ?', v.org_id)
          ?.name ?? '',
      name: v.name,
      address: v.address,
      visibility: v.visibility,
      status: published ? 'live' : draft ? 'draft' : 'empty',
      publishedVersion: published?.number ?? null,
      publishedAt: published?.published_at ?? null,
      draftVersion: draft?.number ?? null,
      places: pkg?.pois.length ?? 0,
      floors: pkg?.floors.length ?? 0,
      beacons: content.beacons.length,
      sessions7d: sessions,
      quality: evalRow
        ? { ...JSON.parse(evalRow.summary), at: evalRow.at }
        : null,
      updatedAt: v.updated_at,
    };
  };
  app.get('/venues', auth, (c) => {
    const u = c.get('user');
    const org = c.req.query('org');
    const rows = all<Parameters<typeof summary>[0]>(
      'SELECT * FROM venues ORDER BY updated_at DESC',
    ).filter((v) => canSee(u, v.org_id) && (!org || v.org_id === org));
    return c.json(rows.map(summary));
  });
  app.post('/venues', auth, async (c) => {
    const u = c.get('user');
    const body = z
      .object({
        orgId: z.string(),
        name: z.string().min(2).max(80),
        address: z.string().max(160).default(''),
      })
      .parse(await c.req.json());
    if (!canSee(u, body.orgId) || u.role === 'editor')
      return c.json({ error: 'Not allowed' }, 403);
    let vid = slug(body.name);
    while (one('SELECT id FROM venues WHERE id = ?', vid))
      vid = `${slug(body.name)}-${randomBytes(2).toString('hex')}`;
    run(
      'INSERT INTO venues (id, org_id, name, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      vid,
      body.orgId,
      body.name,
      body.address,
      now(),
      now(),
    );
    return c.json(summary(one('SELECT * FROM venues WHERE id = ?', vid)!), 201);
  });
  app.get('/venues/:id', auth, (c) => {
    const v = venueFor(c, param(c, 'id'));
    return v
      ? c.json({
          ...summary(v),
          content: venueContentSchema.parse(JSON.parse(v.content)),
        })
      : c.json({ error: 'Not found' }, 404);
  });
  app.patch('/venues/:id', auth, async (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    const body = z
      .object({
        name: z.string().min(2).max(80).optional(),
        address: z.string().max(160).optional(),
      })
      .parse(await c.req.json());
    run(
      'UPDATE venues SET name = ?, address = ?, updated_at = ? WHERE id = ?',
      body.name ?? v.name,
      body.address ?? v.address,
      now(),
      v.id,
    );
    return c.json(summary(one('SELECT * FROM venues WHERE id = ?', v.id)!));
  });

  // ---------- drafts, content, import, publish ----------
  const currentPackage = (venueId: string) =>
    one<{ package: string; number: number; status: string }>(
      "SELECT package, number, status FROM versions WHERE venue_id = ? AND status IN ('draft','published') ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END LIMIT 1",
      venueId,
    );
  const saveDraft = (venueId: string, pkg: unknown, userId: string) => {
    const draft = one<{ id: number }>(
      "SELECT id FROM versions WHERE venue_id = ? AND status = 'draft'",
      venueId,
    );
    const json = JSON.stringify(pkg);
    if (draft)
      run(
        'UPDATE versions SET package = ?, created_at = ?, created_by = ? WHERE id = ?',
        json,
        now(),
        userId,
        draft.id,
      );
    else {
      const max =
        one<{ n: number | null }>(
          'SELECT MAX(number) AS n FROM versions WHERE venue_id = ?',
          venueId,
        )?.n ?? 0;
      run(
        "INSERT INTO versions (venue_id, number, status, package, created_by, created_at) VALUES (?, ?, 'draft', ?, ?, ?)",
        venueId,
        max + 1,
        json,
        userId,
        now(),
      );
    }
    run('UPDATE venues SET updated_at = ? WHERE id = ?', now(), venueId);
  };
  app.get('/venues/:id/package', auth, (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    const cur = currentPackage(v.id);
    if (!cur) return c.json({ error: 'No map yet. Import a floor plan.' }, 404);
    const pkg = JSON.parse(cur.package);
    return c.json({
      status: cur.status,
      number: cur.number,
      package: pkg,
      validation: validatePackage(pkg),
    });
  });
  app.put('/venues/:id/package', auth, async (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    const pkg = await c.req.json();
    const validation = validatePackage(pkg);
    saveDraft(v.id, pkg, c.get('user').id);
    return c.json({ validation });
  });
  app.post('/venues/:id/import', auth, async (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    const body = z
      .object({
        geojson: z.unknown(),
        floorLabel: z.string().max(40).optional(),
      })
      .parse(await c.req.json());
    try {
      const { venue, report } = importFloorGeoJson(
        body.geojson as TurnFloorGeoJson,
        {
          venueId: v.id,
          name: v.name,
          floorLabel: body.floorLabel,
        },
      );
      saveDraft(v.id, venue, c.get('user').id);
      return c.json({ report, validation: validatePackage(venue) });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 422);
    }
  });
  app.patch('/venues/:id/places/:placeId', auth, async (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    const patch = placeContentSchema.parse(await c.req.json());
    const content = venueContentSchema.parse(JSON.parse(v.content));
    content.places[param(c, 'placeId')] = {
      ...content.places[param(c, 'placeId')],
      ...patch,
    };
    run(
      'UPDATE venues SET content = ?, updated_at = ? WHERE id = ?',
      JSON.stringify(content),
      now(),
      v.id,
    );
    return c.json(content.places[param(c, 'placeId')]);
  });
  app.put('/venues/:id/beacons', auth, async (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    const beacons = venueContentSchema.shape.beacons.parse(await c.req.json());
    const content = venueContentSchema.parse(JSON.parse(v.content));
    content.beacons = beacons;
    run(
      'UPDATE venues SET content = ?, updated_at = ? WHERE id = ?',
      JSON.stringify(content),
      now(),
      v.id,
    );
    return c.json(beacons);
  });
  app.get('/venues/:id/beacons/health', auth, (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    const content = venueContentSchema.parse(JSON.parse(v.content));
    return c.json(
      content.beacons.map((b) => {
        const last = one<{
          rssi: number | null;
          battery: number | null;
          at: string;
        }>(
          'SELECT rssi, battery, at FROM beacon_reports WHERE venue_id = ? AND tag = ? ORDER BY at DESC LIMIT 1',
          v.id,
          b.tag,
        );
        return {
          ...b,
          lastSeen: last?.at ?? null,
          rssi: last?.rssi ?? null,
          battery: last?.battery ?? null,
        };
      }),
    );
  });
  app.post('/venues/:id/publish', auth, async (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    if (c.get('user').role === 'editor')
      return c.json({ error: 'Only owners can publish' }, 403);
    const { notes } = z
      .object({ notes: z.string().max(400).default('') })
      .parse(await c.req.json().catch(() => ({})));
    const draft = one<{ id: number; package: string; number: number }>(
      "SELECT id, package, number FROM versions WHERE venue_id = ? AND status = 'draft'",
      v.id,
    );
    if (!draft)
      return c.json({ error: 'Nothing to publish: no draft changes.' }, 409);
    const validation = validatePackage(JSON.parse(draft.package));
    if (!validation.ok)
      return c.json(
        { error: 'Fix validation errors before publishing.', validation },
        422,
      );
    db.exec('BEGIN');
    try {
      run(
        "UPDATE versions SET status = 'archived' WHERE venue_id = ? AND status = 'published'",
        v.id,
      );
      run(
        "UPDATE versions SET status = 'published', published_at = ?, notes = ?, content = ? WHERE id = ?",
        now(),
        notes,
        v.content,
        draft.id,
      );
      run('UPDATE venues SET updated_at = ? WHERE id = ?', now(), v.id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return c.json({ published: draft.number, validation });
  });
  app.get('/venues/:id/versions', auth, (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    return c.json(
      all<{
        number: number;
        status: string;
        notes: string;
        created_at: string;
        published_at: string | null;
        created_by: string | null;
        package: string;
      }>(
        'SELECT number, status, notes, created_at, published_at, created_by, package FROM versions WHERE venue_id = ? ORDER BY number DESC',
        v.id,
      ).map(({ package: p, ...r }) => {
        const pkg = JSON.parse(p) as VenuePackage;
        return {
          ...r,
          places: pkg.pois.length,
          rooms: pkg.floors.reduce((n, f) => n + f.rooms.length, 0),
        };
      }),
    );
  });

  // ---------- analytics ----------
  app.get('/venues/:id/analytics', auth, (c) => {
    const v = venueFor(c, param(c, 'id'));
    if (!v) return c.json({ error: 'Not found' }, 404);
    const days = Math.min(90, Math.max(1, Number(c.req.query('days') ?? 30)));
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const daily = all<{
      day: string;
      sessions: number;
      routes: number;
      arrivals: number;
    }>(
      `SELECT substr(at, 1, 10) AS day, COUNT(DISTINCT session) AS sessions,
        SUM(type = 'route_started') AS routes, SUM(type = 'arrived') AS arrivals
       FROM events WHERE venue_id = ? AND at >= ? GROUP BY day ORDER BY day`,
      v.id,
      since,
    );
    const topSearches = all<{ query: string; n: number }>(
      "SELECT lower(query) AS query, COUNT(*) AS n FROM events WHERE venue_id = ? AND at >= ? AND type = 'search' AND query IS NOT NULL GROUP BY lower(query) ORDER BY n DESC LIMIT 8",
      v.id,
      since,
    );
    const topDestinations = all<{ placeId: string; n: number }>(
      "SELECT place_id AS placeId, COUNT(*) AS n FROM events WHERE venue_id = ? AND at >= ? AND type = 'route_started' AND place_id IS NOT NULL GROUP BY place_id ORDER BY n DESC LIMIT 8",
      v.id,
      since,
    );
    const totals = one<{
      sessions: number;
      routes: number;
      arrivals: number;
      sample: number;
    }>(
      "SELECT COUNT(DISTINCT session) AS sessions, SUM(type = 'route_started') AS routes, SUM(type = 'arrived') AS arrivals, MAX(sample) AS sample FROM events WHERE venue_id = ? AND at >= ?",
      v.id,
      since,
    ) ?? { sessions: 0, routes: 0, arrivals: 0, sample: 0 };
    return c.json({
      days,
      sampleData: Boolean(totals.sample),
      totals: {
        sessions: totals.sessions ?? 0,
        routes: totals.routes ?? 0,
        arrivals: totals.arrivals ?? 0,
        completion: totals.routes
          ? (totals.arrivals ?? 0) / totals.routes
          : null,
      },
      daily,
      topSearches,
      topDestinations,
    });
  });

  // ---------- ops (staff) ----------
  app.get('/ops/overview', auth, (c) => {
    if (c.get('user').role !== 'staff')
      return c.json({ error: 'TURN staff only' }, 403);
    const venues = all<Parameters<typeof summary>[0]>(
      'SELECT * FROM venues ORDER BY updated_at DESC',
    ).map(summary);
    const stage = (v: ReturnType<typeof summary>) =>
      v.status === 'live'
        ? v.quality
          ? 'measured'
          : 'live'
        : v.places
          ? 'content'
          : v.draftVersion
            ? 'map'
            : 'created';
    return c.json({
      orgs: one<{ n: number }>('SELECT COUNT(*) AS n FROM orgs')?.n ?? 0,
      venues: venues.length,
      live: venues.filter((v) => v.status === 'live').length,
      sessions7d: venues.reduce((n, v) => n + v.sessions7d, 0),
      pipeline: venues.map((v) => ({ ...v, stage: stage(v) })),
    });
  });
  app.post('/ops/venues/:id/eval', auth, async (c) => {
    if (c.get('user').role !== 'staff')
      return c.json({ error: 'TURN staff only' }, 403);
    const body = z
      .object({
        walks: z.number().int().nonnegative(),
        medianErrorM: z.number().nonnegative().nullable(),
        standingDriftM: z.number().nonnegative().nullable(),
        note: z.string().max(200).default(''),
      })
      .parse(await c.req.json());
    run(
      'INSERT INTO eval_results (venue_id, summary, at) VALUES (?, ?, ?)',
      param(c, 'id'),
      JSON.stringify(body),
      now(),
    );
    return c.json(body, 201);
  });

  // ---------- public (visitor app, no auth) ----------
  const visible = (v: { visibility: string }) =>
    v.visibility === 'public' || options.includePrivateLan === true;
  app.get('/public/venues', (c) => {
    const rows = all<{
      id: string;
      name: string;
      address: string;
      org_id: string;
      visibility: string;
      number: number;
      published_at: string;
      package: string;
      content: string;
    }>(
      "SELECT v.id, v.name, v.address, v.org_id, v.visibility, s.number, s.published_at, s.package, s.content FROM venues v JOIN versions s ON s.venue_id = v.id AND s.status = 'published' ORDER BY v.name",
    ).filter(visible);
    return c.json(
      rows.map((r) => {
        const pkg = JSON.parse(r.package) as VenuePackage;
        return {
          id: r.id,
          name: r.name,
          address: r.address,
          organisation:
            one<{ name: string }>(
              'SELECT name FROM orgs WHERE id = ?',
              r.org_id,
            )?.name ?? '',
          version: r.number,
          publishedAt: r.published_at,
          places: pkg.pois.length,
          floors: pkg.floors.length,
          private: r.visibility === 'private-lan',
          accent:
            venueContentSchema.parse(JSON.parse(r.content)).branding.accent ??
            null,
        };
      }),
    );
  });
  app.get('/public/venues/:id', (c) => {
    const row = one<{
      number: number;
      package: string;
      content: string;
      visibility: string;
    }>(
      "SELECT s.number, s.package, s.content, v.visibility FROM versions s JOIN venues v ON v.id = s.venue_id WHERE s.venue_id = ? AND s.status = 'published'",
      param(c, 'id'),
    );
    if (!row || !visible(row)) return c.json({ error: 'Not found' }, 404);
    const body = JSON.stringify({
      version: row.number,
      package: JSON.parse(row.package),
      content: JSON.parse(row.content),
    });
    const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;
    if (c.req.header('If-None-Match') === etag)
      return c.body(null, 304, { ETag: etag });
    return c.body(body, 200, {
      'Content-Type': 'application/json',
      ETag: etag,
      'Cache-Control': 'no-cache',
    });
  });
  app.post('/public/events', async (c) => {
    const events = z
      .array(eventSchema)
      .max(100)
      .parse(await c.req.json());
    for (const e of events)
      run(
        'INSERT INTO events (venue_id, type, place_id, query, session, at) VALUES (?, ?, ?, ?, ?, ?)',
        e.venueId,
        e.type,
        e.placeId ?? null,
        e.query?.trim().slice(0, 80) ?? null,
        e.session,
        e.at ?? now(),
      );
    return c.json({ stored: events.length });
  });
  app.post('/public/beacon-reports', async (c) => {
    const reports = z
      .array(
        z.object({
          venueId: z.string().max(80),
          tag: z.string().max(24),
          rssi: z.number().optional(),
          battery: z.number().min(0).max(100).optional(),
        }),
      )
      .max(64)
      .parse(await c.req.json());
    for (const r of reports)
      run(
        'INSERT INTO beacon_reports (venue_id, tag, rssi, battery, at) VALUES (?, ?, ?, ?, ?)',
        r.venueId,
        r.tag,
        r.rssi ?? null,
        r.battery ?? null,
        now(),
      );
    return c.json({ stored: reports.length });
  });

  return app;
}
