import { afterEach, expect, it, vi } from 'vitest';
import type { Recording } from '@turn/positioning-core';
import { sendRun } from './send-runs';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const run = { sessionId: 'walk-1' } as Recording;
function configure() {
  vi.stubEnv('EXPO_PUBLIC_TEST_INBOX_URL', 'http://127.0.0.1:8083');
  vi.stubEnv('EXPO_PUBLIC_TEST_INBOX_TOKEN', 'secret');
}
it('only reports success for a matching storage acknowledgement', async () => {
  configure();
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      stored: true,
      sha256: 'a'.repeat(64),
      sessionId: 'wrong',
    }),
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(sendRun(run)).rejects.toThrow('did not confirm');
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({
      stored: true,
      sha256: 'a'.repeat(64),
      sessionId: run.sessionId,
      duplicate: false,
    }),
  });
  expect((await sendRun(run)).stored).toBe(true);
});
it('explains offline recovery and refuses unfinished counts', async () => {
  configure();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
  await expect(sendRun(run)).rejects.toThrow('same Wi-Fi');
  await expect(
    sendRun({ ...run, nativePedometer: { status: 'querying' } } as Recording),
  ).rejects.toThrow('wait for the native count');
});
