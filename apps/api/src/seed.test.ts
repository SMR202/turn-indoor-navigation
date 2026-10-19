import { expect, it } from 'vitest';
import { demoCentre } from '@turn/venue-model';
import { openDb } from './db';
import { seed, upgradeDemo } from './seed';

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
