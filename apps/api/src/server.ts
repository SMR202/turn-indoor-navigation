import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { openDb } from './db';
import { seed } from './seed';

// Local development server. Data lives in ignored work/api-data. The private home venue is served
// to the LAN only when TURN_API_PRIVATE_LAN is not "0" (local phone testing, as its rights allow).
const root = resolve(import.meta.dirname, '../../..');
const dataDir = resolve(root, 'work/api-data');
mkdirSync(dataDir, { recursive: true });
const db = openDb(resolve(dataDir, 'turn.db'));
const seeded = seed(db, {
  privateVenuePath: resolve(root, 'work/private/venue.json'),
});
const port = Number(process.env.TURN_API_PORT ?? 8090);
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find(
    (n) =>
      n &&
      n.family === 'IPv4' &&
      !n.internal &&
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address),
  )?.address;
const app = createApp(db, {
  lanHost: lanAddress,
  devAuth: process.env.TURN_DEV_AUTH !== 'off',
  includePrivateLan: process.env.TURN_API_PRIVATE_LAN !== '0',
});
const lan = lanAddress;
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(
    `TURN API on http://localhost:${port}${lan ? ` and http://${lan}:${port}` : ''}${seeded ? ' (seeded)' : ''}`,
  );
  console.log(
    'Dev sign-in: ops@turn.local (staff), owner@harbour.demo (owner), editor@harbour.demo (editor), home@turn.local (home)',
  );
});
