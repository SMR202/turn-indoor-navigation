import { afterEach, expect, it, vi } from 'vitest';
import { waitForForeground } from './foreground';

function appState(initial: string) {
  const listeners = new Set<(state: string) => void>();
  return {
    currentState: initial,
    listeners,
    addEventListener(_event: 'change', listener: (state: string) => void) {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    },
    change(state: string) {
      this.currentState = state;
      for (const listener of listeners) listener(state);
    },
  };
}
afterEach(() => vi.useRealTimers());
it('waits through Android permission background/inactive states and cleans up on return', async () => {
  const port = appState('background');
  let ready = false;
  const pending = waitForForeground(port, new AbortController().signal).then(
    () => {
      ready = true;
    },
  );
  port.change('inactive');
  await Promise.resolve();
  expect(ready).toBe(false);
  port.change('active');
  await pending;
  expect(ready).toBe(true);
  expect(port.listeners.size).toBe(0);
});
it('cancels a pending startup when the screen is left', async () => {
  const port = appState('background');
  const controller = new AbortController();
  const pending = waitForForeground(port, controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  expect(port.listeners.size).toBe(0);
  port.change('active');
});
it('accepts an already foreground app but times out persistent background without starting sensors', async () => {
  vi.useFakeTimers();
  await waitForForeground(appState('active'), new AbortController().signal);
  const port = appState('background');
  const pending = expect(
    waitForForeground(port, new AbortController().signal),
  ).rejects.toThrow('Return to TURN');
  await vi.advanceTimersByTimeAsync(30000);
  await pending;
  expect(port.listeners.size).toBe(0);
});
