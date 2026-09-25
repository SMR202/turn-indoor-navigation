# PDR workstream

Updated: 2026-09-25.

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
