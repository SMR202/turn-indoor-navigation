# Seeing and driving the test phones from the computer

`npm run phone -- <ios|android> <command>` takes screenshots and sends touches to a test phone, so TURN can be checked and driven on real devices from this computer ([script](../scripts/phone-remote.mjs)). Screenshots go to `work/phone-shots/` (ignored by Git; they can show private screens, so they never leave the computer).

| Command                              | What it does                                                          |
| ------------------------------------ | --------------------------------------------------------------------- |
| `ios start`                          | Tunnel, developer disk image, WebDriverAgent, port 8100 (iPhone only) |
| `shot [file]`                        | Screenshot (PNG)                                                      |
| `tap X Y`                            | Tap at screenshot pixel X, Y                                          |
| `swipe X1 Y1 X2 Y2 [ms]`             | Drag                                                                  |
| `pinch X Y SCALE [ms]`               | Two-finger zoom around X, Y (iPhone only; SCALE above 1 zooms in)     |
| `home`, `launch [bundle id/package]` | Home screen; open TURN (default) or another app                       |
| `status`                             | WebDriverAgent status (iPhone) or attached devices (Android)          |

## iPhone (Windows, no Mac)

**DECISION:** [go-ios](https://github.com/danielpaulus/go-ios) (MIT) talks to the iPhone through Apple Mobile Device Service (installed with iTunes); [WebDriverAgent](https://github.com/appium/WebDriverAgent) (BSD-3) takes screenshots and performs touches as an XCTest runner. Appium's release ships an unsigned real-device runner, so no Mac or CI build is needed.

**EXPERIMENT RESULT (2026-10-21):** iPhone 15 Pro, iOS 26.5, go-ios 1.3.2, WebDriverAgent 16.15.3: screenshot, tap, two-finger pinch, opening a link and launching TURN worked over USB; after pinching TURN's map in and out, its on-phone self-check reported no drift between floor plan and labels.

One-time setup:

1. Tools in `work/tools` (not in Git), from the projects' GitHub releases: `go-ios-win.zip` v1.3.2 (SHA-256 `939c6bcaafed183a92afb9f79cc11b1f935fa6389bfc94d3902e3f52c4dff3fe`) unpacked to `work/tools/go-ios/bin/ios.exe`; `WebDriverAgentRunner-Runner.zip` v16.15.3 (SHA-256 `2176793538d902f6b1e61291e9997f68d306541f222ea715d256a7c6ce9d4fc5`). go-ios downloads the developer disk image itself (from deviceboxhq.com for iOS 26.5).
2. Give the runner unique bundle ids (`com.smr202.turnwda.xctrunner` and `com.smr202.turnwda`; Appium's `com.facebook.*` ids are taken) and pack `Payload/WebDriverAgentRunner-Runner.app` (without the dSYM) as `work/tools/wda/TURN-WDA-unsigned.ipa`. Sideload it with Sideloadly and your Apple ID, like the TURN build. Sideloadly appends the team id to bundle ids; the script finds apps by prefix. Free Apple IDs re-sign every 7 days.
3. Developer Mode on (already needed for TURN).
4. Windows does not trust **Apple Root CA** for servers, and iOS 17+ developer images are personalised by Apple's signing server (`gs.apple.com`), so go-ios fails with `x509: certificate signed by unknown authority`. The phone's owner adds Apple Root CA (apple.com/certificateauthority, SHA-1 `611E5B66 2C593A08 FF58D14A E22452D1 98DF6C60`) to **Current User → Trusted Root Certification Authorities** (certmgr.msc); the wizard's automatic choice puts it under _Intermediate_, which is not enough. It can be removed afterwards; a later remount after an iPhone restart may need it again.

Each session: iPhone on the cable and unlocked, then `npm run phone -- ios start` (starts `ios tunnel start --userspace`, mounts the image, runs WebDriverAgent and forwards port 8100; logs in `work/tools/logs/`). A locked iPhone gives black screenshots; the script never enters a passcode. Setting Auto-Lock to _Never_ while testing avoids that.

## Android

`adb` from the Android SDK: an emulator, a USB phone, or **wireless debugging** without a cable (Android 11+): Developer options → Wireless debugging → Pair device with pairing code, then on the computer run `adb pair IP:PORT` (type the code yourself) and `adb connect IP:PORT` with the address shown on the Wireless debugging screen. With several devices set `ANDROID_SERIAL`. Pinch is not available through adb.

## TURN on the phones

Phones load TURN from the production-mode server on port 8081 (`npx expo start apps/navigator --port 8081 --dev-client --no-dev --minify`): no Fast Refresh, so code edits never reach a running app half-applied; reopen the app to get new code. The map's self-check reports to the TURN API log (`[client-error] … map-check`).
