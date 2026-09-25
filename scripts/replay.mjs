import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sampleVenue } from '@turn/venue-model';
import {
  replayRecording,
  recordingSchema,
  evaluateWalk,
} from '@turn/positioning-core';

if (!process.argv[2])
  throw new Error(
    'Usage: npm run replay -- recording.json [expected-x expected-y]',
  );
const bytes = await readFile(process.argv[2]);
const input = recordingSchema.parse(JSON.parse(bytes.toString('utf8')));
const result = replayRecording(input, input.venue ?? sampleVenue);
const course = input.venue?.testCourses.find(
  (c) => c.id === input.test?.courseId,
);
const expected = process.argv.slice(3).map(Number);
if (
  expected.length &&
  (expected.length !== 2 || !expected.every(Number.isFinite))
)
  throw new Error('Supply two finite endpoint coordinates in metres.');
console.log(
  JSON.stringify(
    {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      result,
      completedTest:
        course && input.test?.completedAtMarkedEndpoint
          ? { ...evaluateWalk(result, course.points), interrupted: false }
          : null,
      endpointErrorMetres:
        expected.length && result.pose
          ? Math.hypot(
              result.pose.position.x - expected[0],
              result.pose.position.y - expected[1],
            )
          : null,
    },
    null,
    2,
  ),
);
