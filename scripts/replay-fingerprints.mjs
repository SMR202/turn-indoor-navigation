import { readFile } from 'node:fs/promises';
import {
  fingerprintRecordSchema,
  evaluateFingerprint,
} from '@turn/positioning-core';

if (process.argv.length < 3)
  throw new Error('Provide one or more fingerprint JSON recordings.');
const results = [];
for (const path of process.argv.slice(2)) {
  const record = fingerprintRecordSchema.parse(
    JSON.parse(await readFile(path, 'utf8')),
  );
  const result = evaluateFingerprint(record);
  results.push({
    sessionId: record.sessionId,
    labelled: Boolean(record.actualAnchorId),
    result,
  });
}
const labelled = results.filter((r) => r.labelled && r.result);
console.log(
  JSON.stringify(
    {
      algorithm: 'station-fingerprint-v1',
      records: results.length,
      labelledTests: labelled.length,
      correct: labelled.filter((r) => r.result.correct).length,
      wrong: labelled.filter(
        (r) => r.result.match.status === 'candidate' && !r.result.correct,
      ).length,
      abstained: labelled.filter((r) => r.result.match.status !== 'candidate')
        .length,
      results,
    },
    null,
    2,
  ),
);
