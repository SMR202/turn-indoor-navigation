import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createApp } from './app';
import { openDb } from './db';
import { seed } from './seed';

const json = (body: unknown, token?: string, method = 'POST') => ({
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

function lanApp(mapAssetsDir?: string) {
  const db = openDb(':memory:');
  seed(db);
  db.prepare(
    "UPDATE venues SET visibility = 'private-lan' WHERE id = 'turn-demo-centre'",
  ).run();
  return createApp(db, { includePrivateLan: true, mapAssetsDir });
}
async function login(app: ReturnType<typeof createApp>, email: string) {
  const r = await app.request('/auth/dev-login', json({ email }));
  return ((await r.json()) as { token: string }).token;
}

it('stores the venue georeference from Studio and serves it with the orientation phones learned', async () => {
  const app = lanApp();
  const owner = await login(app, 'owner@harbour.demo');
  const put = await app.request(
    '/venues/turn-demo-centre/georeference',
    json(
      {
        lat: 33.656,
        lon: 73.0136,
        bearingDeg: 37,
        declinationDeg: 3.5,
        source: 'studio',
      },
      owner,
      'PUT',
    ),
  );
  expect(put.status).toBe(200);
  // Confident walks are kept per platform; a short or unsure one is not.
  for (const offset of [0.5, 0.52, 0.48])
    await app.request(
      '/public/venues/turn-demo-centre/orientation',
      json({
        platform: 'android',
        northOffsetRad: offset,
        spreadRad: 0.1,
        walkedMetres: 30,
      }),
    );
  const unsure = await app.request(
    '/public/venues/turn-demo-centre/orientation',
    json({
      platform: 'ios',
      northOffsetRad: 2,
      spreadRad: 0.6,
      walkedMetres: 30,
    }),
  );
  expect(((await unsure.json()) as { stored: boolean }).stored).toBe(false);
  const o = (await (
    await app.request('/public/venues/turn-demo-centre/orientation')
  ).json()) as {
    georeference: { bearingDeg: number; source: string } | null;
    learned: Record<string, { northOffsetRad: number; samples: number }>;
  };
  expect(o.georeference?.bearingDeg).toBe(37);
  expect(o.learned.android?.samples).toBe(3);
  expect(o.learned.android?.northOffsetRad).toBeCloseTo(0.5, 2);
  expect(o.learned.ios).toBeUndefined();
  // Removing it.
  await app.request(
    '/venues/turn-demo-centre/georeference',
    json(null, owner, 'PUT'),
  );
  const after = (await (
    await app.request('/public/venues/turn-demo-centre/orientation')
  ).json()) as { georeference: unknown };
  expect(after.georeference).toBeNull();
});

it('serves map glyphs and icons from the asset folder only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'turn-map-'));
  mkdirSync(join(dir, 'glyphs', 'Inter SemiBold'), { recursive: true });
  mkdirSync(join(dir, 'icons'));
  writeFileSync(
    join(dir, 'glyphs', 'Inter SemiBold', '0-255.pbf'),
    Buffer.from([1, 2, 3]),
  );
  writeFileSync(join(dir, 'icons', 'cat-food@2x.png'), Buffer.from([9]));
  const app = lanApp(dir);
  const g = await app.request('/map/glyphs/Inter%20SemiBold/0-255.pbf');
  expect(g.status).toBe(200);
  expect(new Uint8Array(await g.arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  // A range we do not ship is empty, not an error.
  const empty = await app.request('/map/glyphs/Inter%20SemiBold/512-767.pbf');
  expect(empty.status).toBe(200);
  expect((await empty.arrayBuffer()).byteLength).toBe(0);
  expect((await app.request('/map/glyphs/Comic%20Sans/0-255.pbf')).status).toBe(
    404,
  );
  expect(
    (await app.request('/map/glyphs/Inter%20SemiBold/..%2F..%2Fx')).status,
  ).toBe(404);
  expect((await app.request('/map/icons/cat-food.png')).status).toBe(200);
  expect((await app.request('/map/icons/..%2Fsecret.png')).status).toBe(404);
});

it('shares what phones of one model learned, as a median', async () => {
  const app = lanApp();
  for (const [step, offset] of [
    [0.7, -3],
    [0.64, -5],
    [0.66, -4],
  ] as const)
    await app.request(
      '/public/device-profiles',
      json({
        platform: 'android',
        model: 'Pixel 4a (5G)',
        stepLengthMetres: step,
        rssiOffsetDb: offset,
      }),
    );
  const got = (await (
    await app.request(
      '/public/device-profiles?platform=android&model=Pixel%204a%20(5G)',
    )
  ).json()) as {
    stepLengthMetres: number;
    rssiOffsetDb: number;
    samples: number;
  };
  expect(got).toEqual({ stepLengthMetres: 0.66, rssiOffsetDb: -4, samples: 3 });
  const none = await app.request(
    '/public/device-profiles?platform=ios&model=iPhone16,1',
  );
  expect(await none.json()).toBeNull();
});
