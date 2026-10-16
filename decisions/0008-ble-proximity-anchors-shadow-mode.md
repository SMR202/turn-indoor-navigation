# ADR-0008: BLE proximity anchors in shadow mode

Status: Accepted, 2026-10-16. Builds on [ADR-0007](0007-ble-beacon-fingerprints.md). Evidence and alternatives: [BLE positioning review](../research/BLE_BEACON_POSITIONING_2026_10.md).

## Decision

IMPLEMENT passive proximity anchors, recorded in **shadow mode first**.

- **Placement.** Each TURN beacon is mapped on the phone to a venue anchor/node and calibrated by standing about 1 m away with the scanning phone: the median RSSI becomes that beacon's `referenceRssi`. Placements are stored locally per venue revision and device profile; commercial beacons will move into venue data later. Uncalibrated beacons are ignored: absolute RSSI differs by phone, beacon and mounting.
- **Detector `ble-proximity-v1`** (pure, in positioning-core). Median RSSI per beacon over a 2 s window (at least 3 packets). A beacon is _near_ when its smoothed RSSI is within 8 dB of its reference **and** it beats the runner-up beacon by 6 dB (or is alone), sustained for 1 s. Entry fires once per beacon and re-arms after the signal falls 14 dB below reference or the beacon is lost. These are engineering starting values, not calibrated probabilities.
- **Acquisition.** A continuous foreground TURN-only stream (Android controller filter, iOS software filter), batched every 500 ms with explicit failure and drop counts. Samples carry the native stream clock. Foreground only; Android needs the build with `turn-ble-2`, iPhone the matching CI build.
- **Shadow mode.** While a walk runs, the app records raw samples, detector events and, at each event, the navigation estimate and its distance from the beacon's mapped position. It never changes the estimate, route or destination. The versioned `ble-trace` record replays offline through the same detector (`replayBleTrace`) so thresholds can be retuned on recorded walks.
- **Live correction is a later, separate decision**, gated on shadow data: false-event rate, discrepancy between PDR estimate and beacon position, and per-phone reference stability.

## Alternatives and limits

DEFER trilateration/centroid: unvalidated RSSI-to-distance, shadowing and phone power differences; three or four beacons give little redundancy. DEFER live PDR reset: a false anchor would silently teleport the user. REJECT iPhone as beacon. Phone beacons are not commercial beacons; results validate the pipeline, not final accuracy. Android scan throttling does not apply to a single continuous stream; battery cost of continuous scanning during a walk is unmeasured.

## Verification and next action

Synthetic tests cover ordered entries along a walk with noise, equal-strength abstention, sparse/uncalibrated rejection, re-arming, trace replay equality and schema validation, plus recorder and stream-adapter mocks. Native streams are compiled but not physically exercised. Next: place and calibrate 3–4 beacons, walk the route past them with shadow logging, send the logs, and measure how often events fire correctly, falsely or not at all.
