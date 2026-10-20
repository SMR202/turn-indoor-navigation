import { Platform } from 'react-native';
import { postJson } from './api';

const sent = new Set<string>();

/**
 * Sends an error to the TURN server the app was loaded with, so test-phone problems can be read
 * on the computer without a cable. Best effort, deduplicated, never blocks the app.
 */
export function reportError(error: unknown, where: string) {
  const e = error instanceof Error ? error : new Error(String(error));
  const key = `${where}:${e.message}`;
  if (sent.has(key) || sent.size >= 20) return;
  sent.add(key);
  void postJson('/public/client-errors', {
    app: 'navigator',
    platform: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 40),
    where: where.slice(0, 80),
    message: e.message.slice(0, 500) || 'Unknown error',
    ...(e.stack ? { stack: e.stack.slice(0, 4000) } : {}),
  }).catch(() => undefined);
}

type ErrorUtilsLike = {
  getGlobalHandler(): (error: unknown, fatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, fatal?: boolean) => void): void;
};
let installed = false;

/** Reports every uncaught JavaScript error, then lets React Native handle it as before. */
export function installCrashReporting() {
  if (installed) return;
  installed = true;
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, fatal) => {
    reportError(error, fatal ? 'uncaught (fatal)' : 'uncaught');
    previous(error, fatal);
  });
}
