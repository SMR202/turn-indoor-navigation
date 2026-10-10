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

## Independent recognition and navigation

1. Select **2 · Find my place**. Return to a surveyed spot without choosing its name and capture a new reading.
2. TURN displays a possible match or abstains. **After** the result, label where you were actually standing. Save wrong answers and abstentions as well as successes. This label is excluded from matching.
3. Collect at least two new recognition trials per spot per phone, preferably on a later circuit. This is an initial diagnostic set, not enough to certify accuracy. Repeat on another day before making reliability claims.
4. If the proposed place is physically correct, tap **Confirm this location & navigate** while still there. The recent confirmation resets the navigation start and preserves the selected destination. Align your heading, then start walking. Confirmations older than two minutes are rejected. Existing PDR calibration still applies.
5. In **Saved survey & tests**, tap **Send all to computer**. Wait for the acknowledged count, then tell Codex “check the fingerprint tests.” **Share file** is also available. Upload is button-triggered; there is no automatic analysis or monitoring.

Labels are physical references, never proof that a candidate was accurate. Unsurveyed places are outside this station pilot's recognition scope; leave their tests unlabelled and describe them when sending. Do not accept a candidate just because the UI proposes it.

## Engineering evaluation

The pure matcher and replay use the same versioned survey and capture contracts. Raw samples use microteslas and monotonic seconds relative to first fresh magnetic sample; map coordinates/errors are metres. Wi-Fi readings retain RSSI dBm, frequency MHz and sample age seconds. Native scans hash BSSIDs using the installation's survey salt; SSIDs/raw BSSIDs are not stored. Hashed radio observations and mapped positions are still private venue data and remain outside Git.

Receiver: authenticated `/fingerprints` alongside existing `/runs`, bounded schema validation, exact-byte SHA-256 receipts and immutable files in ignored `work/test-inbox`. Every test includes its survey snapshot, so later survey changes cannot silently change that test's reference data.

Replay selected records with `npm run replay:fingerprints -- <file.json> ...`. Report labelled correct, wrong and abstained counts separately, candidate map error where available, device and signal method. Do not tune on all records and then call the same records independent validation. Capture additional held-out trials after changes.

DECISION: conservative station recognition and explicit user confirmation precede automatic pose fusion. No claimed probability or metre-level accuracy is attached to heuristic scores. Next gate: evaluate repeatability, false matches, abstention rate and per-phone errors, then decide whether richer magnetic sequences, BLE or visual positioning are justified. This advances venue observations without coupling them to a particular venue or PDR implementation.

API references: [Expo SDK 57 magnetometer](https://docs.expo.dev/versions/v57.0.0/sdk/magnetometer/), [Android Wi-Fi scanning requirements and throttling](https://developer.android.com/develop/connectivity/wifi/wifi-scan).
