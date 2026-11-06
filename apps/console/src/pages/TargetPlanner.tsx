import { useEffect, useRef, useState } from 'react';
import {
  TARGETS,
  type AccuracyReport,
  type AccuracyTarget,
  type PlannedSite,
  type PlannerInput,
  type PlannerPoint,
  type TargetPlan,
} from '@turn/positioning-core';
import { TrendChart } from '../charts';
import type { SimJob } from '../sim.worker';
import { Icon } from '../ui';

type Pending = { id: number; label: string } | null;

/** Runs simulations in a worker; one request at a time, the latest wins. */
function useSimulator() {
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(
    new Map<number, (r: TargetPlan | AccuracyReport) => void>(),
  );
  const next = useRef(1);
  useEffect(() => {
    const w = new Worker(new URL('../sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (e: MessageEvent<{ id: number; result: never }>) => {
      waiting.current.get(e.data.id)?.(e.data.result);
      waiting.current.delete(e.data.id);
    };
    worker.current = w;
    return () => w.terminate();
  }, []);
  return <T,>(req: SimJob) =>
    new Promise<T>((resolve) => {
      const id = next.current++;
      waiting.current.set(id, resolve as (r: unknown) => void);
      worker.current?.postMessage({ ...req, id });
    });
}

const fmt = (m: number) => (Number.isFinite(m) ? `${m.toFixed(1)} m` : '–');
const pct = (f: number) => `${Math.round(f * 100)}%`;

/**
 * "How many beacons do we need?": simulates layouts on this floor and finds the fewest beacons for
 * an accuracy target, with the cost against accuracy curve; or predicts the current layout.
 */
export function TargetPlanner({
  input,
  refRssi,
  current,
  onApply,
  onAccuracy,
}: {
  input: PlannerInput;
  refRssi: number;
  current: PlannerPoint[];
  onApply: (sites: PlannedSite[]) => void;
  onAccuracy: (points: AccuracyReport['points'] | null) => void;
}) {
  const simulate = useSimulator();
  const [target, setTarget] = useState<AccuracyTarget>('room');
  const [pending, setPending] = useState<Pending>(null);
  const [plan, setPlan] = useState<TargetPlan | null>(null);
  const [predicted, setPredicted] = useState<AccuracyReport | null>(null);
  // A different floor or hardware invalidates earlier results.
  useEffect(() => {
    setPlan(null);
    setPredicted(null);
    onAccuracy(null);
  }, [input, refRssi]);

  const runPlan = async () => {
    setPending({ id: 1, label: 'Simulating layouts…' });
    const result = await simulate<TargetPlan>({
      kind: 'plan',
      input,
      target,
      refRssi,
    });
    setPlan(result);
    setPredicted(null);
    onAccuracy(result.report.points);
    setPending(null);
  };
  const runPredict = async () => {
    setPending({ id: 2, label: 'Simulating this layout…' });
    const result = await simulate<AccuracyReport>({
      kind: 'predict',
      input,
      beacons: current,
      refRssi,
    });
    setPredicted(result);
    setPlan(null);
    onAccuracy(result.points);
    setPending(null);
  };
  const shown = plan?.report ?? predicted;
  return (
    <div className="card col" style={{ gap: 14 }}>
      <div>
        <h2>How many beacons do we need?</h2>
        <p className="subtle" style={{ marginTop: 4 }}>
          TURN simulates readings across this floor (walls, noise, different
          phones) and finds the fewest beacons for the accuracy you choose.
          Predictions from radio alone: live guidance also uses steps and walls,
          so measure on site before quoting a number.
        </p>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(TARGETS) as AccuracyTarget[]).map((t) => (
          <button
            key={t}
            className={`btn ${target === t ? 'primary' : ''}`}
            onClick={() => setTarget(t)}
            aria-pressed={target === t}
          >
            {TARGETS[t].label}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn primary"
          disabled={!!pending}
          onClick={() => void runPlan()}
        >
          <Icon name="beacon" size={16} /> Find the fewest beacons
        </button>
        <button
          className="btn"
          disabled={!!pending || !current.length}
          onClick={() => void runPredict()}
          title={current.length ? '' : 'Place or suggest beacons first'}
        >
          Predict the current layout
        </button>
        {pending && (
          <span className="subtle" role="status">
            {pending.label}
          </span>
        )}
      </div>
      {shown && (
        <div className="grid g3" style={{ gap: 10 }}>
          <Stat
            label="Beacons"
            value={String(plan ? plan.sites.length : current.length)}
          />
          <Stat
            label="Typical error (median · 90%)"
            value={`${fmt(shown.medianErrorMetres)} · ${fmt(shown.p90ErrorMetres)}`}
          />
          <Stat label="Right room" value={pct(shown.roomAccuracy)} />
        </div>
      )}
      {plan && (
        <>
          <p style={{ margin: 0 }}>
            {plan.met
              ? `${plan.sites.length} beacons reach “${TARGETS[plan.target].label}” in simulation.`
              : `Not reached with up to ${plan.curve.at(-1)?.beacons ?? 0} beacons; the best layout tried is shown. Consider more beacons in corridors or a looser target.`}
          </p>
          <TrendChart
            height={200}
            label={(d) => d}
            data={plan.curve.map((c) => ({
              day: String(c.beacons),
              median: Number(c.medianErrorMetres.toFixed(2)),
              p90: Number(c.p90ErrorMetres.toFixed(2)),
              room: Math.round(c.roomAccuracy * 100) / 10,
            }))}
            series={[
              { key: 'median', label: 'Median error (m)', color: '#2F5AF2' },
              { key: 'p90', label: '90% error (m)', color: '#C0662A' },
              {
                key: 'room',
                label: 'Right room (×10%)',
                color: '#1F8A5B',
              },
            ]}
          />
          <div className="row">
            <button className="btn primary" onClick={() => onApply(plan.sites)}>
              Use these {plan.sites.length} sites
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
