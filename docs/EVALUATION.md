# Evaluating positioning accuracy

Plan 002 task E5. Accuracy is a **measurement**, not an opinion: nothing is called better until `npm run eval` shows it on labelled walks. Synthetic tests prove mechanics only.

## What you need once

1. **Floor markers (E2).** Put 8–12 numbered pieces of tape at points you can identify on the map: door thresholds, room centres, corridor turns, the ends of the passage. Measure each against the plan with a tape and write them down. Their map positions become the ground truth; verify them, because a 1 m error in the marker is a 1 m error in every result.
2. **A fixed set of routes.** Five routes the same every time (for example lounge → master bedroom, lobby → kitchen, passage end → rear bath) plus two chosen at random each session.

## Recording a labelled walk

1. Start navigation as usual (Navigate → destination → Directions).
2. At each marker, stop for a second and tap **Mark where I am**, then choose the landmark. This writes a timestamped ground-truth point into the walk log. It never moves the dot.
3. Finish the route (or End). Open Beacons → **Send walk logs to computer**.
4. Note in a message: phone, how you held it (flat / reading / swinging), crowding, and anything odd.

Each carry mode and each phone family should be walked at least three times.

## Running the evaluation

```bash
npm run eval                      # all assisted walks in work/test-inbox
npm run eval -- --since 2026-10-20
```

It replays each walk through the current positioning code and prints:

- **standing drift**: metres the estimate moved while no walking was detected (target near 0 per minute);
- **path versus walking path**: the estimated path should not be much longer than the walking-sensor path;
- **landmark error** (when marks exist): median and worst distance between the replayed estimate and the marked point.

Compare the table before and after any change and paste both into the pull request.

## Gates

| Gate | Criteria                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------- |
| G1   | At least 10 labelled walks exist and the baseline numbers are recorded.                                  |
| G2   | Navigation finishes with no manual fix in at least 8 of 10 walks; standing drift under 0.3 m per minute. |
| G3   | Median landmark error ≤ 2 m and p90 ≤ 4 m, correct room ≥ 95%, arrival ≥ 9/10, on both phone families.   |

Report failures as well as successes. Raw walks stay in ignored `work/`; do not commit venue data or identifiable traces.
