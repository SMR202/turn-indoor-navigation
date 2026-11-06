// Runs beacon simulations off the main thread, so TURN Studio stays responsive while it plans.
import {
  planForTarget,
  simulateAccuracy,
  type AccuracyTarget,
  type PlannerInput,
  type PlannerPoint,
} from '@turn/positioning-core';

export type SimRequest =
  | {
      id: number;
      kind: 'plan';
      input: PlannerInput;
      target: AccuracyTarget;
      refRssi: number;
    }
  | {
      id: number;
      kind: 'predict';
      input: PlannerInput;
      beacons: PlannerPoint[];
      refRssi: number;
    };

/** A request before the worker assigns its id. */
export type SimJob = SimRequest extends infer R
  ? R extends SimRequest
    ? Omit<R, 'id'>
    : never
  : never;

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const r = e.data;
  const result =
    r.kind === 'plan'
      ? planForTarget(r.input, r.target, {
          planner: { refRssi: r.refRssi },
          maxBeacons: 32,
        })
      : simulateAccuracy(r.input, r.beacons, { refRssi: r.refRssi });
  self.postMessage({ id: r.id, result });
};
