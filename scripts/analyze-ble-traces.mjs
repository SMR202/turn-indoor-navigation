// Summarizes shadow-mode beacon walk logs in work/test-inbox (read-only).
// Usage: npm run analyze:ble [-- --since 2026-10-16]
import fs from 'node:fs';
import path from 'node:path';
import {
  bleTraceRecordSchema,
  replayBleTrace,
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
    `\n== ${f.slice(0, 10)} ${t.startedAt} ${t.platform} walk=${t.navigationSessionId ?? '-'} duration≈${dur.toFixed(0)}s dropped=${t.droppedSamples}`,
  );
  console.log(
    'placements:',
    t.placements.beacons
      .map(
        (b) =>
          `${b.tag}@${b.anchorId} ref=${b.referenceRssi ?? 'uncalibrated'}`,
      )
      .join(', '),
  );
  const tags = [...new Set(t.samples.map((s) => s.tag))];
  for (const tag of tags) {
    const r = t.samples.filter((s) => s.tag === tag).map((s) => s.rssi);
    console.log(
      `  ${tag}: ${r.length} packets (${(r.length / Math.max(dur, 1)).toFixed(1)}/s) median ${median(r).toFixed(0)} max ${Math.max(...r)} min ${Math.min(...r)} dBm`,
    );
  }
  console.log('recorded events:', t.events.length);
  for (const e of t.events)
    console.log(
      `  t=${e.t.toFixed(1)}s ${e.tag} smoothed=${e.smoothedRssi} ref=${e.referenceRssi} margin=${e.marginDb ?? 'none'} estimate→beacon=${e.discrepancyMetres?.toFixed(1) ?? 'n/a'} m`,
    );
  const replay = replayBleTrace(t);
  console.log(
    `replay with recorded config: ${replay.length} events (${replay.length === t.events.length ? 'matches' : 'DIFFERS from'} recorded)`,
  );
  console.log('threshold sweep (events fired): near-delta dB → count');
  for (const nearDeltaDb of [4, 6, 8, 10, 12, 14])
    console.log(
      `  ${nearDeltaDb}: ${replayBleTrace(t, { ...DEFAULT_PROXIMITY_CONFIG, ...t.config, nearDeltaDb }).length}`,
    );
}
if (!found)
  console.log(
    'No ble-trace logs found. On the phone: Beacons tab → Send beacon walk logs.',
  );
