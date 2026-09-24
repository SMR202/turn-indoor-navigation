# PDR workstream

Updated: 2026-09-24.

## Current state / decisions

Experimental `step-yaw-v1` in packages/pdr and packages/positioning-core: time-aware acceleration magnitude filtering, hysteresis/refractory step detection, measured constant step length, heading sampled near step peak, relative native yaw aligned to venue. No double integration or claimed error radius. Research before implementation: [candidate review](../../../research/PDR_IMPLEMENTATION_REVIEW.md), [ADR-0004](../../../decisions/0004-anchored-pdr-evaluation-baseline.md).

## Validation / limitations

Synthetic tests cover stationary input, first step, constant gait, turning/yaw wrap and exact live/replay parity. These prove deterministic behavior, not walking accuracy. No recorded real walks or threshold tuning performed. Foreground screen-up hand-held only; phone/body heading decoupling, variable stride and magnetic disturbance remain unresolved. Native yaw sign requires each-platform physical verification.

## Next action

Follow [phone testing](../../PHONE_TESTING.md), retain original logs outside Git, compare manual counts and held-out measured endpoints. Proposed 10 m endpoint ≤1 m and distance ≤5% targets remain unvalidated. Evaluate Fusion/native acquisition only if logs justify it.
