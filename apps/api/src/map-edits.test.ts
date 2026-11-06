import { expect, it } from 'vitest';
import { createApp } from './app';
import { openDb } from './db';
import { seed } from './seed';

const json = (body: unknown, token: string, method = 'POST') => ({
  method,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(body),
});

it('saves Studio map edits: moved and added places, renamed and staff-only rooms', async () => {
  const db = openDb(':memory:');
  seed(db);
  const app = createApp(db);
  const login = await app.request('/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@harbour.demo' }),
  });
  const { token } = (await login.json()) as { token: string };
  const base = '/venues/turn-demo-centre';

  const moved = await app.request(
    `${base}/places/poi-cafe`,
    json({ position: { x: 8, y: 28 } }, token, 'PATCH'),
  );
  expect(moved.status).toBe(200);
  const added = await app.request(
    `${base}/custom-places/custom-water`,
    json(
      { floorId: 'ground', x: 20, y: 18, name: 'Water', category: 'service' },
      token,
      'PUT',
    ),
  );
  expect(added.status).toBe(200);
  const badId = await app.request(
    `${base}/custom-places/Not%20Valid`,
    json(
      { floorId: 'ground', x: 1, y: 1, name: 'X', category: 'service' },
      token,
      'PUT',
    ),
  );
  expect(badId.status).toBeGreaterThanOrEqual(400);
  await app.request(
    `${base}/rooms/books`,
    json({ name: 'Book Exchange', restricted: true }, token, 'PATCH'),
  );

  const venue = (await (
    await app.request(base, { headers: { Authorization: `Bearer ${token}` } })
  ).json()) as {
    content: {
      places: Record<string, { position?: { x: number } }>;
      customPlaces: { id: string }[];
      rooms: Record<string, { name?: string; restricted?: boolean }>;
    };
  };
  expect(venue.content.places['poi-cafe']?.position?.x).toBe(8);
  expect(venue.content.customPlaces.map((p) => p.id)).toEqual(['custom-water']);
  expect(venue.content.rooms.books).toEqual({
    name: 'Book Exchange',
    restricted: true,
  });

  // Clearing a room edit removes it; deleting an added place removes its details too.
  await app.request(`${base}/rooms/books`, json({}, token, 'PATCH'));
  await app.request(`${base}/custom-places/custom-water`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const after = (await (
    await app.request(base, { headers: { Authorization: `Bearer ${token}` } })
  ).json()) as { content: { customPlaces: unknown[]; rooms: object } };
  expect(after.content.customPlaces).toEqual([]);
  expect(after.content.rooms).toEqual({});
});
