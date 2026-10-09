# Android sensor test build

Use Expo SDK 57. Pixel recordings on Android 12 delivered only approximately 4–8 unique motion updates/s through Expo Go. All detected steps were rejected by the motion filter because its 1.2-second window requires at least 25 synchronized samples. A JS reload cannot change an installed host's native manifest.

The installed expo-sensors 57.0.3 `SensorSubscription.kt` requests `SENSOR_DELAY_NORMAL` without `HIGH_SAMPLING_RATE_SENSORS` on Android 12+, regardless of DeviceMotion's JS update interval. With the manifest permission it requests `SENSOR_DELAY_FASTEST`, while TURN continues to request 20 ms JS delivery. This permission is a build-time declaration, not a Motion & Fitness settings toggle. Actual delivered rate still needs physical verification.

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

Allow ample free space on both the Gradle-cache and checkout volumes for the first native build. This machine exhausted C: during compilation/packaging. Its generated Gradle 9.3.1 cache, app build output and selected native intermediates were relocated to `D:\TURN-build-20261009` with directory junctions preserving their original paths. These are local generated artifacts, not repository source or portable build requirements. Do not remove that directory while the junctions are in use. Old generated path metadata is preserved there too; no user recordings or source files were moved.

## Install and connect

From the repository root, in separate terminals:

```sh
npm run phone:tests -- --dev-client
npm run phone:android:install
npm run phone:qr -- exp://YOUR_COMPUTER_LAN_IP:8081
```

Keep the phone and computer on the same reachable LAN. If LAN auto-selection is wrong, set `TURN_LAN_IP` to the computer's address. Port 8081 serves the app, 8083 accepts explicitly sent recordings, and 8084 serves only the debug APK.

1. Scan `work/phone-test/android-install.png` with the Pixel camera/browser. Download/install TURN; Android may ask you to allow installation from this browser.
2. Open TURN and scan `work/phone-test/android-launch.png`, or use the development-client URL in `connection.txt`. Use TURN on Android for this test, not Expo Go. The iPhone can continue using `expo-launch.png` with Expo Go.
3. Try a short normal walk, then a stationary phone-bobbing control. Save and send both with the existing button.

Both connection QRs launch software; neither establishes an indoor location. Existing TURN location markers remain separate. Saved Expo Go tests are in Expo Go's storage; the new TURN installation has its own calibration/history, so set calibration again before accuracy comparisons.

The app now diagnoses persistently slow/missing Android streams after startup instead of silently holding the dot. This does not certify timing synchronization, anti-bobbing behavior or position accuracy. Recordings/replay are needed to confirm those on the physical device. No automatic uploads, analysis or monitoring run in the background.

[Expo development builds](https://docs.expo.dev/guides/local-app-development/) · [SDK 57 motion API](https://docs.expo.dev/versions/v57.0.0/sdk/devicemotion/)
