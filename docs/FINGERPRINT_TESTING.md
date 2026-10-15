# Fingerprint testing on your phone

TURN now has a **Survey** tab: collect signals at known places, independently test recognition, and use a physically confirmed match as a navigation start or recovery. SDK 57 remains. Android build 3 adds optional Wi-Fi; iPhone uses magnetic readings in Expo Go.

**EXPERIMENT:** this first slice recognizes surveyed stations. It does not continuously correct your walking dot or fix stride/heading bias. Magnetic strength can be similar in different rooms. A result of “Not sure yet” is useful evidence, not a successful localization. No building accuracy has been measured for this implementation.

## Connect

Keep phone and computer on the same reachable LAN. Start `npm run phone:tests -- --dev-client`, generate connection QRs with `npm run phone:qr -- exp://YOUR_COMPUTER_LAN_IP:8081`, and keep the process running. These launch QRs do not set your indoor location.

- **Pixel:** update the existing TURN installation to [Android build 3](ANDROID_TEST_BUILD.md), then use the Android development-launch QR. Do not uninstall if you want to preserve local recordings and calibration. Expo Go does not contain TURN's Wi-Fi module.
- **iPhone:** open the Expo launch QR in compatible Expo Go. No new iOS native module is required for magnetic capture.
- Navigate, Survey and Tests are persistent bottom tabs. Calibration and existing walking recordings remain under Tests.

## First survey — separately on each phone

1. Choose at least **three** of the map's known anchor spots, ideally all available spots. Physically verify their positions and mark the exact standing points with removable tape. These are venue positions, not locations inferred by PDR. Unverified plan geometry remains a source of error.
2. Open **Survey → 1 · Survey**. Choose the place, check the map, and tap **I am at this exact spot**.
3. On Pixel, enable **Include Wi-Fi signals** for both survey and recognition. Grant precise location access, and keep phone Location services and Wi-Fi on. Scanning does not require joining each network. iPhone does not offer Wi-Fi scanning.
4. Hold the phone still at a consistent height and natural orientation. Keep keys and magnetic accessories away. Tap **Record an 8-second pass**. Wait for its saved message; Wi-Fi may take up to 15 seconds overall. Leaving TURN cancels capture.
5. Visit the other spots, then return for a second pass at each. Do not record both passes without moving away. The survey needs two repeatable passes at three locations before independent testing.

Android normally permits four foreground scans in two minutes. For this first Wi-Fi experiment, leave **about 35 seconds between capture starts**; if TURN reports throttling, wait two minutes and repeat the pass. Each capture reports whether fresh Wi-Fi was actually obtained. A denied/throttled scan still saves usable magnetic data. For combined matching, at least three common radios must be present in the query and repeated references at every candidate station; otherwise the matcher explicitly uses magnetic data only. Several access points may be necessary in a small home.

Surveys and their snapshots stay on the phone. This pilot accepts up to 12 passes per location. Survey each device independently; sharing radio hashes/models between devices and cross-device magnetic calibration are not implemented.

## BLE beacons with spare Android phones (build 4)

**EXPERIMENT:** until commercial beacons arrive, spare Android phones can act as fixed TURN beacons; see [ADR-0007](../decisions/0007-ble-beacon-fingerprints.md). Install [Android build 4](ANDROID_TEST_BUILD.md) on every participating phone and on the scanner/test phone. iPhone can neither act as a beacon nor scan in this slice.

1. On each spare phone open **Beacons**, choose a different name (B1–B6) and **Start beacon**. Allow Nearby devices; keep Bluetooth on, TURN open and the phone charging. Tape or prop it at a fixed height, away from metal, and leave it.
2. On the test phone open **Beacons → Listen for 6 seconds** at several spots. Every beacon you expect should appear with a plausible dBm value (about −45 to −90). A beacon not heard here will not help matching.
3. In **Survey**, enable **Include BLE beacons** and record two passes at three or more places exactly as above, then use **Find my place** with the toggle still enabled and label the actual place afterwards.
4. Do not move, rename or restart a beacon between survey and tests; if you do, delete the survey (or survey again) before trusting results. Different transmit power or phone models change signal strength.

The result card says **BLE beacons + magnetic** when beacons contributed. A scan that fails (permission, Bluetooth off, Android throttling) is stored without beacon data and falls back to magnetic matching; it is never treated as "no beacons nearby". Android throttles repeated scan starts, so leave about 30 seconds between captures. Only TURN beacons are recorded; other Bluetooth devices are filtered out by the phone's controller. Phone-as-beacon signals differ from commercial beacons, so these tests exercise the pipeline and are not final accuracy numbers.

## Independent recognition and navigation

1. Select **2 · Find my place**. Return to a surveyed spot without choosing its name and capture a new reading.
2. TURN displays places in signal-match order, with a clear, tentative or low-confidence lead. These are relative rankings, not calibrated probabilities. An uncertain top suggestion remains an abstention in evaluation. The result explains whether Wi-Fi contributed and which places lack repeated matching radios. **After** the result, label where you were actually standing. Save wrong answers and abstentions as well as successes. This label is excluded from matching.
3. Collect at least two new recognition trials per spot per phone, preferably on a later circuit. This is an initial diagnostic set, not enough to certify accuracy. Repeat on another day before making reliability claims.
4. If the clear or tentative suggestion is physically correct, tap **I am here · correct position & navigate** while still there. This is your physical confirmation, not automatic sensor localization. The recent confirmation resets the navigation start and preserves the selected destination. Align your heading, then start walking. Confirmations older than two minutes, future-dated captures, different device profiles and mismatched venue revisions are rejected. Existing PDR calibration still applies.
5. In **Saved survey & tests**, tap **Send all to computer**. Wait for the acknowledged count, then tell Codex “check the fingerprint tests.” **Share file** is also available. Upload is button-triggered; there is no automatic analysis or monitoring.

Labels are physical references, never proof that a candidate was accurate. Unsurveyed places are outside this station pilot's recognition scope; leave their tests unlabelled and describe them when sending. Do not accept a candidate just because the UI proposes it.

## Combine a location check with a walk

Walk a short route to a surveyed spot. While standing there, open **Navigate → Check location with signals**. Walking capture pauses; Find my place opens directly. Capture, label, and physically confirm the suggested place if correct, then align and resume toward the retained destination. The previous walking segment is saved. The new segment records the fingerprint test ID, matcher revision, confirmation time and previous estimated position, so drift correction can be inspected afterwards. Send the fingerprint records from Survey and the walking recordings from Tests. Upload and analysis remain user-triggered.

This is a recorded, user-confirmed correction between PDR segments. It is not continuous fusion, automatic wall avoidance or a repair to step length. New trials should include fresh circuits, an unsurveyed/intermediate spot and changes of phone heading/height. On Pixel, add fresh survey passes where the result reports missing repeated radios, waiting two minutes if scanning is throttled. Additional passes cannot create radios that are not visible in the building.

## Engineering evaluation

The pure matcher and replay use the same versioned survey and capture contracts. Raw samples use microteslas and monotonic seconds relative to first fresh magnetic sample; map coordinates/errors are metres. Wi-Fi readings retain RSSI dBm, frequency MHz and sample age seconds. Native scans hash BSSIDs using the installation's survey salt; SSIDs/raw BSSIDs are not stored. Hashed radio observations and mapped positions are still private venue data and remain outside Git.

New records use `station-rank-v2`; records without a matcher revision retain the original v1 replay. Survey format is unchanged. V2 magnetic scale is the maximum of 0.5 microtesla, twice the scaled MAD of pass medians, twice the median within-pass spread and twice query spread. Unstable surveys remain rejected; the absolute score/margin acceptance gate is retained. This is an experimental engineering scale, not a trained or calibrated confidence model. Saved historical tests are identified in the UI; capture a new test to exercise v2. A tentative suggestion can be physically confirmed but remains an abstention in automated evaluation.

Receiver: authenticated `/fingerprints` alongside existing `/runs`, bounded schema validation, exact-byte SHA-256 receipts and immutable files in ignored `work/test-inbox`. Every test includes its survey snapshot, so later survey changes cannot silently change that test's reference data.

Replay selected records with `npm run replay:fingerprints -- <file.json> ...`. Report labelled correct, wrong and abstained counts separately, candidate map error where available, device and signal method. Do not tune on all records and then call the same records independent validation. Capture additional held-out trials after changes.

DECISION: conservative station recognition and explicit user confirmation precede automatic pose fusion. No claimed probability or metre-level accuracy is attached to heuristic scores. Next gate: evaluate repeatability, false matches, abstention rate and per-phone errors, then decide whether richer magnetic sequences, BLE or visual positioning are justified. This advances venue observations without coupling them to a particular venue or PDR implementation.

API references: [Expo SDK 57 magnetometer](https://docs.expo.dev/versions/v57.0.0/sdk/magnetometer/), [Android Wi-Fi scanning requirements and throttling](https://developer.android.com/develop/connectivity/wifi/wifi-scan).
