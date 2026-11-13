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

it('stores offers with defaults, counts them anonymously and lists failed searches', async () => {
  const db = openDb(':memory:');
  seed(db);
  const app = createApp(db);
  const login = await app.request(
    '/auth/dev-login',
    json({ email: 'owner@harbour.demo' }),
  );
  const { token } = (await login.json()) as { token: string };
  const base = '/venues/turn-demo-centre';

  const saved = await app.request(
    `${base}/offers/offer-coffee`,
    json({ title: '10% off coffee', placeId: 'poi-cafe' }, token, 'PUT'),
  );
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({
    id: 'offer-coffee',
    radiusMetres: 15,
    dwellSeconds: 0,
    cooldownMinutes: 240,
    active: true,
  });
  // A bad id, and an offer that ends before it starts, are refused.
  expect(
    (
      await app.request(
        `${base}/offers/Coffee%20Deal`,
        json({ title: 'x', placeId: 'poi-cafe' }, token, 'PUT'),
      )
    ).status,
  ).toBeGreaterThanOrEqual(400);
  expect(
    (
      await app.request(
        `${base}/offers/offer-late`,
        json(
          {
            title: 'Late',
            placeId: 'poi-cafe',
            startsAt: '2026-12-02T00:00:00.000Z',
            endsAt: '2026-12-01T00:00:00.000Z',
          },
          token,
          'PUT',
        ),
      )
    ).status,
  ).toBe(422);

  const venue = (await (
    await app.request(base, { headers: { Authorization: `Bearer ${token}` } })
  ).json()) as { content: { offers: { id: string }[] } };
  // The demo venue ships with sample offers; the new one joins them.
  expect(venue.content.offers.map((o) => o.id)).toContain('offer-coffee');

  // Phones report counts only; the offer id travels in `query`.
  const event = (type: string, query: string) => ({
    venueId: 'turn-demo-centre',
    type,
    query,
    session: 'session-1',
  });
  const posted = await app.request(
    '/public/events',
    json([
      event('offer_shown', 'offer-coffee'),
      event('offer_shown', 'offer-coffee'),
      event('offer_opened', 'offer-coffee'),
      event('search_failed', 'Prayer hall'),
    ]),
  );
  expect(posted.status).toBe(200);
  const analytics = (await (
    await app.request(`${base}/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as {
    offers: { offerId: string; shown: number; opened: number }[];
    failedSearches: { query: string; n: number }[];
  };
  expect(analytics.offers).toContainEqual(
    expect.objectContaining({ offerId: 'offer-coffee', shown: 2, opened: 1 }),
  );
  expect(analytics.failedSearches).toContainEqual({
    query: 'prayer hall',
    n: 1,
  });

  await app.request(`${base}/offers/offer-coffee`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const after = (await (
    await app.request(base, { headers: { Authorization: `Bearer ${token}` } })
  ).json()) as { content: { offers: { id: string }[] } };
  expect(after.content.offers.map((o) => o.id)).not.toContain('offer-coffee');
});
