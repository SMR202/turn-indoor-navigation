import {
  DEFAULT_PROXIMITY_CONFIG,
  ProximityDetector,
  type BleTraceRecord,
} from './ble-proximity';
import { AssistFusion, type AssistConfig } from './assist-fusion';
import {
  ParticleFusion,
  type FusionBeacon,
  type FusionConfig,
  type FusionMap,
} from './fusion';

export type ReplayedPoint = { t: number; x: number; y: number; sigma: number };

function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/**
 * Re-runs the fusion on a recorded assisted-navigation trace (raw walking positions plus beacon
 * samples) so filter parameters can be tuned offline on real walks without touching a phone.
 * Deterministic for a given seed. Times in a trace come from two nearby clocks (stream and
 * recorder), so alignment is within about half a second; fine for tuning, not for forensics.
 */
export function replayAssistedTrace(
  trace: BleTraceRecord,
  map: FusionMap,
  overrides: Partial<FusionConfig> = {},
  defaultExponent = 2.3,
): { path: ReplayedPoint[]; proximityFixes: number } {
  const calibrated = trace.placements.beacons.filter(
    (b) => b.referenceRssi !== undefined,
  );
  const beacons: FusionBeacon[] = calibrated.map((b) => ({
    tag: b.tag,
    x: b.x,
    y: b.y,
    refRssi: b.referenceRssi!,
    exponent: b.exponent ?? defaultExponent,
  }));
  const fusion = new ParticleFusion(map, beacons, overrides);
  const start = trace.fused?.[0] ?? trace.pdr?.[0];
  if (!start || !trace.pdr?.length) return { path: [], proximityFixes: 0 };
  fusion.reset(start.x, start.y, 0.8);
  const detector = calibrated.length
    ? new ProximityDetector(calibrated, DEFAULT_PROXIMITY_CONFIG)
    : null;
  const pdr = [...trace.pdr].sort((a, b) => a.t - b.t);
  const samples = trace.samples;
  const end = Math.max(pdr.at(-1)!.t, samples.at(-1)?.t ?? 0);
  const path: ReplayedPoint[] = [];
  let pi = 1;
  let si = 0;
  let prev = pdr[0]!;
  let fixes = 0;
  const window: { t: number; tag: string; rssi: number }[] = [];
  for (let t = 1; t <= end + 1; t += 1) {
    while (pi < pdr.length && pdr[pi]!.t <= t) {
      const p = pdr[pi]!;
      fusion.predict(p.x - prev.x, p.y - prev.y);
      prev = p;
      pi++;
    }
    while (si < samples.length && samples[si]!.t <= t) {
      const s = samples[si]!;
      window.push(s);
      detector?.push(s);
      si++;
    }
    while (window.length && window[0]!.t < t - 2) window.shift();
    const byTag = new Map<string, number[]>();
    for (const s of window)
      byTag.set(s.tag, [...(byTag.get(s.tag) ?? []), s.rssi]);
    const readings = [...byTag]
      .filter(([, v]) => v.length >= 3)
      .map(([tag, v]) => ({ tag, rssi: median(v) }));
    if (readings.length) fusion.updateRssi(readings);
    const event = detector?.evaluate(t) ?? null;
    if (event) {
      const placement = calibrated.find((b) => b.tag === event.tag);
      if (placement) {
        fusion.updatePosition(placement.x, placement.y, 1.6);
        fixes++;
      }
    }
    const e = fusion.estimate();
    path.push({ t, x: e.x, y: e.y, sigma: e.sigmaMetres });
  }
  return { path, proximityFixes: fixes };
}

/**
 * Replays a recorded walk through the live policy (AssistFusion) and reports stability metrics
 * that need no ground truth: how far the estimate wanders while the walker stands still, and how
 * long the estimated path is compared with the walking sensors.
 */
export function replayAssist(
  trace: BleTraceRecord,
  map: FusionMap,
  config: Partial<AssistConfig> = {},
  seed = 1,
) {
  const assist = new AssistFusion(map, trace.placements.beacons, config, seed);
  const start = trace.fused?.[0];
  const pdr = [...(trace.pdr ?? [])].sort((a, b) => a.t - b.t);
  const samples = trace.samples;
  const end = Math.max(pdr.at(-1)?.t ?? 0, samples.at(-1)?.t ?? 0);
  const path: ReplayedPoint[] = [];
  let pi = 0,
    si = 0,
    fixes = 0,
    standingDrift = 0,
    fusedLength = 0;
  let prev: { x: number; y: number } | null = null;
  for (let t = 1; t <= end + 1; t += 1) {
    while (si < samples.length && samples[si]!.t <= t) {
      const s = samples[si]!;
      assist.addSample(s.t, s.tag, s.rssi);
      si++;
    }
    if (!assist.hasPosition && t >= 6) {
      if (start) assist.setPosition(start.x, start.y, 1.5);
      else assist.locate(t);
      if (pdr[0]) assist.syncRaw(pdr[0].x, pdr[0].y);
    }
    let walked = false;
    while (pi < pdr.length && pdr[pi]!.t <= t) {
      if (assist.walk(pdr[pi]!.x, pdr[pi]!.y)) walked = true;
      pi++;
    }
    if (assist.tick(t).proximity) fixes++;
    const e = assist.estimate();
    if (!e) continue;
    if (prev) {
      const d = Math.hypot(e.x - prev.x, e.y - prev.y);
      fusedLength += d;
      if (!walked) standingDrift += d;
    }
    prev = { x: e.x, y: e.y };
    path.push({ t, x: e.x, y: e.y, sigma: e.displaySigmaMetres });
  }
  const pdrLength = pdr
    .slice(1)
    .reduce((n, p, i) => n + Math.hypot(p.x - pdr[i]!.x, p.y - pdr[i]!.y), 0);
  return { path, proximityFixes: fixes, standingDrift, fusedLength, pdrLength };
}

/** The same stability metrics for what the phone actually showed (the recorded fused path). */
export function recordedStability(trace: BleTraceRecord) {
  const fused = trace.fused ?? [];
  const pdr = trace.pdr ?? [];
  let standingDrift = 0,
    fusedLength = 0;
  for (let i = 1; i < fused.length; i++) {
    const d = Math.hypot(
      fused[i]!.x - fused[i - 1]!.x,
      fused[i]!.y - fused[i - 1]!.y,
    );
    fusedLength += d;
    const walked = pdr.some(
      (p, k) => k > 0 && p.t > fused[i - 1]!.t && p.t <= fused[i]!.t,
    );
    if (!walked) standingDrift += d;
  }
  return { standingDrift, fusedLength };
}
