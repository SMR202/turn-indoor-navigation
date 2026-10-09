# Positioning workstream

Updated: 2026-10-09.

## Next milestone research: independent movement evidence

FACT: user reports movement on Pixel and iPhone but compensates for different distance estimates with calibration. This is qualitative improvement; no new build-2 accuracy measurement is established. The engine still uses fixed-stride PDR with unknown uncertainty and no environmental corrections.

PROPOSED: optional camera-assisted room-to-room positioning using ARCore first, then ARKit, followed by verified map constraints and passive BLE/magnetic corrections. [Research, competitor comparison, adapter review and executable handoff](../../../research/HYBRID_POSITIONING_NEXT_STEP_2026_10.md). Pixel-first supersedes the earlier iPhone-first experiment because a local Android native host now exists. ARCore 1.56.0 and ViroReact 3.0.3 revisions/licenses inspected; Viro's public camera event lacks capture timestamps/session epochs, so a narrow native Expo adapter is preferred for the initial experiment. No new dependency or positioning code introduced.

Validation for this research update: Markdown formatting and repository documentation links checked. No native build, new physical test or accuracy result. Exact next action: implement optional timestamped ARCore acquisition, versioned visual-pose/reset contracts and replay, then expose camera-assisted navigation with existing checkpoints/upload. Preserve raw PDR comparison and SDK 57. Gate fusion on held-out physical results; camera-off/repeated-QR-free operation still requires passive venue corrections.

Android acquisition now uses a local buffered sensor module; see [ADR-0006](../../../decisions/0006-android-buffered-motion-acquisition.md) and [mobile status](../mobile/STATUS.md). Recording metadata optionally retains the installed acquisition revision for diagnosis, without changing old schemas/replay or the PDR algorithm. Synthetic raw-batch tests exercise units/frames, walking versus bobbing, full navigation movement and exact replay parity. Physical accuracy remains unvalidated.

Module-boundary fix: `engine.ts` now owns NavigationEngine/recording schema/replay; `index.ts` only exports public APIs. Diagnostics imports the engine directly, removing Metro's observed runtime require cycle. Algorithms and serialized contracts are unchanged; 59 tests/root checks pass.

Navigation now explicitly selects recorded `continuous-test` policy: 30 m drift limit becomes a persistent warning, while sensor failure stops remain. Missing policy preserves historical bounded replay. Unit coverage compares both policies beyond 30 m, replay equality and sensor failure behavior. Android acquisition startup now tolerates partial native frames; normalized displacement math is unchanged.

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

Checkpoint evaluation is implemented: optional versioned-recording annotations retain node ID, native-session time and exact observation count. Replay evaluates map discrepancy and motion counts without feeding annotations into the estimator; malformed references/boundaries yield unavailable results. Arrival and still-check taps allow delay comparison. Historical recordings remain compatible and motion thresholds are unchanged. Synthetic tests verify round-trip persistence, replay independence and invalid-reference/timestamp handling; these do not establish physical accuracy.

Obtain paired normal/brisk navigation recordings through the existing inbox, checking actual door geometry. Follow the current hybrid-positioning handoff above; preserve failed runs and hashes. SDK 57 remains pinned. Native VIO candidate review is recorded, but compatibility and timestamp/reset behavior still need an executable spike before adopting an adapter.
