// Summarizes beacon walk logs (shadow and assisted) in work/test-inbox. Read-only.
// Usage: npm run analyze:ble [-- --since 2026-10-16]
import fs from 'node:fs';
import path from 'node:path';
import {
  bleTraceRecordSchema,
  replayBleTrace,
  replayAssistedTrace,
  DEFAULT_PROXIMITY_CONFIG,
} from '@turn/positioning-core';

const dir = 'work/test-inbox';
const sinceArg = process.argv.indexOf('--since');
const since = sinceArg > 0 ? Date.parse(process.argv[sinceArg + 1]) : 0;
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const len = (a) =>
  a.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - a[i].x, p.y - a[i].y), 0);
let venueMap = null;
try {
  const v = JSON.parse(fs.readFileSync('work/private/venue.json', 'utf8'));
  venueMap = {
    floorId: v.floors[0].id,
    walls: v.floors[0].walls,
    walkable: v.floors[0].walkablePolygons,
  };
} catch {
  // No private venue: the map-aware replay is skipped.
}
let found = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const full = path.join(dir, f);
  if (fs.statSync(full).mtimeMs < since) continue;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    continue;
  }
  if (raw.kind !== 'ble-trace') continue;
  const t = bleTraceRecordSchema.parse(raw);
  found++;
  const dur = t.samples.at(-1)?.t ?? 0;
  console.log(
    `\n== ${f.slice(0, 10)} ${t.startedAt} ${t.mode} ${t.platform} walk=${t.navigationSessionId ?? '-'} duration≈${dur.toFixed(0)}s dropped=${t.droppedSamples}`,
  );
  console.log(
    'placements:',
    t.placements.beacons
      .map(
        (b) =>
          `${b.tag}@(${b.x.toFixed(1)},${b.y.toFixed(1)}) ref=${b.referenceRssi ?? 'uncalibrated'}`,
      )
      .join(', '),
  );
  for (const tag of [...new Set(t.samples.map((s) => s.tag))]) {
    const r = t.samples.filter((s) => s.tag === tag).map((s) => s.rssi);
    console.log(
      `  ${tag}: ${r.length} packets (${(r.length / Math.max(dur, 1)).toFixed(1)}/s) median ${median(r).toFixed(0)} max ${Math.max(...r)} min ${Math.min(...r)} dBm`,
    );
  }
  console.log('recorded proximity events:', t.events.length);
  for (const e of t.events)
    console.log(
      `  t=${e.t.toFixed(1)}s ${e.tag} smoothed=${e.smoothedRssi} ref=${e.referenceRssi} margin=${e.marginDb ?? 'none'} estimate→beacon=${e.discrepancyMetres?.toFixed(1) ?? 'n/a'} m`,
    );
  if (t.mode === 'assist' && t.pdr?.length) {
    const sig = (t.fused ?? []).map((x) => x.sigma);
    console.log(
      `assisted walk: raw walking path ${len(t.pdr).toFixed(1)} m, fused path ${len(t.fused ?? []).toFixed(1)} m, ${t.pdr.length} walking updates`,
    );
    if (sig.length)
      console.log(
        `  fused uncertainty: median ${median(sig).toFixed(1)} m, max ${Math.max(...sig).toFixed(1)} m`,
      );
    const a = t.pdr.at(-1);
    const b = t.fused?.at(-1);
    if (a && b)
      console.log(
        `  end of walk: fused is ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(1)} m from the raw walking estimate`,
      );
    if (venueMap) {
      const r = replayAssistedTrace(t, venueMap);
      const end = r.path.at(-1);
      console.log(
        `  offline replay: ${r.path.length} points, ${r.proximityFixes} proximity fixes, final (${end?.x.toFixed(1)}, ${end?.y.toFixed(1)}) sigma ${end?.sigma.toFixed(1)} m`,
      );
    }
  }
  const replay = replayBleTrace(t);
  console.log(
    `proximity replay with recorded config: ${replay.length} events (${replay.length === t.events.length ? 'matches' : 'DIFFERS from'} recorded)`,
  );
  console.log('threshold sweep (events fired): near-delta dB → count');
  for (const nearDeltaDb of [4, 6, 8, 10, 12, 14])
    console.log(
      `  ${nearDeltaDb}: ${replayBleTrace(t, { ...DEFAULT_PROXIMITY_CONFIG, ...t.config, nearDeltaDb }).length}`,
    );
}
if (!found)
  console.log(
    'No ble-trace logs found. On the phone: Beacons tab → Send walk logs to computer.',
  );
