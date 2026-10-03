# PDR workstream

Updated: 2026-10-03.

## Experimental motion filter (supersedes baseline-only live behavior below)

New phone sessions use `step-yaw-motion-v2`: a buffered, gravity-relative acceleration/gyro filter upstream of displacement. Historical v1 recordings still replay v1. See [method, thresholds, reuse and evaluation](../../../research/MOTION_GUARD_EXPERIMENT.md). Detected/accepted/rejected/pending counts are separate. Missing extra sensors holds position; native counts and test labels never gate movement.

Development replay rejects 19/19 detections in the labelled bobbing recording and preserves 10/10 in each of two walking-labelled recordings with required streams; first acceptance takes about 1.4 s. Manual walking counts are missing. Still stays zero; impact-stopped/default-labelled trials remain inconclusive, older missing-stream recordings are excluded. This is development fit, not held-out accuracy. Raw captures and hashes remain private.

Validation: 51 tests and root checks pass, including delayed heading/time, label independence, missing streams/gaps, candidate accounting, re-anchor and live/replay. All 14 inbox hashes and baseline counts/distances/failures remain unchanged. Next: physical v2 validation with unchanged calibration, fresh controls and normal/brisk manual-count walks through the inbox.

## Current state / decisions

Experimental `step-yaw-v1` in packages/pdr and packages/positioning-core: time-aware acceleration magnitude filtering, hysteresis/refractory step detection, measured constant step length, heading sampled near step peak, relative native yaw aligned to venue. No double integration or claimed error radius. Research before implementation: [candidate review](../../../research/PDR_IMPLEMENTATION_REVIEW.md), [ADR-0004](../../../decisions/0004-anchored-pdr-evaluation-baseline.md).

## Validation / limitations

Synthetic tests cover stationary input, first step, constant gait, turning/yaw wrap and exact live/replay parity. These prove deterministic behavior, not walking accuracy. Seven real iOS user recordings replayed with byte hashes retained privately. Counts varied 7–11 on reported 5 m trials; all estimated endpoints were left of the planned line. Approximate manual counts and retrospectively inferred pace are not exact ground truth. No detector threshold or stride tuning applied. Foreground screen-up hand-held only; phone/body heading decoupling, variable stride and magnetic disturbance remain unresolved. Native yaw sign requires each-platform physical verification.

## Diagnostic acquisition update

DECISION: preserve `step-yaw-v1` replay math; expose accepted peak timestamps and diagnostic metrics. New recordings identify acquisition protocol `settle-3s-warmup-v1`: three sensor seconds before explicit heading alignment, followed by detector warm-up and a visible cue. Earlier motion-like peaks motivate this change, but they are not individually labelled footfalls. No fitted heading offset or map snapping masks errors. CLI: `npm run diagnose -- recording.json ...`. Original captures and analysis stay ignored under local work; no private geometry/traces in source control.

## Next action

Follow [phone testing](../../PHONE_TESTING.md), retain original logs outside Git, compare manual counts and held-out measured endpoints. Proposed 10 m endpoint ≤1 m and distance ≤5% targets remain unvalidated. Evaluate Fusion/native acquisition only if logs justify it.

## Native comparison acquisition

Added optional platform-tagged Euler angles, normalized device-axis gyro in rad/s and gravity-removed acceleration with native timestamps. Baseline step/yaw math remains unchanged. Native count acquisition uses a separate explicitly timed interval; cumulative receipt callbacks never drive pose. Capture foot-still hand motion and walking-in-place separately before selecting a gate. No false-motion suppression or improved physical accuracy is claimed.
