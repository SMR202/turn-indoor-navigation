import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { demoCentre } from '@turn/venue-model';
import { openDb } from './db';
import { seed, syncPrivateVenues, upgradeDemo } from './seed';

it('upgrades an older demo map to the current demo revision once, keeping place details', () => {
  const db = openDb(':memory:');
  seed(db);
  expect(upgradeDemo(db)).toBe(false);
  const old = { ...demoCentre, revision: '1' };
  db.prepare(
    "UPDATE versions SET package = ? WHERE venue_id = 'turn-demo-centre' AND status = 'published'",
  ).run(JSON.stringify(old));
  expect(upgradeDemo(db)).toBe(true);
  const live = db
    .prepare(
      "SELECT number, package, content FROM versions WHERE venue_id = 'turn-demo-centre' AND status = 'published'",
    )
    .get() as {
    number: number;
    package: string;
    content: string;
  };
  expect(live.number).toBe(2);
  expect(JSON.parse(live.package).revision).toBe(demoCentre.revision);
  const places = JSON.parse(live.content).places as Record<string, unknown>;
  expect(places['poi-cafe']).toBeDefined();
  expect(places['poi-l1-cinema']).toBeDefined();
  expect(upgradeDemo(db)).toBe(false);
});

/** The demo map under another venue id, as a private package of this computer would be. */
const privateCopy = (venueId: string, extra: Record<string, string> = {}) =>
  JSON.stringify({
    ...demoCentre,
    venueId,
    anchors: demoCentre.anchors.map((a) => ({ ...a, venueId })),
    ...extra,
  });

it('serves every private venue file LAN-only, updates a changed map in place and leaves shared venues alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'turn-private-'));
  const db = openDb(':memory:');
  seed(db);
  const campus = join(dir, 'campus.json');
  writeFileSync(campus, privateCopy('campus-c-f4', { name: 'Campus' }));
  const clash = join(dir, 'clash.json');
  writeFileSync(clash, JSON.stringify({ ...demoCentre, revision: 'x' }));
  const broken = join(dir, 'broken.json');
  writeFileSync(broken, '{}');
  expect(
    syncPrivateVenues(db, [campus, clash, broken, join(dir, 'missing.json')]),
  ).toEqual([
    'added campus-c-f4',
    'skipped turn-demo-centre (a shared venue has that id)',
    `skipped ${broken} (not a valid venue package)`,
  ]);
  const venue = db
    .prepare("SELECT visibility FROM venues WHERE id = 'campus-c-f4'")
    .get() as { visibility: string };
  expect(venue.visibility).toBe('private-lan');
  expect(syncPrivateVenues(db, [campus])).toEqual([]);

  db.prepare("UPDATE venues SET content = ? WHERE id = 'campus-c-f4'").run(
    JSON.stringify({ places: {}, beacons: [{ id: 'b1' }], branding: {} }),
  );
  writeFileSync(
    campus,
    privateCopy('campus-c-f4', { name: 'Campus C-F4', revision: 'r2' }),
  );
  expect(syncPrivateVenues(db, [campus])).toEqual([
    'updated campus-c-f4 to r2',
  ]);
  const after = db
    .prepare(
      "SELECT v.name, v.content, x.number, x.package FROM venues v JOIN versions x ON x.venue_id = v.id WHERE v.id = 'campus-c-f4'",
    )
    .all() as {
    name: string;
    content: string;
    number: number;
    package: string;
  }[];
  expect(after).toHaveLength(1);
  expect(after[0]!.name).toBe('Campus C-F4');
  expect(JSON.parse(after[0]!.package).revision).toBe('r2');
  expect(JSON.parse(after[0]!.content).beacons).toEqual([{ id: 'b1' }]);
  const demo = db
    .prepare(
      "SELECT package FROM versions WHERE venue_id = 'turn-demo-centre' AND status = 'published'",
    )
    .get() as { package: string };
  expect(JSON.parse(demo.package).revision).toBe(demoCentre.revision);
});
