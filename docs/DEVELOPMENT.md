# Development setup

Node 24.19.0 (.nvmrc; compatible >=24.3 <25), npm 10/11, Git. Use a normal version manager. Run npm ci at root. No machine-specific paths required.
SDK 57's documented native baseline is Android 7+ and iOS 16.4+; local iOS builds need Xcode 26.4+. These are toolchain constraints, not a verified product/device support promise. See [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/); confirm installed phone OS before testing.

## Mobile

npm run mobile starts Metro. Try matching Expo Go for the initial compatible UI/SVG slice. Its development QR launches the app; it is not a TURN position anchor. Device/computer need Metro connectivity. npm run web validates UI only.

Use development builds once native acquisition/BLE/custom modules require them; install expo-dev-client with Expo's installer then build. Local Android needs Android Studio/SDK and device/emulator. Local iOS needs macOS/Xcode/signing; Windows can use compatible Expo Go or a separately configured EAS build. No EAS project/signing/native binary is configured. Record OS/capabilities and validate physical behavior before pilot claims.

## Dependencies / quality

Install from root with npm workspace options. For native Expo packages run Expo's installer from apps/mobile; commit root lockfile. npm run check covers types/tests/lint/format/local links. npm run export:web covers Metro bundle. CI repeats on Ubuntu; native/device tests are separate.

## Environment / migrations

No environment variables needed; .env.example is the template. EXPO_PUBLIC_* values ship to clients, never use for secrets. Local env/native output/private data are ignored.
Backend/admin/database do not exist. When persistence is needed, choose a migration tool in an ADR, commit ordered migrations and safe fixtures, provide migrate/seed commands and test fresh/upgrade paths. Venue migrations must be explicit pure transforms and regression fixtures before schema changes; no migration is needed for initial v1.

## Experiments

Raw captures immutable outside Git with manifests/hashes. E001 recording/replay tooling is not ready; implement an explicit deterministic command before collection requests. Product map/routing progresses independently.
