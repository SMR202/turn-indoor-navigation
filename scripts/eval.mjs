// Replays recorded assisted walks through the current positioning code and prints stability and
// (when landmarks exist) accuracy metrics. Read-only. Usage: npm run eval [-- --since 2026-10-16]
import fs from 'node:fs';
import path from 'node:path';
import {
  bleTraceRecordSchema,
  replayAssist,
  recordedStability,
} from '@turn/positioning-core';

const dir = 'work/test-inbox';
const arg = process.argv.indexOf('--since');
const since = arg > 0 ? Date.parse(process.argv[arg + 1]) : 0;
let venue;
try {
  venue = JSON.parse(fs.readFileSync('work/private/venue.json', 'utf8'));
} catch {
  console.error('work/private/venue.json is required for map-aware replay.');
  process.exit(1);
}
const map = {
  floorId: venue.floors[0].id,
  walls: venue.floors[0].walls,
  walkable: venue.floors[0].walkablePolygons,
};
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : NaN;
};
const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const full = path.join(dir, f);
  if (fs.statSync(full).mtimeMs < since) continue;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    continue;
  }
  if (raw.kind !== 'ble-trace' || raw.mode !== 'assist') continue;
  const t = bleTraceRecordSchema.parse(raw);
  const rec = recordedStability(t);
  const rep = replayAssist(t, map);
  const walks = t.pdr?.length ?? 0;
  const row = {
    trace: f.slice(0, 8),
    walkUpdates: walks,
    recordedStandingDrift: +rec.standingDrift.toFixed(1),
    replayStandingDrift: +rep.standingDrift.toFixed(1),
    recordedPath: +rec.fusedLength.toFixed(1),
    replayPath: +rep.fusedLength.toFixed(1),
    walkingPath: +rep.pdrLength.toFixed(1),
    proximityFixes: rep.proximityFixes,
  };
  // Landmark accuracy: nearest replayed point in time to each landmark mark.
  const marks = t.landmarks ?? [];
  if (marks.length) {
    const errs = marks.map((m) => {
      const p = rep.path.reduce(
        (b, q) => (Math.abs(q.t - m.t) < Math.abs(b.t - m.t) ? q : b),
        rep.path[0],
      );
      return Math.hypot(p.x - m.x, p.y - m.y);
    });
    row.landmarks = marks.length;
    row.landmarkMedianErr = +median(errs).toFixed(2);
    row.landmarkMaxErr = +Math.max(...errs).toFixed(2);
  }
  rows.push(row);
}
console.table(rows);
if (!rows.length) console.log('No assisted traces found.');
else {
  const sum = (k) => rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  console.log(
    `Totals: standing drift recorded ${sum('recordedStandingDrift').toFixed(1)} m → replay ${sum('replayStandingDrift').toFixed(1)} m across ${rows.length} walks.`,
  );
}
