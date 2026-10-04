# Positioning workstream

Updated: 2026-10-04.

## Accuracy review after navigation testing

User reports short distance and turns occurring before the mapped doorway. No navigation-tagged runs are in the 23-file local inbox yet. Existing follow-up replay demonstrates brisk-step rejection as well as unresolved count/stride error; route guidance does not correct either. [Evidence, external research and proposed next slice](../../../research/ACCURACY_NEXT_STEP_2026_10.md). Recommend doorway checkpoint evaluation, bounded guard repair and an independent ARKit translation experiment before selecting fusion. Camera-free corrections remain a venue-specific BLE/magnetic or vendor-SDK evaluation. No implementation or physical validation added by this review.

## Versioned motion filtering

New live sessions select `step-yaw-motion-v2`; engine default and historical v1 recordings preserve baseline behavior. Shared core buffers peaks and original headings, accepts at most one per observation, holds ambiguous/missing-data displacement, and exposes assessment separately from unknown pose uncertainty. Anchors/stops reset or discard pending motion. No labels, map geometry or native counts enter the classifier. [Experiment and limits](../../../research/MOTION_GUARD_EXPERIMENT.md). 51 tests/root checks pass; held-out phone behavior is unvalidated.

## Current state / decisions

Pure NavigationEngine accepts validated observations and emits authoritative pose. QR identity is resolved against loaded venue/revision. Anchor establishes position; heading alignment is explicit. Experimental PDR poses are degraded with unknown uncertainty. Re-anchor resets detector/heading/history. Stop on timing gaps/reversals, stale heading, tilt, jumps, impacts, lifecycle interruption or 30 m tracking limit.

Live Expo DeviceMotion and JSON replay share observations/engine. Native seconds are rebased per capture; repeated native fields are deduplicated. UI owns lifecycle/permissions but no navigation math. [ADR-0004](../../../decisions/0004-anchored-pdr-evaluation-baseline.md).

## Validation / limitations

Unit tests cover QR revision/identity failures, replay equality, stationary/turning behavior, missing heading and failure recovery. Android/iOS exports pass; no phone execution claimed. No fusion, map constraints, radio fallback, floor inference or calibrated covariance.

## Next action

Obtain navigation recordings through the existing inbox and add timestamped physical-door checkpoints for evaluation, checking actual door geometry. Follow the proposed accuracy slice above; preserve failed runs and hashes. SDK 57 remains pinned. Native VIO feasibility and licensing must be checked before selecting an adapter.
