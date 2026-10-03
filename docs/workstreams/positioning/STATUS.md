# Positioning workstream

Updated: 2026-10-03.

## Versioned motion filtering

New live sessions select `step-yaw-motion-v2`; engine default and historical v1 recordings preserve baseline behavior. Shared core buffers peaks and original headings, accepts at most one per observation, holds ambiguous/missing-data displacement, and exposes assessment separately from unknown pose uncertainty. Anchors/stops reset or discard pending motion. No labels, map geometry or native counts enter the classifier. [Experiment and limits](../../../research/MOTION_GUARD_EXPERIMENT.md). 51 tests/root checks pass; held-out phone behavior is unvalidated.

## Current state / decisions

Pure NavigationEngine accepts validated observations and emits authoritative pose. QR identity is resolved against loaded venue/revision. Anchor establishes position; heading alignment is explicit. Experimental PDR poses are degraded with unknown uncertainty. Re-anchor resets detector/heading/history. Stop on timing gaps/reversals, stale heading, tilt, jumps, impacts, lifecycle interruption or 30 m tracking limit.

Live Expo DeviceMotion and JSON replay share observations/engine. Native seconds are rebased per capture; repeated native fields are deduplicated. UI owns lifecycle/permissions but no navigation math. [ADR-0004](../../../decisions/0004-anchored-pdr-evaluation-baseline.md).

## Validation / limitations

Unit tests cover QR revision/identity failures, replay equality, stationary/turning behavior, missing heading and failure recovery. Android/iOS exports pass; no phone execution claimed. No fusion, map constraints, radio fallback, floor inference or calibrated covariance.

## Next action

Verify normalized timestamps/yaw on both platforms and measure real logs using [phone protocol](../../PHONE_TESTING.md). Preserve failed runs and hash inputs.
