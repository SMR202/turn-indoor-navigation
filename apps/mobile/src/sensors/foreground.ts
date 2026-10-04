type StatePort = {
  readonly currentState: string | null;
  addEventListener(
    event: 'change',
    callback: (state: string) => void,
  ): { remove(): void };
};

/** Permission activities can background Android. Do not subscribe until they return. */
export function waitForForeground(
  port: StatePort,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const resources: {
      subscription?: { remove(): void };
      timer?: ReturnType<typeof setTimeout>;
    } = {};
    const finish = (error?: Error) => {
      resources.subscription?.remove();
      clearTimeout(resources.timer);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error);
      else resolve();
    };
    const aborted = () => finish(new Error('Motion startup cancelled.'));
    if (signal.aborted) {
      aborted();
      return;
    }
    if (port.currentState === 'active') {
      finish();
      return;
    }
    signal.addEventListener('abort', aborted, { once: true });
    resources.subscription = port.addEventListener('change', (state) => {
      if (state === 'active') finish();
    });
    resources.timer = setTimeout(
      () => finish(new Error('Return to TURN before starting tracking.')),
      30000,
    );
    if (port.currentState === 'active') finish();
  });
}
