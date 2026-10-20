# ADR-0012: iBeacon support, phone-led beacon setup and an always-on live dot

Status: Accepted, 2026-10-20. Supersedes the "Eddystone-UID only" restriction in [ADR-0007](0007-ble-beacon-fingerprints.md) and the earlier beacon setup guide; builds on [ADR-0011](0011-map-constraints.md).

## Context

FACT: the user's first commercial beacons are older April Brother units (nine). Seller listings describe them as iBeacon devices shipping with the AirLocate sample UUID and, on some models, the same major/minor on every unit; the exact model was not identified. TURN's scanners ignored iBeacon because iOS hides it from CoreBluetooth. The live dot only ran during navigation and had to be started by facing the route.

## Decision

IMPLEMENT:

- **iBeacon on both platforms.** Android decodes Apple manufacturer data (02 15) in the controller-filtered scan. iOS ranges iBeacon UUIDs through Core Location (needs "While Using" location permission; about one reading per beacon per second). Tag: `IB` + major + minor. Factory-default UUIDs are ranged by default; layouts can add more.
- **Shared identities.** Beacon frames also carry the device address (`MC…`, Android) and advertised name (`NM…`) as alternative tags; the setup screen adopts a beacon under an alternative when its iBeacon identity is shared, and says that iPhones need unique minors.
- **One shared native stream** (JavaScript hub): live tracking, "find me" and the setup screen listen to one native scan; a discovery mode (setup screen only) lists all advertising devices, never stored. It restarts after the app returns to the foreground.
- **Phone-led setup** in the visitor app: live signal list, add, place on the map, 12 s median 1 m calibration. Stored per phone over the published layout (calibration is phone-specific). Publishing for all phones stays in Studio.
- **Always-on live dot.** The venue screen locates automatically with beacons (or starts at a TURN code or a marked spot) and keeps one live session through browsing, previews, navigation and arrival; routes start at the live position. It resumes after backgrounding.
- **Heading without facing the route.** Phones already report compass-referenced attitude (iOS xMagneticNorthZVertical, Android rotation vector). The app learns the venue's north offset (venue heading − phone yaw) once the filter's heading spread is below 0.2 rad after 12 m of walking, and later starts align from the compass. With nothing known the filter starts with a full-circle heading spread (`biasLimit` π) that walls, doors and beacons narrow down.
- **Fluid dot.** The display pose steps at 10 Hz on the JS thread and hands the UI thread 120 ms linear animations; the map reads the dot's position, heading and accuracy from shared values and the camera follows it every frame, so the screen does not re-render per step.

## Evidence and limits

EXPERIMENT RESULT (synthetic): with no start heading at all, a corridor walk settles the heading correction within ±0.35 rad of the true offset in 25 steps (`fusion.test.ts`). Replaying the home walks (ADR-0011) gives identical results after these changes. No April Brother beacon has been heard by a TURN build yet; the frame layout follows the iBeacon format and is covered by decoder tests only. Frame rate was not measured on a phone. iOS iBeacon support needs the next CI IPA; Android needs build 7.

## Next

Hear the April beacons with Android build 7 (Beacons screen), set unique minors if they share one, place and calibrate them, then landmark-labelled walks to measure live accuracy.
