import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { diagnoseRecording } from '@turn/positioning-core';
import { sampleVenue } from '@turn/venue-model';
if (!process.argv[2])
  throw new Error(
    'Usage: npm run diagnose -- recording.json [recording2.json ...]',
  );
const reports = [];
for (const path of process.argv.slice(2)) {
  const bytes = await readFile(path);
  const { trail, stepsDetail, ...summary } = diagnoseRecording(
    JSON.parse(bytes.toString('utf8')),
    sampleVenue,
  );
  reports.push({
    file: path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...summary,
    stepPeakTimes: stepsDetail.map((s) => s.time),
    tracePoints: trail.length,
  });
}
console.log(JSON.stringify(reports, null, 2));
