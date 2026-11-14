# TURN project state

Updated: 2026-11-14.

## Current milestone

M0/M1/M2 and experimental PDR implemented. Current branch `codex/native-step-comparison` includes settled starts, labelled trials, native/manual count comparison, local history and one-tap LAN transfer. Fourteen inbox recordings were replayed; new sessions now use a versioned experimental motion filter. General localization accuracy remains unvalidated.

## Product excellence — 2026-11-14 (Plan 005)

Owner's brief (2026-11-13): the app works but is not publishable; make every part excellent. [Plan 005](../plans/active/005-turn-masterplan-excellence.md) is the plan of record. IMPLEMENTED since 2026-11-13:

- **Map** ([ADR-0016](../decisions/0016-map-look-and-camera-director.md)): rooms as low blocks with names, open corridors, ground shadow, light and dark palettes; the walker's room, rooms on the route and the destination open; route chevrons, destination pin, a constant-size dot with an uncertainty disc and a beam; a camera director that turns the map with the route, not the compass; 2D/3D, compass and re-centre controls. A framing bug (padding counted twice) is fixed.
- **Experience**: one Start button (live when the phone can position itself, else step by step), Preview, no technical mode names, staff tools behind a setting, mute in the navigation bar.
- **Floors** ([ADR-0017](../decisions/0017-floor-belief.md)): barometric floor-change detector and a floor belief that also uses beacons on other floors and the route; the map changes floor by itself, the button stays as fallback.
- **Search**: word starts in any order, typo tolerance, everyday synonyms, room numbers, nearest first, did-you-mean; failed searches reported anonymously.
- **Offers** ([ADR-0018](../decisions/0018-offers-decided-on-the-phone.md)): authored in Studio, decided on the phone with fixed limits, anonymous counts back.
- **Mapping studio**: draw or trace a floor over a plan picture, detect rooms and doors automatically, reshape existing floors, live checks; corridors that bend now route.
- **Phones**: performance tiers (filter size, 2D/3D), a capability report with what each missing sensor changes, GPS entry maths.

Validation: `npm run check` passes (370 tests); visitor app and Studio exercised in a headless browser (demo walk, search, offer card, editor from picture to built floor). Nothing new has run on a phone: the phone map renderer, barometer, floor switching and tiers are unverified there. Floor and tier thresholds are untuned defaults; all positioning accuracy remains unmeasured (beacons not mounted).

Added 2026-11-14 ([ADR-0019](../decisions/0019-start-hypotheses-and-recovery.md)): the filter keeps an opposite-direction start hypothesis, trusts the compass less in a disturbed magnetic field, and looks for the position again when beacons keep contradicting it; large corrections show as a jump with "Position updated"; a lost position is drawn grey. Simulated tests only, plus a replay of 4 recorded home walks (no false recovery).

Not done from Plan 005: search results as map pins, DXF import, phone capture of a building, background offer notifications, the native build with GPS and beacon battery frames, store release, hosted backend.

Next action: install the current builds' JavaScript on both phones (no new native build is needed for the map, floors, search or offers), walk the home venue and one FAST floor, and record floor changes on stairs to tune the detector. Then beacon day ([beacon setup](BEACON_SETUP.md)).

## TURN 1.0 — 2026-11-06 (Plan 004)

Goal set by the owner: finish everything except connecting the ordered commercial beacons (Minew E7+), with Pointr-level features ([Plan 004](../plans/active/004-turn-1.0.md)). IMPLEMENTED since 2026-10-28:

- **Orientation** ([ADR-0014](../decisions/0014-venue-georeference-and-orientation.md)): venues carry a georeference (origin, bearing of map north) set in TURN Studio over satellite or street maps; live starts use own, crowd or venue-bearing compass offsets instead of assuming the route direction (the FAST "dot goes the wrong way" diagnosis).
- **3D map** ([ADR-0013](../decisions/0013-maplibre-map-engine.md)): one MapLibre style from `@turn/map-scene` (extruded walls, labels, category icons, route, selection) for the visitor app (native in Android build 8; web) and Studio; follow mode keeps the dot low on screen, heading-up and tilted; offline glyphs and icons.
- **Guidance**: spoken directions and vibration cues (mutable), off-route notice within 1.5 s, "You passed your turn", "Turn around", reroute after 6 s.
- **Device profiles** ([ADR-0015](../decisions/0015-device-profiles.md)): platform defaults, a per-model shared median and a per-phone learned stride and RSSI offset.
- **Beacon programme**: simulator and planner (fewest beacons for room-level, 3 m or 2 m targets with the cost curve and heat map), planned sites, a printable install sheet, snap-to-site setup in the app, beacon health.
- **Studio map editing**: move and add places, rename rooms, staff-only rooms that routes avoid, all with Undo (`applyVenueEdits`; the TURN-Mapper plan stays untouched).

Validation: `npm run check` passes (271 tests); visitor web and Studio bundles build; Studio editing, install sheet and planner exercised in the browser (DOM checks; the browser pane was hidden, so not visually). Android build 8 built locally, not yet installed. Nothing new has run on a phone; all accuracy figures are simulated (radio only) and are not venue results. EXPERIMENT RESULT: FAST floors of one block are not in a shared frame and stairs are rarely labelled, so the campus cannot yet be one routed building (TURN-Mapper building packages needed).

Next action: install Android build 8 and test the new map, voice, compass start and off-route cues on site; the iPhone needs a CI build (owner's go-ahead to push). When the beacons arrive, follow the install sheet and [beacon setup](BEACON_SETUP.md).

## Product platform — 2026-10-19 (Plan 003)

TURN now has three product surfaces beside the test app:

- the **TURN visitor app** (`apps/navigator`, Expo SDK 57): venue catalog, the new indoor map renderer, search, place details, route preview with named turn-by-turn steps, live, demo and step-by-step guidance, and arrival;
- **TURN Studio / TURN Ops** (`apps/console`);
- a development **API** (`apps/api`).

The positioning runtime is shared through `@turn/positioning-runtime`; the test app keeps working through re-export shims. Brand tokens and assets live in `@turn/design`. Since then: multi-floor venues end to end (import, linking, routing, maps), beacon health, team management, venue branding and Eddystone-UID support in the native scanners (needs new native builds). The visitor app and console were exercised in the browser only. The visitor app has not yet run on a phone, and live guidance has no measured accuracy. [Plan 003](../plans/active/003-product-platform.md), [backend/admin status](workstreams/backend-admin/STATUS.md), [mobile status](workstreams/mobile/STATUS.md).

## Fingerprinting pilot and app interface

Implemented magnetic station surveys on iPhone/Android, optional fresh Wi-Fi scans in Android build 3, independent recognition tests, immutable inbox transfer and shared replay. A recent, physically confirmed candidate can establish/recover navigation at a surveyed anchor. Persistent Navigate / Survey / Tests tabs and shared accessible controls replace the previous screen navigation. [Fingerprint test protocol](FINGERPRINT_TESTING.md). No continuous fingerprint fusion or measured accuracy improvement is claimed.

October 10 follow-up: fixed SDK 57 fingerprint file replacement ordering; new recognition records use versioned repeatability-based ranking with explicit confidence and Wi-Fi fallback reasons. Confirmed corrections now link the fingerprint query to preceding/new PDR segments while retaining the destination. Seven uploaded queries supplied development evidence; fresh held-out trials and physical correction tests remain the next gate. Historical replay stays unchanged. [Current positioning status](workstreams/positioning/STATUS.md).

## Assisted navigation — 2026-10-16

The default Navigate tab is now a maps-style navigator: search/tap a destination, find your start from beacons (or tap the map), start, turn-by-turn with automatic rerouting and arrival. Positioning is a map-aware particle filter fusing walking sensors, calibrated BLE signal strengths (probabilistic trilateration), proximity and fingerprint fixes, with heading-drift states ([ADR-0009](../decisions/0009-particle-filter-fusion.md), [master plan](../plans/active/2026-10-16-assisted-navigation-master-plan.md)). Beacon sites are suggested on the map and calibrated in the Beacons tab. The previous test navigator is kept under Tests. Only synthetic simulation supports the algorithm; no accuracy has been measured on real end-to-end walks yet.

## Capabilities

One-floor room-to-room navigation is now the main user flow: destination search, known-location start, live route progress/turns, user-confirmed arrival and QR/manual recovery with recalculation. Diagnostics remain in a separate screen. [Navigation protocol](NAVIGATION_TESTING.md). This is route progress, not pose correction or verified wall-based map matching.

Expo SDK 57; private local venue packages with room dimensions; zoomable maps; camera/manual anchors; local routes; guided courses; saved calibration; walked trail and endpoint error; portable recordings with embedded venue; automatic local run saving, count/pace annotations and replay comparisons; deterministic replay; active-venue launch/location QR generation. [Local venue instructions](LOCAL_VENUES.md). Default public fixture remains synthetic.

## Active workstreams

[Mobile](workstreams/mobile/STATUS.md), [positioning](workstreams/positioning/STATUS.md), [PDR](workstreams/pdr/STATUS.md), [routing](workstreams/routing/STATUS.md), [venue packages](workstreams/venue-packages/STATUS.md). Other scope remains in the [workstream index](workstreams/README.md).

## Gaps

Repeatable accuracy unvalidated; initial user trials show count variation and heading offset. Plan-derived geometry needs field verification, especially unlabelled wall/door positions. No floor detection, updater, hosted backend, real authentication or published SDK (a development API and console exist). Phone/OS and carry-mode validation pending. October 9 dependency audit reports 32 findings (11 moderate, 20 high, 1 critical); forced Expo/RN downgrades conflict with SDK 57. See [reuse registry](../research/REUSE_REGISTRY.md).

## Direction

[Market review and execution plan](../research/MARKET_DIRECTION_2026_09.md) preserves multi-sensor corrections, offline venue packages, authoring and a reusable SDK. Native counts provide diagnostic evidence only. New phone sessions use experimental `step-yaw-motion-v2`; historical v1 replay is preserved. Rejection of the available bobbing control is a development result, not general accuracy. See [motion-filter experiment](../research/MOTION_GUARD_EXPERIMENT.md). One-tap LAN transfers deliver tests into the private project inbox.

## Next action

User now reports movement on Pixel and iPhone, with remaining distance/calibration differences. Android **build 2** replaces Expo's display-frame snapshots with a dedicated 50 Hz sensor request and timestamp-preserving bounded batches; PDR thresholds and SDK 57 remain. [ADR-0006](../decisions/0006-android-buffered-motion-acquisition.md) records the evidence and limits. This follow-up is qualitative: new-build delivered rates and accuracy still need recordings. The iPhone retains Expo Go for existing PDR.

The user selected fingerprinting as the next implementation slice, superseding the previous immediate VIO-first action. Next: survey at least three physical stations twice on each phone, collect held-out recognition trials, send them, and measure wrong matches and abstentions before automatic fusion. Camera-assisted room-to-room positioning remains a later candidate, ARCore on Pixel and ARKit on iPhone, alongside verified map constraints and passive BLE/magnetic corrections. [October 9 research and implementation handoff](../research/HYBRID_POSITIONING_NEXT_STEP_2026_10.md). No AR adapter or fused estimator exists yet; native integration and physical evaluation are separate gates. iPhone AR will require a signed development build.

Walk a short room-to-room route through one turn, then exercise pause/re-anchor recovery with destination retained; upload both sessions via the inbox. Product flow progresses while brisk-count/stride and heading issues remain under evaluation.

Run the [phone protocol](PHONE_TESTING.md): independent calibration, held-out straight/turn walks, native timestamp/heading verification, immutable recordings and per-device drift results. Proposed targets are not results. Do not deploy as real-building guidance.

## Automation

CI runs types, unit tests, lint, formatting, docs links and web export on push/PR. No recurring agent loop or monitor. Phone QR generation is a local command and the development server must remain running.
