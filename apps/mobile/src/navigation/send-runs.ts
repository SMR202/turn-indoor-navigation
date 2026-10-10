import type { Recording, FingerprintRecord } from '@turn/positioning-core';

export const inboxConfigured = Boolean(
  process.env.EXPO_PUBLIC_TEST_INBOX_URL &&
  process.env.EXPO_PUBLIC_TEST_INBOX_TOKEN,
);

export async function sendRun(recording: Recording | FingerprintRecord) {
  const url = process.env.EXPO_PUBLIC_TEST_INBOX_URL;
  const token = process.env.EXPO_PUBLIC_TEST_INBOX_TOKEN;
  if (!url || !token)
    throw new Error(
      'Start phone:tests on your computer, then reload TURN using its Expo QR.',
    );
  if (
    ['preparing', 'ready', 'collecting', 'querying'].includes(
      ('nativePedometer' in recording
        ? recording.nativePedometer?.status
        : '') ?? '',
    )
  )
    throw new Error(
      'Finish the run and wait for the native count before sending.',
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(
      `${url}/${'kind' in recording && recording.kind === 'fingerprint' ? 'fingerprints' : 'runs'}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(recording),
        signal: controller.signal,
      },
    );
    const receipt = await response.json();
    if (
      !response.ok ||
      receipt.stored !== true ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256) ||
      receipt.sessionId !== recording.sessionId
    )
      throw new Error(
        receipt.error ?? 'Computer did not confirm saving the run. Retry.',
      );
    return receipt as {
      stored: true;
      duplicate: boolean;
      sha256: string;
      sessionId: string;
    };
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof Error && error.name === 'AbortError')
    )
      throw new Error(
        'Cannot reach your computer. Keep phone:tests running, use the same Wi-Fi, and retry. Your saved runs are still on this phone.',
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
