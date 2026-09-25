# Phone test: SDK 57, anchors and experimental PDR

For a private map and the current guided-walk UI, start with [local venues](LOCAL_VENUES.md). The manual synthetic-venue protocol below remains useful for sensor validation.

Use Node 24.19.0 and `npm ci`. Run `npm run mobile -- --go --lan` (or from apps/mobile run `npx expo start --go --lan --port 8082`). Keep Metro running. Phone and computer must be on a mutually reachable LAN. Use an Expo Go build supporting SDK 57. Native sensor tests cannot be substituted by the browser preview.

Generate a shareable launch image with `npm run phone:qr -- exp://YOUR_LAN_IP:8082`, using the actual URL emitted by Expo. This writes ignored local files under work/phone-test. The **Expo launch QR** opens the app; **entry-qr.png / junction-qr.png** establish locations inside TURN. Display a location image on another screen or print it. These describe a fictional venue, not physical landmarks in your building.

1. Open TURN from the Expo launch QR. Scan a location marker in TURN (grant camera permission), or use a clearly labelled known demo location. Choose a destination. Switching markers recalculates the route from the new anchor.
2. Measure a separate straight calibration walk of at least 5 m, manually count steps, and enter distance/count. Return to the chosen starting mark. Alignment and calibration errors become position errors.
3. Hold the phone screen-up in portrait, below 60° tilt; top edge points along travel. Choose the corresponding map direction. Start, grant motion permission if requested, re-anchor if permission/background activity cancelled startup, and stand still for one second.
4. On a separate measured 10 m straight walk, record manual steps and actual endpoint. Repeat at least five times. Also test standing still, slow/normal pace, a 90° left turn, a right turn and an out-and-back. A left turn from map-right should increase y. If signs disagree, stop testing and retain the recording for adapter correction.
5. Stop and save the recording through the OS share sheet. Retain original bytes outside Git. `npm run replay -- path/to/recording.json 13 10` prints SHA-256, deterministic final state and endpoint error for an entrance-start 10 m rightward test. Use actual known expected coordinates for other walks.

**Proposed acceptance target, not a result:** repeated 10 m endpoint error ≤1 m and distance error ≤5%. Report every run and failures per phone/OS/carry mode, not only the best result. Do not tune and evaluate on the same walk. Inspect missed/extra steps, heading sign, accumulated yaw error and timing before adjusting thresholds.

The baseline is foreground, hand-held, short-walk only. App background, timestamp reversal, gaps, excessive tilt, abrupt heading jumps, implausible impacts and the 30 m experimental limit stop tracking. Return to a marker to resume. Pocket/bag mode, map matching, continuous rerouting, floor changes and magnetic disturbance rejection are not implemented. Route distance is from the last anchor, not live remaining distance. Sensor recordings contain normalized gravity-inclusive acceleration and native attitude, not a complete raw IMU dataset for every future algorithm.

No measured accuracy is established. See [implementation research](../research/PDR_IMPLEMENTATION_REVIEW.md) and [ADR-0004](../decisions/0004-anchored-pdr-evaluation-baseline.md).
