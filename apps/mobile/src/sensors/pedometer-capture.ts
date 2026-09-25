import type { Recording } from '@turn/positioning-core';

export type NativeCount = NonNullable<Recording['nativePedometer']>;
type Port = {
  isAvailableAsync(): Promise<boolean>;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  watchStepCount(cb: (value: { steps: number }) => void): { remove(): void };
  getStepCountAsync(start: Date, end: Date): Promise<{ steps: number }>;
};
const valid = (n: number) => Number.isInteger(n) && n >= 0;

/** Callback times are receipt times, not footfall times. Never drives pose. */
export async function preparePedometer(
  port: Port,
  platform: string,
  changed: (state: NativeCount) => void,
  wallNow = () => Date.now(),
  monoNow = () => performance.now(),
) {
  const state: NativeCount = {
    status: 'preparing',
    source: platform === 'ios' ? 'apple-cmpedometer' : 'android-step-counter',
    message: 'Checking native step counter…',
    startedAtUnixMs: null,
    endedAtUnixMs: null,
    turnStepsAtStart: 0,
    liveSteps: null,
    queriedSteps: null,
    updates: [],
  };
  let subscription: { remove(): void } | null = null,
    active = false,
    startMono = 0;
  const publish = () => changed({ ...state, updates: [...state.updates] });
  publish();
  try {
    if (!(await port.requestPermissionsAsync()).granted) {
      state.status = 'denied';
      state.message =
        'Native count permission denied; TURN recording can continue.';
    } else if (!(await port.isAvailableAsync())) {
      state.status = 'unavailable';
      state.message = 'Native step counter unavailable on this device.';
    } else {
      state.status = 'ready';
      state.message = 'Native count starts at the test cue.';
    }
  } catch (e) {
    state.status = 'error';
    state.message = `Native counter setup failed: ${String(e)}`;
  }
  publish();
  return {
    begin(turnSteps: number) {
      if (state.status !== 'ready') return;
      state.startedAtUnixMs = wallNow();
      startMono = monoNow();
      state.turnStepsAtStart = turnSteps;
      active = true;
      state.status = 'collecting';
      state.message = 'Waiting for native update; delivery may be delayed.';
      try {
        subscription = port.watchStepCount(({ steps }) => {
          if (!active) return;
          if (
            !valid(steps) ||
            (state.liveSteps !== null && steps < state.liveSteps)
          ) {
            state.status = 'error';
            state.message =
              'Native count invalid or reset; retain raw comparison as incomplete.';
            active = false;
            subscription?.remove();
            publish();
            return;
          }
          state.liveSteps = steps;
          if (state.updates.length < 10000)
            state.updates.push({
              receivedAfterStartSeconds: Math.max(
                0,
                (monoNow() - startMono) / 1000,
              ),
              steps,
            });
          state.message =
            'Live cumulative estimate; individual step times unavailable.';
          publish();
        });
      } catch (e) {
        active = false;
        state.status = 'error';
        state.message = `Native subscription failed: ${String(e)}`;
      }
      publish();
    },
    dispose() {
      active = false;
      subscription?.remove();
      subscription = null;
    },
    async finish() {
      active = false;
      subscription?.remove();
      subscription = null;
      if (state.startedAtUnixMs === null || state.endedAtUnixMs !== null)
        return;
      state.endedAtUnixMs = wallNow();
      if (state.status === 'error') {
        publish();
        return;
      }
      if (platform !== 'ios') {
        state.status = 'stopped';
        state.message =
          'Last live count only; late Android batches may be missing.';
        publish();
        return;
      }
      state.status = 'querying';
      state.message = 'Querying Apple count for the fixed test interval…';
      publish();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        if (state.endedAtUnixMs < state.startedAtUnixMs)
          throw new Error('Wall clock changed during capture');
        const result = await Promise.race([
          port.getStepCountAsync(
            new Date(state.startedAtUnixMs),
            new Date(state.endedAtUnixMs),
          ),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('Native interval query timed out')),
              8000,
            );
          }),
        ]);
        if (!valid(result.steps)) throw new Error('Invalid interval count');
        state.queriedSteps = result.steps;
        state.status = 'complete';
        state.message =
          'Apple interval estimate; compare with your manual count.';
      } catch (e) {
        state.status = 'stopped';
        state.message = `Interval query failed; last live count only. ${String(e)}`;
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
      publish();
    },
  };
}
