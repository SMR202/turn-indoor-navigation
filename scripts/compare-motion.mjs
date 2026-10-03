import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  diagnoseRecording,
  GUARDED_PDR_REVISION,
} from '@turn/positioning-core';
import { sampleVenue } from '@turn/venue-model';
if (!process.argv[2])
  throw new Error(
    'Usage: npm run compare:motion -- recording.json [recording2.json ...]',
  );
const reports = [];
for (const file of process.argv.slice(2)) {
  const bytes = await readFile(file),
    input = JSON.parse(bytes.toString('utf8'));
  const baseline = diagnoseRecording(
    { ...input, algorithm: 'step-yaw-v1' },
    sampleVenue,
  );
  const hasRequiredStreams = [
    'accelerometer',
    'linear-acceleration',
    'gyroscope',
  ].every((type) => input.observations.some((o) => o.type === type));
  const guarded = hasRequiredStreams
    ? diagnoseRecording(
        { ...input, algorithm: GUARDED_PDR_REVISION },
        sampleVenue,
      )
    : null;
  reports.push({
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sessionId: baseline.sessionId,
    labels: baseline.labels,
    manualSteps: baseline.manualSteps,
    baseline: {
      steps: baseline.steps,
      distanceMetres: baseline.distanceMetres,
      failure: baseline.failure,
    },
    guarded: guarded
      ? {
          steps: guarded.steps,
          distanceMetres: guarded.distanceMetres,
          motion: guarded.motion,
          firstAcceptanceDelaySeconds: guarded.stepsDetail[0]
            ? guarded.stepsDetail[0].detectedAt - guarded.stepsDetail[0].time
            : null,
          failure: guarded.failure,
        }
      : null,
    note: hasRequiredStreams
      ? 'Replay comparison; not held-out accuracy evidence. Inspect sensor coverage and labels.'
      : 'Excluded: missing required streams. Original algorithm still replays unchanged.',
  });
}
console.log(JSON.stringify(reports, null, 2));
