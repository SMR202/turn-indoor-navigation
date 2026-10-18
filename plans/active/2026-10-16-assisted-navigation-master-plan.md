# Assisted indoor navigation: master plan

> Superseded for task tracking by [Plan 002](002-turn-masterplan.md) (2026-10-18). Research and decisions below remain valid.

Date: 2026-10-16. Goal: navigate through the home like a mainstream maps app, without running tests, using phones as beacons now and commercial beacons later. Status labels follow the repository convention: IMPLEMENTED, EXPERIMENT, PROPOSED, DECISION.

## Product shape (IMPLEMENTED)

Open the app → search or tap a destination → **Directions** → the app listens for the beacons and finds you (or you tap your spot) → confirm → hold the phone along the blue line → **Start walking**. Turn-by-turn banner, remaining distance/ETA, accuracy chip, automatic rerouting and automatic arrival. The old test navigator remains under Tests → classic test navigator.

## Positioning stack (IMPLEMENTED, ADR-0009)

| Layer                 | What it does                                                                                                                                                                        | Evidence status                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Walking sensors (PDR) | step-and-heading displacement between updates                                                                                                                                       | known drift; unmeasured on the new builds                          |
| Map constraints       | particles cannot cross walls or leave walkable space; doors are gaps                                                                                                                | synthetic: about half of the simulated drift gain                  |
| BLE range likelihood  | each beacon's smoothed RSSI scores every hypothesis through a calibrated log-distance model with heavy-tailed noise: a robust, multi-hypothesis form of trilateration               | synthetic only                                                     |
| Proximity fixes       | passing within about 1–2 m of a calibrated beacon pulls the estimate (Gaussian, 1.6 m), never a hard reset                                                                          | thresholds are starting values                                     |
| Drift states          | every hypothesis carries a heading-bias and step-scale state that random-walks and is corrected by radio and map evidence; this is the "right drift" the walking sensors cannot see | synthetic: 2.1 m → 1.0 m mean error with 20° bias and 10% overstep |
| Start without QR      | beacon readings alone initialize the filter over walkable space; the user confirms or taps the map                                                                                  | untested on hardware                                               |
| Fingerprint stations  | confirmed matches enter as position fixes; Find-my-place stays available from Survey                                                                                                | 7 iPhone records, one labelled test                                |
| Recording and replay  | every assisted walk saves raw walking positions, beacon samples, proximity events and the fused path; `replayAssistedTrace` re-runs the filter offline for tuning                   | no real walk uploaded yet                                          |

Synthetic results show the mechanics work; they say nothing about this house. Accuracy claims need real walks.

## Why probabilistic fusion rather than classic trilateration

Trilateration intersects distance circles computed from RSSI. Indoors, body shadowing and walls make RSSI-to-distance errors of several metres, and circles from three beacons seldom intersect cleanly. The particle filter uses the same physics (distance from signal strength) but keeps many hypotheses, tolerates outliers, and adds walking motion and the floor plan. This matches what indoor-positioning vendors describe publicly (beacons plus inertial plus map); see the [review](../../research/BLE_BEACON_POSITIONING_2026_10.md).

## What a professional deployment also needs (PROPOSED unless marked)

1. **Beacon placement geometry** (IMPLEMENTED: coverage-driven site suggestion; real placement still to verify). Beacons should surround the walking area, not cluster; three is the minimum for a house, four to five reduces dead zones. Mount at similar height, away from metal and doors.
2. **Per-beacon and per-phone calibration** (IMPLEMENTED: 1 m reference plus optional 4 m reading). Different phones read different RSSI; placements are tied to the phone that measured them. Next: pool survey data across passes to refit the model automatically.
3. **Health monitoring** (IMPLEMENTED: silent-beacon and scan-failure warnings). Next: in-app beacon battery/uptime panel and a "keep-alive" reminder; commercial beacons report battery.
4. **Graceful degradation** (IMPLEMENTED): no beacons → walking plus map plus manual position; stream failure → warning, tracking continues; sensors stop → resume without losing the position.
5. **Confidence in the UI** (IMPLEMENTED: accuracy halo and ± value). Next: low-confidence prompts ("Check your location") and automatic re-localization when uncertainty grows.
6. **Offline tuning loop** (IMPLEMENTED). Upload logs, `npm run analyze:ble`, change parameters, replay: no field trip per tweak.
7. **Evaluation protocol with ground truth** (PROPOSED, next). Mark passes at known landmarks and compute distance error and event hit/miss rates; do not claim accuracy without this.
8. **Accessibility** (PROPOSED). Spoken instructions, large banner, haptics on turns, screen-reader labels (partly present).
9. **Multi-floor and stairs** (PROPOSED). Barometer plus stair connectors; not needed for this house.
10. **Privacy and safety** (IMPLEMENTED/PROPOSED). Only TURN beacons are recorded; no continuous background tracking; the app states that guidance is an estimate.
11. **Commercial beacon migration** (PROPOSED). An identity adapter (iBeacon/Eddystone/vendor) feeding the same samples; Bluetooth Channel Sounding hardware would replace RSSI ranging if phone support matures.
12. **Operations** (PROPOSED). Venue package versioning with beacon positions, remote beacon health, firmware/battery logistics, a re-survey trigger when beacons move.

## Phases

1. **Now (IMPLEMENTED):** map-first navigator, beacon layout editor, fusion filter, recording/replay, health warnings. JavaScript only on top of Android build 5 and the iPhone build already installed.
2. **Next (needs your walks):** place and calibrate 3 beacons per the suggested sites, walk 5–8 routes (each end to end), send logs, compare against landmark passes; tune `rssiSigmaDb`, proximity thresholds and exponent from replay.
3. **Then:** auto-fit path-loss per beacon from walks, learned per-room signal offsets, automatic relocalization when uncertainty exceeds a threshold, haptic/voice guidance, polish of the map (room icons, labels at all zooms).
4. **Later:** commercial beacons and hardware range sensing; camera-assisted positioning (ARCore/ARKit) as an independent correction; multi-floor.

## Acceptance for "usable at home" (PROPOSED)

From any room, directions to any destination end with a correct arrival within 3 m in at least 9 of 10 end-to-end walks, with no manual position fixes and no crashes; median positional error under 2 m at landmark passes. Report failures, not only successes.
