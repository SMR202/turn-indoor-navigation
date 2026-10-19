# Development setup

Node 24.19.0 (.nvmrc; compatible >=24.3 <25), npm 10/11, Git. Use a normal version manager. Run npm ci at root. No machine-specific paths required.
SDK 57's documented native baseline is Android 7+ and iOS 16.4+; local iOS builds need Xcode 26.4+. These are toolchain constraints, not a verified product/device support promise. See [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/); confirm installed phone OS before testing.

## Product platform

`npm run platform` starts the API (8090), TURN Studio/Ops (5173) and the visitor app's Metro server (8082) together, prints the LAN addresses and saves a phone launch QR to `work/navigator-phone-qr.png` (the Expo launch QR for the installed TURN dev build, not a TURN location marker). Individually: `npm run api`, `npm run console`, `npm run navigator`. Development sign-in accounts are listed by the API on start. Beacon hardware: [beacon setup](BEACON_SETUP.md); floor plans: [map import format](MAP_IMPORT_FORMAT.md).

## Mobile

npm run mobile starts Metro. Try matching Expo Go for the initial compatible UI/SVG slice. Its development QR launches the app; it is not a TURN position anchor. Device/computer need Metro connectivity. npm run web validates UI only.

Android motion testing now uses a [TURN development build](ANDROID_TEST_BUILD.md) with fast-sensor manifest configuration; Expo Go on the tested Pixel delivered insufficient samples. Local Android needs Android Studio/SDK. Local iOS needs macOS/Xcode/signing; the iPhone can continue using compatible Expo Go. No EAS project or release signing is configured. Record OS/capabilities and validate physical behavior before pilot claims.

## Dependencies / quality

Install from root with npm workspace options. For native Expo packages run Expo's installer from apps/mobile; commit root lockfile. npm run check covers types/tests/lint/format/local links. npm run export:web covers Metro bundle. CI repeats on Ubuntu; native/device tests are separate.

## Environment / migrations

No environment variables needed; .env.example is the template. EXPO_PUBLIC_* values ship to clients, never use for secrets. Local env/native output/private data are ignored.
Backend/admin/database do not exist. When persistence is needed, choose a migration tool in an ADR, commit ordered migrations and safe fixtures, provide migrate/seed commands and test fresh/upgrade paths. Venue migrations must be explicit pure transforms and regression fixtures before schema changes; no migration is needed for initial v1.

## Experiments

Raw captures immutable outside Git with manifests/hashes. E001 recording/replay tooling is not ready; implement an explicit deterministic command before collection requests. Product map/routing progresses independently.
