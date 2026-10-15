# Android sensor and fingerprint test build

Use Expo SDK 57. Pixel recordings on Android 12 delivered only approximately 4–8 unique motion updates/s through Expo Go. All detected steps were rejected by the motion filter because its 1.2-second window requires at least 25 synchronized samples. A JS reload cannot change an installed host's native manifest.

The first permission-enabled APK did not resolve this: two subsequent recordings still had sparse samples. Installed expo-sensors 57.0.3 DeviceMotion dispatches latest readings on display frames rather than retaining every reading. **Build 2** replaces that Android acquisition path with TURN's dedicated sensor thread and timestamp-preserving batches, requesting 50 Hz directly. It retains the existing PDR/bobbing filter and SDK 57. See [ADR-0006](../decisions/0006-android-buffered-motion-acquisition.md). Actual delivery and accuracy still require physical verification.

## Current build 4

Build 4 (versionCode 4) adds the `TurnBle` native module and Bluetooth permissions (BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT; legacy BLUETOOTH/ADMIN for older Android): a **Beacons** tab lets a phone act as a TURN beacon and Survey can include BLE signals. See [BLE beacon protocol](FINGERPRINT_TESTING.md#ble-beacons-with-spare-android-phones-build-4). Motion and Wi-Fi acquisition are unchanged. Install it over the existing app; every beacon phone also needs this build. Rebuilding with `expo prebuild` regenerates `apps/mobile/android` (ignored) and rewrites the `ios` script in `apps/mobile/package.json`; discard that incidental change.

## Build 3

Build 3 (versionCode 3) retains build 2 motion acquisition and adds optional native Wi-Fi scanning for the Survey tab. Grant precise location when selecting Wi-Fi; keep Location services and Wi-Fi on. Scans are user-triggered, fresh-only and subject to Android throttling. Follow the [fingerprint protocol](FINGERPRINT_TESTING.md). The iPhone continues using magnetic capture in Expo Go.

## Build locally

Install Node 24/npm 10 or 11, Java 17 and the Android SDK. Set `ANDROID_HOME` and `JAVA_HOME` for your machine. From the repository root:

```sh
npm ci
cd apps/mobile
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

On Windows use `gradlew.bat`. The ARM64 debug APK is at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`; it supports the Pixel test device, not x86 emulators. Generated native directories and APKs stay ignored. App configuration declares the sensor permission and the local-only package ID `com.turn.navigation.dev`. Never distribute a private-venue release bundle publicly.

If Windows reports a Ninja filename longer than 260 characters, build from a short checkout path. Alternatively, from the repository root in PowerShell, map an **unused** drive with `subst T: "$PWD"`, then run the build from `T:\apps\mobile\android`. This aliases the same files without copying or deleting the repository. The local October 9 build uses this mapping. Keep it available for subsequent native builds; recreate it after a restart if needed.

If SUBST produces React Native/Kotlin errors about files having different roots, set `TURN_CANONICAL_ROOT` to the full original checkout path. Use the supplied [Gradle init script](../scripts/android-subst.gradle) and disable Kotlin's cross-drive incremental cache for this build:

```powershell
# Set this while still in the original repository directory, before switching to T:.
$env:TURN_CANONICAL_ROOT = $PWD.Path
$env:NODE_ENV = 'development'
Set-Location T:\apps\mobile\android
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process' --init-script T:\scripts\android-subst.gradle --max-workers=2
```

The init script adjusts build-task CLI paths only; it does not patch dependencies or generated native source. Prefer a genuinely short checkout on future machines. The first build after disabling incremental caches recompiles Kotlin dependencies.

Allow ample free space on both the Gradle-cache and checkout volumes for the first native build. This machine exhausted C: during compilation/packaging. Its generated Gradle 9.3.1 cache, app build output and selected native intermediates were relocated to `D:\TURN-build-20261009` with directory junctions preserving their original paths. These are local generated artifacts, not repository source or portable build requirements. Do not remove that directory while the junctions are in use. Old generated path metadata is preserved there too; no user recordings or source files were moved.

## Install and connect

From the repository root, in separate terminals:

```sh
npm run phone:tests -- --dev-client
npm run phone:android:install
npm run phone:qr -- exp://YOUR_COMPUTER_LAN_IP:8081
```

Keep the phone and computer on the same reachable LAN. If LAN auto-selection is wrong, set `TURN_LAN_IP` to the computer's address. Port 8081 serves the app, 8083 accepts explicitly sent recordings, and 8084 serves only the debug APK.

1. Scan `work/phone-test/android-install.png` with the Pixel camera/browser. Download/install the new TURN APK **over the existing TURN app**; Android may ask you to allow installation from this browser. Do not uninstall: the update keeps TURN's local tests and calibration when signed with the same development key.
2. Open TURN and scan `work/phone-test/android-launch.png`, or use the development-client URL in `connection.txt`. Use TURN on Android for this test, not Expo Go. The iPhone can continue using `expo-launch.png` with Expo Go.
3. In Tests, verify **Android buffered motion capture ready**. In Survey, confirm the **Include Wi-Fi signals** control is enabled (build 3). Try a short normal walk, then a stationary phone-bobbing control. Save and send both with the existing button. Each recording identifies `turn-android-imu-1`; the diagnostic receiver must be restarted after schema/source updates.

Both connection QRs launch software; neither establishes an indoor location. Existing TURN location markers remain separate. Saved Expo Go tests are in Expo Go's storage; the new TURN installation has its own calibration/history, so set calibration again before accuracy comparisons.

The app diagnoses persistently slow/missing streams after startup and distinguishes an outdated APK from an active native stream that is too slow. This does not certify timing synchronization, anti-bobbing behavior or position accuracy. Recordings/replay are needed to confirm those on the physical device. No automatic uploads, analysis or monitoring run in the background. Restart the APK server after rebuilding: it reads the artifact size at startup.

[Expo development builds](https://docs.expo.dev/guides/local-app-development/) · [SDK 57 motion API](https://docs.expo.dev/versions/v57.0.0/sdk/devicemotion/)
