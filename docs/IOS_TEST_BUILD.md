# iPhone development build without a Mac or paid Apple account

Expo Go cannot scan Bluetooth beacons; TURN's iOS `TurnBle` module (CoreBluetooth, scan only, `turn-ble-ios-1`) needs an installed development build. This route needs no Mac and no paid Apple Developer membership. EAS Build was rejected because it requires a paid Apple Developer account to produce an installable device build.

**DECISION:** build an _unsigned_ debug IPA on a free GitHub-hosted macOS runner ([workflow](../.github/workflows/ios-dev-build.yml)), then sign and install it from Windows with Sideloadly using a free Apple ID. The IPA contains only native code and the Expo dev client. JavaScript, the private venue and recordings are not in it; the app loads them from your own Metro server (`npm run phone:tests`) over the LAN, so private venue data never reaches GitHub.

## Limits

- A free Apple ID signs apps for **7 days**, allows about three sideloaded apps and a limited number of new App IDs per week. Re-sign weekly. Local app data survives a re-sign with the same ID.
- iPhone can **scan** TURN beacons; it cannot advertise as one. Use Android phones as beacons.
- The Swift module has been compiled only by the macOS runner, never on this computer. Physical behavior is unverified until you run Listen on the phone.
- Third-party signing tools are outside this repository's control; use Apple's official sources where you can and only your own free Apple ID.

**EXPERIMENT RESULT (2026-10-16):** after four failed CI attempts the workflow produced a real unsigned IPA (26,954,129 bytes, SHA-256 72E42E34…E2511, contains Payload/TURN.app). The first runs failed because Expo SDK 57 builds ExpoModulesJSI with a Swift package needing Swift 6.2, so the workflow now selects Xcode 26 on a macos-26 runner. The Swift module compiled; it has not run on hardware.

## Get the IPA

1. Push to the `ios-dev-build` branch (or choose **Run workflow** on the _iOS development build_ action in GitHub). The repository is public, so hosted minutes are free.
2. Open the finished run on GitHub, download the artifact **TURN-dev-unsigned-ipa** and unzip it to get `TURN-dev-unsigned.ipa`. If the run fails, download **xcodebuild-log** and send it.

## Install from Windows

1. Install iTunes and iCloud from apple.com (not the Microsoft Store versions) and either AltServer (AltStore) or [Sideloadly](https://sideloadly.io/). Connect the iPhone by cable and tap Trust.
2. AltServer: run it, click its tray icon, choose **Sideload .ipa…**, pick the IPA and the iPhone, and enter your Apple ID. Sideloadly: choose the IPA, enter your Apple ID and install. Use a spare Apple ID if you prefer.
3. On the iPhone enable **Settings → Privacy & Security → Developer Mode** (restart), then **Settings → General → VPN & Device Management → your Apple ID → Trust**.
4. Run `npm run phone:tests -- --dev-client` on the computer, open the TURN app and scan `work/phone-test/android-launch.png` with the iPhone camera (this QR opens the dev client at the same Metro server), or enter `http://YOUR_LAN_IP:8081`. Allow Bluetooth when asked.
5. Open **Beacons → Listen for 6 seconds** within a few metres of the Android beacons.

The iPhone survey is separate from every Android survey (device profiles are never mixed). See the [fingerprint protocol](FINGERPRINT_TESTING.md#ble-beacons-with-spare-android-phones-build-4).
