import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { createTestInbox } from './test-inbox';

const servers: Server[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function setup(maxBytes?: number) {
  const directory = await mkdtemp(join(tmpdir(), 'turn-inbox-'));
  directories.push(directory);
  const server = createTestInbox(directory, 'test-secret', maxBytes);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const url = `http://127.0.0.1:${address.port}/runs`;
  return {
    directory,
    post: (body: string, token = 'test-secret') =>
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      }),
  };
}
const fixture = {
  schemaVersion: 1,
  algorithm: 'step-yaw-v1',
  sessionId: 'walk-123',
  stepLengthMetres: 0.5,
  metadata: {
    platform: 'synthetic',
    osVersion: 'none',
    timestampBasis: 'native-boot-seconds-minus-session-origin',
    note: '',
  },
  observations: [],
};
it('authenticates, preserves exact bytes by hash, deduplicates and retains revised runs', async () => {
  const { directory, post } = await setup();
  const bytes = JSON.stringify(fixture, null, 2);
  expect((await post(bytes, 'wrong')).status).toBe(401);
  const first = await (await post(bytes)).json();
  expect(first.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(first.duplicate).toBe(false);
  expect(await readFile(join(directory, `${first.sha256}.json`), 'utf8')).toBe(
    bytes,
  );
  expect((await (await post(bytes)).json()).duplicate).toBe(true);
  expect(
    (
      await post(
        JSON.stringify({
          ...fixture,
          metadata: { ...fixture.metadata, note: 'revised' },
        }),
      )
    ).status,
  ).toBe(200);
  expect(await readdir(directory)).toHaveLength(2);
});
it('rejects malformed and oversized uploads without saving files', async () => {
  const { directory, post } = await setup(1000);
  expect((await post('{')).status).toBe(400);
  expect((await post('{}')).status).toBe(400);
  expect((await post('x'.repeat(1001))).status).toBe(413);
  expect(await readdir(directory)).toHaveLength(0);
});
