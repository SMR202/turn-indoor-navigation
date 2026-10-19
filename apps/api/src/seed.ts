import { existsSync, readFileSync } from 'node:fs';
import { demoCentre, parseVenuePackage } from '@turn/venue-model';
import type { Db } from './db';

const now = () => new Date().toISOString();

/** Place details for the demo's Level 1 (fictional). */
const upperContent = {
  'poi-l1-food-court': {
    description:
      'Twelve kitchens around shared seating with a view over the harbour.',
    hours: '11:00–22:00',
    tags: ['lunch', 'dinner', 'food'],
    accessible: true,
  },
  'poi-l1-cinema': {
    description: 'Six screens, including one with audio description.',
    hours: '12:00–23:30',
    tags: ['movies', 'film'],
    accessible: true,
  },
  'poi-l1-play': {
    description: 'Soft play for ages 1–8.',
    hours: '09:00–19:00',
  },
  'poi-l1-restrooms': {
    description: 'Restrooms with baby changing.',
    accessible: true,
  },
};

/**
 * Brings an existing development database up to the current fictional demo venue: publishes the new
 * demo revision as a new version and adds missing place details. Never touches other venues.
 */
export function upgradeDemo(db: Db) {
  const live = db
    .prepare(
      "SELECT number, package FROM versions WHERE venue_id = 'turn-demo-centre' AND status = 'published'",
    )
    .get() as { number: number; package: string } | undefined;
  if (
    !live ||
    (JSON.parse(live.package) as { revision: string }).revision ===
      demoCentre.revision
  )
    return false;
  const row = db
    .prepare("SELECT content FROM venues WHERE id = 'turn-demo-centre'")
    .get() as { content: string };
  const content = JSON.parse(row.content) as {
    places: Record<string, unknown>;
  };
  content.places = { ...upperContent, ...content.places };
  const t = now();
  const max = (
    db
      .prepare(
        "SELECT MAX(number) AS n FROM versions WHERE venue_id = 'turn-demo-centre'",
      )
      .get() as { n: number }
  ).n;
  db.exec('BEGIN');
  db.prepare(
    "UPDATE versions SET status = 'archived' WHERE venue_id = 'turn-demo-centre' AND status IN ('published', 'draft')",
  ).run();
  db.prepare(
    "INSERT INTO versions (venue_id, number, status, package, content, notes, created_by, created_at, published_at) VALUES ('turn-demo-centre', ?, 'published', ?, ?, 'Level 1 with stairs and lift (demo upgrade)', NULL, ?, ?)",
  ).run(max + 1, JSON.stringify(demoCentre), JSON.stringify(content), t, t);
  db.prepare(
    "UPDATE venues SET content = ?, updated_at = ? WHERE id = 'turn-demo-centre'",
  ).run(JSON.stringify(content), t);
  db.exec('COMMIT');
  return true;
}

/** Deterministic pseudo-random numbers so seeded sample analytics are stable between runs. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/**
 * Seeds a fresh database: TURN staff, a fictional demo customer with the TURN Demo Centre (published,
 * with clearly flagged SAMPLE analytics), and, when present on this computer, the private home venue
 * (visible on the LAN only, never public). Runs only when the database has no organisations.
 */
export function seed(db: Db, options: { privateVenuePath?: string } = {}) {
  const count = (
    db.prepare('SELECT COUNT(*) AS n FROM orgs').get() as { n: number }
  ).n;
  if (count > 0) return false;
  const run = (sql: string, ...a: (string | number | null)[]) =>
    db.prepare(sql).run(...a);
  const t = now();
  run(
    'INSERT INTO orgs VALUES (?, ?, ?, ?)',
    'org_turn',
    'TURN',
    'enterprise',
    t,
  );
  run(
    'INSERT INTO orgs VALUES (?, ?, ?, ?)',
    'org_harbour',
    'Harbour Group (demo)',
    'standard',
    t,
  );
  run(
    'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
    'usr_ops',
    'ops@turn.local',
    'TURN Operations',
    'staff',
    null,
    t,
  );
  run(
    'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
    'usr_owner',
    'owner@harbour.demo',
    'Amira Khan',
    'owner',
    'org_harbour',
    t,
  );
  run(
    'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
    'usr_editor',
    'editor@harbour.demo',
    'Leo Park',
    'editor',
    'org_harbour',
    t,
  );

  const content = {
    places: {
      'poi-cafe': {
        description:
          'Specialty coffee, pastries and quiet tables by the window.',
        hours: '07:30–19:00',
        tags: ['coffee', 'wifi'],
        accessible: true,
      },
      'poi-restrooms': {
        description: 'Accessible restrooms and baby changing.',
        hours: 'Open during centre hours',
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
      'poi-market': {
        description: 'Fresh produce, bakery and deli counter.',
        hours: '08:00–21:00',
      },
      'poi-meeting': {
        description: 'Bookable room for up to 10 people.',
        tags: ['bookable'],
      },
      'poi-stairs': {
        description: 'Stairs and a step-free lift to Level 1.',
        accessible: true,
      },
      ...upperContent,
    },
    beacons: [],
    branding: {},
  };
  run(
    'INSERT INTO venues VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'turn-demo-centre',
    'org_harbour',
    'TURN Demo Centre',
    '1 Harbour Walk (fictional)',
    'public',
    JSON.stringify(content),
    t,
    t,
  );
  run(
    "INSERT INTO versions (venue_id, number, status, package, content, notes, created_by, created_at, published_at) VALUES (?, 1, 'published', ?, ?, 'Initial map', 'usr_owner', ?, ?)",
    'turn-demo-centre',
    JSON.stringify(demoCentre),
    JSON.stringify(content),
    t,
    t,
  );

  // SAMPLE analytics for the fictional venue only (flagged sample = 1 so the console labels them).
  const r = rng(42);
  const places = [
    'poi-cafe',
    'poi-restrooms',
    'poi-pharmacy',
    'poi-market',
    'poi-books',
    'poi-info',
    'poi-outfitters',
  ];
  const searches = [
    'coffee',
    'toilet',
    'pharmacy',
    'cafe',
    'market',
    'books',
    'lift',
    'exit',
    'restroom',
  ];
  const insert = db.prepare(
    'INSERT INTO events (venue_id, type, place_id, query, session, at, sample) VALUES (?, ?, ?, ?, ?, ?, 1)',
  );
  for (let d = 29; d >= 0; d--) {
    const weekend = new Date(Date.now() - d * 864e5).getDay() % 6 === 0;
    const sessions = Math.round((weekend ? 70 : 45) + r() * 25);
    for (let s = 0; s < sessions; s++) {
      const session = `sample-${d}-${s}`;
      const at = new Date(
        Date.now() - d * 864e5 - r() * 10 * 3600e3,
      ).toISOString();
      insert.run('turn-demo-centre', 'venue_opened', null, null, session, at);
      if (r() < 0.55)
        insert.run(
          'turn-demo-centre',
          'search',
          null,
          searches[Math.floor(r() * searches.length)]!,
          session,
          at,
        );
      if (r() < 0.62) {
        const p = places[Math.floor(Math.pow(r(), 1.6) * places.length)]!;
        insert.run('turn-demo-centre', 'route_started', p, null, session, at);
        if (r() < 0.84)
          insert.run('turn-demo-centre', 'arrived', p, null, session, at);
      }
    }
  }

  // Private home venue: LAN-only testing (its rights forbid publication beyond local phone testing).
  const path = options.privateVenuePath;
  if (path && existsSync(path)) {
    try {
      const home = parseVenuePackage(JSON.parse(readFileSync(path, 'utf8')));
      run(
        'INSERT INTO orgs VALUES (?, ?, ?, ?)',
        'org_home',
        'Home (private)',
        'pilot',
        t,
      );
      run(
        'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
        'usr_home',
        'home@turn.local',
        'Home owner',
        'owner',
        'org_home',
        t,
      );
      run(
        'INSERT INTO venues VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        home.venueId,
        'org_home',
        home.name,
        'Private · LAN only',
        'private-lan',
        JSON.stringify({ places: {}, beacons: [], branding: {} }),
        t,
        t,
      );
      run(
        "INSERT INTO versions (venue_id, number, status, package, content, notes, created_by, created_at, published_at) VALUES (?, 1, 'published', ?, '{}', 'Imported plan (private)', 'usr_home', ?, ?)",
        home.venueId,
        JSON.stringify(home),
        t,
        t,
      );
    } catch {
      // A broken private file must not block the API.
    }
  }
  return true;
}
