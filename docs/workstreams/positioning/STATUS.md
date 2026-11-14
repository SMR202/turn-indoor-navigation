# Positioning workstream

Updated: 2026-11-14.

## Floors, phone tiers, GPS entry — 2026-11-14 ([Plan 005](../../../plans/active/005-turn-masterplan-excellence.md))

IMPLEMENTED: `positioning-core/floor.ts` ([ADR-0017](../../../decisions/0017-floor-belief.md)): `FloorChangeDetector` (pressure to floor-change events: relative height only, 60% of a storey then 2.5 s level, pressure steps faster than 1.2 s ignored, stairs / lift / escalator from climb rate and stepping) and `FloorBelief` (barometer moves, strongest beacon per floor, a route nudge, the walker's confirmation; shown floor switches at 0.8). Runtime: `sensors/barometer.ts` (feature-detected), beacons on other floors heard as floor hints only (`AssistedTracker.floorVotes`), `performance.ts` (tier from memory, model age and measured frame pacing; 800 / 400 / 200 particles; capability notes) and `sensors/capabilities.ts`. `map-scene/geo.ts`: `entryFix` and `venueAt` for a GPS fix at an entrance.

Validation: 16 floor tests on simulated pressure traces (an hour of ±1.2 hPa drift with noise gives no event; one storey by stairs with a landing; three storeys by lift; a 0.3 hPa door step ignored at 1 Hz and 10 Hz; a mezzanine not counted; beacons alone decide without a barometer; recovery from a false barometer event). 7 performance tests, 4 GPS tests. EXPERIMENT RESULT: none; no pressure recording from a building exists yet.

Decisions: floor is a belief, never one sensor ([ADR-0017](../../../decisions/0017-floor-belief.md)). All thresholds are PROPOSED defaults.

Open: magnetic disturbance widening the heading uncertainty; the opposite-direction start hypothesis; stillness and kidnapped-recovery rules; expo-location for the GPS fix (native build).

Next: record pressure while climbing each staircase at home and at FAST (phone in hand and in pocket), replay through the detector, and set storey heights and thresholds per venue.

## Orientation, device profiles, beacon simulator — 2026-11-06

FACT (user report, FAST): walking right moved the dot left. Diagnosis: new venues had no map north, so live starts assumed the walker faced along the route. IMPLEMENTED: compass start with this phone's learned offset, else other phones' (same platform), else the venue bearing ([ADR-0014](../../../decisions/0014-venue-georeference-and-orientation.md)); a marked direction still wins. Device profiles set stride, scan cadence and an RSSI offset prior in the filter (`rssiOffsetPriorDb`), learned per phone and shared per model ([ADR-0015](../../../decisions/0015-device-profiles.md)).

IMPLEMENTED: `beacon-simulator.ts`: log-distance path loss with wall loss, 5 dB noise, a 4 dB phone offset and negative information. `simulateAccuracy` reports median and 90% error and right-room rate; `planForTarget` searches for the fewest beacons for a target. EXPERIMENT RESULT (simulation only, radio only, no steps): C-F4 room-level target, 22 beacons, 2.0 m median, 6.1 m p90, 91% right room. No venue accuracy is established.

Next: verification walk with landmark marks once beacons are mounted; compare the walk with the simulator's prediction.

## Distance-ranked sticky zones, calm dot, "Not here?" corrections — 2026-10-22

FACT (user report): sometimes standing closest to one beacon placed the dot at another; the dot "moves all over the place". Causes in the code: the zone ranked beacons by raw loudness (the home beacons' 1 m levels span -68 to -59 dBm, so a loud beacon through a wall could outrank a quiet one nearby), switched rooms on a 3 dB lead for 2 s, and pulled hypotheses onto the beacon point (σ 2.2 m); the display followed every radio and zone update.

IMPLEMENTED: zones rank by dB above each beacon's 1 m level; enter on a 4 dB lead for 2 s, switch only on a 6 dB lead over the current zone for 4 s; the pull is room-sized (σ 3 m, walls weighted) and a cloud that cannot explain the beacon restarts spread over its room (`ParticleFusion.updateNear`). `DisplayPose`: an unexplained move over 2 m waits for a second estimate within 2 m and 8 s; the standing dead band grows with uncertainty (0.6 σ). `roomBelief` sums hypotheses per room; the visitor app's **Not here?** sheet offers the likeliest rooms, Find me again, or a point on the map, and posts each answer with the current readings to `/public/venues/:id/location-feedback` (private LAN venues, stored in `location_feedback`).

EXPERIMENT RESULT (synthetic, mechanics only): a quiet beacon 2 m away now beats a beacon heard 5 dB louder through a wall; a 4 s, 40 dB flicker of another room's beacon no longer moves the walker; one unexplained 6 m jump is not drawn until a second estimate agrees. No venue accuracy is established.

Next: home walk with the iPhone on the production server: note per room whether the dot settles in the right room and how often **Not here?** is needed; the stored answers become the first labelled set for a room classifier.

## Nearest-beacon zone, beacon test survey — 2026-10-21

FACT (user report): standing next to a beacon in the rear bedroom, with that beacon clearly strongest, the dot stayed in the lounge, passage or entrance. Causes in the code: radio was applied only after 1 m of walking; the proximity detector needed 3 readings in 2 s (iPhone ranging gives 1 per second, so it never fired on iPhone) and a 6 dB lead, and fired once per approach.

IMPLEMENTED (`AssistFusion`, replaces the proximity detector in live and replay): a nearest-beacon zone tuned for 1 Hz ranging (strongest beacon within 12 dB of its 1 m level and 3 dB above the runner-up for 2 s, two beacons heard) applies `ParticleFusion.updateNear`: Gaussian σ 2.2 m around the beacon times 0.35 per wall between hypothesis and beacon, restarting in the beacon's room when the cloud cannot explain it; on entry and every 4 s while it stays nearest, standing or walking. Beacon test survey in the visitor app (`beacon-survey.ts`): readings of every beacon while standing at each placed one, a pass/fail per beacon (strongest at its own spot) and a least-squares log-distance fit (one exponent for the building, one 1 m level per beacon); fitted placements carry their exponent and are not pooled. Surveys of private LAN venues are posted to the TURN API.

EXPERIMENT RESULT (synthetic, mechanics only): a walker standing beside a beacon in the next room with a wrong start is moved into that room within 12 s at one reading per beacon per second; a walker in a doorway between rooms does not move. The survey fit recovers a known exponent within 0.3 and 1 m levels within 2.5 dB. No venue accuracy is established.

EXPERIMENT RESULT (home survey, iPhone 15 Pro, 2026-10-21; 9 April Brother iBeacons, 37 readings): every beacon is the strongest at its own spot, by 9 to 30 dB (median 21); no swapped placements. Under a beacon (about 0.8 m) the phone reads -49 to -66 dBm. One log-distance model fits with exponent 2.6 and 5.9 dB RMS misfit; fitted 1 m levels span -68 to -59 dBm, against -79 to -58 by hand (hand values up to 12 dB too weak). Counting walls does not improve the fit: almost every reading between rooms crosses exactly one wall. Conclusion: nearest-beacon zones suit this house; the weakest margins are Beacon 9 (+9 dB, Beacon 8 reaches the dining room from 7 m) and Beacon 2 (+11 dB).

Next: apply the measured calibration (Use measured calibration), then landmark-labelled walks to measure positioning error.

## Offset-robust beacon likelihood and pooled calibrations — 2026-10-21

FACT (home layout shared by the phones): the nine identical April beacons were hand-calibrated at -58 to -79 dBm at 1 m, a 21 dB spread; one beacon model normally varies by a few dB, so several calibrations are probably off (Beacons 9, 2 and 7 read -79/-76/-75).

IMPLEMENTED (`AssistFusion`, live and Locate me): (1) each radio update scores every particle with its best offset shared by all readings (Gaussian prior 6 dB, marginalised), so a phone that hears every beacon weaker than the calibrating phone, or a hand over the phone, no longer shifts the position; (2) with four or more calibrated beacons each 1 m reference is pulled half way to the venue median (`pooledReferences`), a hierarchical prior over one beacon model, also feeding the proximity detector. ParticleFusion's own default stays off (`rssiOffsetSigmaDb: Infinity`), so replays of other paths are unchanged.

EXPERIMENT RESULT (synthetic, mechanics only): with every reading 10 dB low, RSSI-only localisation error is lower with the offset term than without (`fusion.test.ts`). No venue accuracy is established.

Next: recalibrate Beacons 2, 7 and 9 (phone 1 m away, nothing in between, same height); landmark-labelled home walks to measure the error.

## iBeacon, shared beacon stream, unknown-heading starts — 2026-10-20

DECISION: [ADR-0012](../../../decisions/0012-ibeacon-and-always-on-live.md). IMPLEMENTED: iBeacon decoding (Android controller filter; iOS Core Location ranging of factory and layout UUIDs), address/name alternative tags for beacons sharing an iBeacon identity, one shared native beacon stream with a discovery mode and foreground restart, full-circle heading uncertainty (`biasLimit`), circular heading-bias mean and spread, compass-aligned starts from a learned venue north offset, a 4 s / 2-packet radio window for 1 Hz iBeacon ranging.

EXPERIMENT RESULT (synthetic): from a fully unknown heading a 25-step corridor walk settles the heading correction within ±0.35 rad; the ADR-0011 replay is unchanged. No April Brother beacon has been heard by a TURN build yet.

Validation: root typecheck and 214 tests pass. Next: hear the April beacons with Android build 7, then landmark-labelled walks.

## Map constraints for the live dot — 2026-10-19

DECISION: [ADR-0011](../../../decisions/0011-map-constraints.md). The dot must never be drawn through a wall and should follow the route people walk.

IMPLEMENTED: walk graph with walkable paths through doors (`walk-graph.ts`); doorway connectors over wall-thick gaps in imported plans (`buildFusionMap`); wall sliding with heading-bias learning (`wallSlide`); a soft route prior (σ 2.5 m, floor 0.15); start heading uncertainty (0.5 rad facing the route, 0.3 rad when marked); heading-preserving tap corrections (`relocate`); a path-aware `DisplayPose` (`setMap`: through doors, along the route's arc, no snapping across walls, backtrack hold, jump when unconnected). A room-mode estimate was tried and rejected on the evidence.

EXPERIMENT RESULT (replayed and simulated walks on the private home plan, aggregate only; `scripts/map-constraint-eval.ts`): drawn wall crossings fall from 1–289 per scenario to 0 while navigating, and from 39–299 to 0 (2 jumps in one run) when not; wrong-room time on simulated walks with a skewed heading falls from 53–57% to 19% (±30–45°). Synthetic: no venue accuracy is established.

Validation: root check passes (205 tests), including the synthetic demo-centre walk test (`map-constraints.test.ts`). No physical walk has used this yet.

Next: physical home walks starting with **Set my location**, with landmark marks; compare against the replay.

## Plan 002 start: stable evidence policy and evaluation — 2026-10-18

IMPLEMENTED: `AssistFusion` (ADR-0010) shared by the live tracker and replay; `npm run eval`; landmark marks (`Mark where I am`) saved in assisted traces; [evaluation protocol](../../EVALUATION.md). EXPERIMENT RESULT: on the five recorded assisted walks the replay cuts standing drift from 49.9 m to 1.9 m and matches the walking path length; this is stability, not accuracy. Next: label walks with landmarks (Plan 002 E1/E2), then P1–P3.

## Assisted navigation: fusion, map-first navigator — 2026-10-16

IMPLEMENTED: ParticleFusion (walls/walkable constraints, RSSI range likelihood with heavy-tailed noise, proximity and position fixes, heading-bias and step-scale states, cold start from radio), AssistedTracker (live stream → filter → recorder), trace replay for offline tuning, beacon site recommendation, assisted ble-trace records (raw walking, samples, events, fused path). [ADR-0009](../../../decisions/0009-particle-filter-fusion.md); [master plan](../../../plans/active/2026-10-16-assisted-navigation-master-plan.md).

EXPERIMENT RESULT (synthetic): with 20° heading bias and 10% step overestimate, mean error 2.1 m raw walking → 1.0 m fused (1.2 m from the map alone), 0.85 m at the end of the route versus 3.9 m raw; robust to 8 dB shadowing. Not venue accuracy.

Validation: root check passes (129 tests); web export succeeds; maps-style screen inspected in the browser pane with simulated taps (no phone sensors). Android/iPhone bundles served by Metro. No physical assisted walk has been run.

Next: place and calibrate three beacons (suggested sites), walk end-to-end routes, send logs (Beacons → Send walk logs), run `npm run analyze:ble`, label landmark passes, tune from replay.

## First iPhone BLE results and shadow-log diagnostics — 2026-10-16

EXPERIMENT RESULT: seven iPhone fingerprint records arrived (six survey snapshots, one labelled test; all `station-rank-v3`, three stations, two passes each). The iPhone TURN build scans beacons: 52–125 packets per 8 s pass. B1 was heard at about −65/−67 dBm at one station, about −82 dBm at another and not at the third; B2 at about −84 dBm at its station and −94/−98 dBm near B1's, so the three places are separable by beacon signal alone. The single labelled test ranked the correct place first (score 0.43 versus 1.49), but the lead is "tentative": margin 1.06 is below the 1.25 clear gate, so it abstained — the same over-conservative-margin pattern found for magnetic scoring. One test establishes nothing statistically; more held-out trials per station are needed before changing gates. Raw files remain in ignored work/test-inbox; analysis scripts in ignored work/ble-analysis-20261016.

FACT: no `ble-trace` shadow log has been uploaded, so no proximity-event, miss or discrepancy result exists. The phone saved a shadow log after the walk but it must be sent from Beacons → Send beacon walk logs. Added: a plain-language summary after each walk (beacons heard, events, estimate-to-beacon distance) and `npm run analyze:ble` for uploaded logs, including a threshold sweep on the recorded samples.

Next: send the saved beacon walk logs; run 5+ held-out Find my place trials per station with BLE on; then retune the BLE gate and proximity thresholds from data before any live correction.

## BLE proximity anchors, shadow mode — 2026-10-16

DECISION: [ADR-0008](../../../decisions/0008-ble-proximity-anchors-shadow-mode.md) with the [BLE positioning review](../../../research/BLE_BEACON_POSITIONING_2026_10.md): calibrated passive proximity anchors, recorded in shadow mode before any live correction; trilateration deferred (RSSI shadowing, unknown phone power).

IMPLEMENTED: placement/calibration schema, pure `ble-proximity-v1` detector, versioned `ble-trace` record with offline `replayBleTrace`, native continuous TURN-only streams (Android `turn-ble-2`, iOS `turn-ble-ios-2`), recorder that logs events with the navigation estimate and beacon distance without changing the pose, Beacons-tab placement UI and upload (`/ble-traces`). Root check: 112 tests. Thresholds are starting values. No physical shadow log exists yet.

Next: place/calibrate 3–4 phone beacons, walk past them, send logs, label passes and measure false events, misses and PDR-to-beacon discrepancy; only then decide live correction.

## BLE beacon fingerprints (phone beacons) — 2026-10-15

DECISION: BLE beacons precede the ARCore slice because commercial beacons are expected soon and spare Android phones allow immediate testing. [ADR-0007](../../../decisions/0007-ble-beacon-fingerprints.md): BLE is an optional part of the existing fingerprint capture, surveyed per place, matched by the shared `station-rank-v3`. Historical v1/v2 records replay unchanged; a v3 query without usable BLE falls back to the v2 magnetic/Wi-Fi path.

IMPLEMENTED: versioned optional `ble`/`bleStatus` capture fields (per-beacon timestamped RSSI; absent when the scan failed, empty when it completed and heard nothing); BLE reference/query scoring over the surveyed beacon universe with unheard-beacon penalties and capped differences, optionally blended with magnetic; same abstention gates; result methods `ble` and `magnetic-ble`. Confirmation of a clear/tentative result still requires physical user confirmation; no continuous fusion.

Validation: root `npm run check` passes (103 tests); `npm run export:web` succeeds. Synthetic tests cover places with identical magnetic fields distinguished only by BLE, absent-beacon handling, equidistant abstention, survey/query feature-space mismatch, historical revision independence and schema validation. These are synthetic and establish no venue accuracy. No physical BLE capture, RSSI measurement or recognition result exists yet.

Next: place 3–4 phone beacons, confirm each is heard with **Beacons → Listen**, survey two passes at three or more places with BLE enabled, record held-out and unsurveyed-spot trials, send the records and measure wrong matches/abstentions before any automatic fusion. Re-run after commercial beacons arrive; they need an identity adapter (iBeacon/Eddystone/vendor) feeding the same observations.

## Ranked fingerprints and recorded PDR corrections — 2026-10-10

IMPLEMENTED: `station-rank-v2` replaces the fixed 2 microtesla magnetic scale with a bounded repeatability-based scale. The candidate score/margin gate remains; clear, tentative and low-confidence rankings are visible even when the matcher abstains. No percentage probability is claimed. Existing records without a matcher revision retain v1 scoring. Android radio coverage failures now identify why Wi-Fi was captured but excluded; every candidate still uses the same feature space. See [updated protocol](../../FINGERPRINT_TESTING.md).

EXPERIMENT RESULT: 11 Pixel uploads contain eight unique survey captures (two per station) and three labelled independent captures. All scans report fresh Wi-Fi, but one station has only one repeatedly observed radio, forcing magnetic fallback. Across these and the previous four iPhone queries, v1 abstains on all seven, with the supplied label ranked first in all seven. V2 accepts six correct candidates and retains one tentative abstention (also correctly ranked first); none is an accepted wrong match in this development set. Raw SHA-256 files remain immutable in ignored work/test-inbox. Grouped, reproducible comparison and manifest are in ignored work/fingerprint-analysis-20261010/compare-v2.mjs and compare-v2.json. These are diagnostic/development results, not held-out validation of v2 or evidence of general building accuracy. No fourth Pixel recognition query was received.

DECISION: supersedes the earlier hold on matcher changes after the Pixel comparison. A recent physically confirmed clear/tentative suggestion can reset PDR at a surveyed point. Navigate opens recognition directly, retains the destination, saves the previous walking segment and records the fingerprint source, matcher revision, prior session/estimated position and confirmation time in the new segment. Alignment is still required. Confirmation checks time, device profile, venue revision and physical label in shared core. This is explicit correction between segments, not continuous fusion or automatic matching to walls; low confidence cannot relocate the dot through this flow.

Validation: root `npm run check` passes (93 tests / 22 files, both typechecks, lint, formatting, 175 local documentation targets); `npm run export:web` succeeds. Synthetic tests cover legacy replay, overlapping/out-of-survey signals, partial radio coverage, stale/future/wrong-device confirmations and correction provenance round-trip. Private-record replay above is separate from synthetic validation. Android and iOS development bundles contain the new matcher, storage ordering fix and correction metadata. Browser navigation opens Find my place directly, with no warning/error logs in the fresh test tab. No phone sensor or native filesystem retest was performed by the agent.

Next: reload the existing SDK 57 clients; record fresh independent recognition trials at every station, including the missing fourth Pixel query, and one unsurveyed/intermediate spot per phone. Improve repeated Wi-Fi coverage where flagged. Then walk one short route, pause at a surveyed spot, find/physically confirm, align and resume; upload both walking segments and fingerprint records. Measure false matches, abstentions and correction discrepancy before considering automatic fusion.

## First iPhone fingerprint uploads — 2026-10-10

EXPERIMENT RESULT: 16 received fingerprint records validated against the schema and their SHA-256 filenames: 12 unique survey captures (three passes at four stations), four independently captured labelled queries, one iOS installation profile. All four production replays abstain, but their top-ranked station agrees with the supplied physical label in all four. This is a small same-session diagnostic set, not established accuracy. Raw files remain unchanged in ignored work/test-inbox; reproducible analysis and hash manifest are in ignored work/fingerprint-analysis-20261010/analyze.mjs and report.json. No venue geometry, station identities or raw readings are committed.

FACT: capture quality passes; the rejection is the ranking-margin gate, not missing magnetic data. All station spread estimates hit the hard-coded 2 microtesla minimum. With this survey's station separation, the best-versus-runner-up score margin is below 1.25 even for a query exactly at each station centre. The implemented gate therefore precludes recognition of these learned stations. All four actual queries pass the absolute score threshold but fail the margin threshold. A secondary leave-one-survey-pass-out diagnostic ranks the labelled place first for 12/12 survey captures; these temporally correlated checks are not independent validation. Do not report the forced nearest-choice results as accepted localization success.

DECISION: keep the app/model unchanged during the user's Pixel comparison. Do not infer that the house has insufficient magnetic variation or that a larger building would solve this. Next: inspect Pixel records for fresh Wi-Fi and whether combined matching actually activates. Then replace the fixed confidence scale with an experimentally evaluated repeatability/separation-aware rule, preserving abstention and testing new held-out trials, including unsurveyed/intermediate locations and changed phone orientation/height. Current magnetic magnitude alone does not establish a unique place throughout a building. No automatic fusion or cross-device model transfer is validated.

Validation: ran the shared production schema, feature extractor and matcher on all received records; verified immutable-file hashes, deduplicated capture IDs across cumulative snapshots and separated survey resampling from the four queries. Documentation formatting and local links checked. No app changes, native build or new physical test performed by the agent; no background monitoring.

## Fingerprinting station pilot — 2026-10-10

DECISION: user-requested fingerprinting precedes the previously proposed camera milestone. New Survey flow captures calibrated magnetic vectors on both phones and optional fresh Wi-Fi on Android build 3. Survey two passes at three or more physically verified anchors per installation; recognize a separate query without its actual-place label, then allow a recent physically confirmed candidate to re-anchor navigation. No continuous pose fusion, cross-device model or automatic correction is claimed. [Test protocol and limits](../../FINGERPRINT_TESTING.md).

IMPLEMENTED: pure versioned matcher/replay in positioning-core; capture/storage outside screens; bounded monotonic samples, lifecycle cancellation, optional precise-location permissions, stale-scan rejection and hashed radio identifiers. Raw snapshots/test inputs are immutable after receipt through the authenticated inbox. The app saves locally and transfers only when the user taps Send. UI now has persistent Navigate/Survey/Tests tabs, map-first navigation, larger shared controls, selected/focus states and expandable details. Mobbin search was unavailable without a paid plan; no reference assets were used.

EXPERIMENT: conservative magnetic magnitude and repeated RSSI references distinguish surveyed stations or abstain. Thresholds are engineering choices, not calibrated probabilities. Similar magnetic fields, sparse/throttled Wi-Fi and device/environment changes can defeat matching. Same-phone surveys are intentional; independent physical measurements are still required. The original PDR filter and stride are unchanged.

Validation (2026-10-10): root `npm run check` passes: 86 tests in 21 files, both typechecks, lint, formatting and 175 local documentation targets. `npm run export:web` succeeds. Tests cover independent labels, ambiguous/out-of-coverage signals, unstable competitors, missing/throttled radio fallback, sensor clocks, permission denial and cancellation including a pending native scan. Inbox tests verify authenticated exact-byte receipt and invalid-label rejection. The replay CLI correctly processes an explicitly synthetic example; this is not a venue result. Strict UI audit and DESIGN.md lint report no errors/warnings. Browser checks exercised all three tabs, survey/test gating, disabled web capture, disclosures, handling mode, destination search/empty/clear and narrow layout. Fixed SVG web responder errors and empty-text warnings found during inspection; no new console errors after final reload. Physical touch, accessibility-reader behavior and phone sensors remain unverified.

Android ARM64 build 3 assembles successfully. Packaged manifest/version/permissions and DEX Wi-Fi module revision checked; APK signature matches build 2, ZIP integrity passes, and the LAN-served download matches SHA-256 `478c7cadd3effee2048c5ee2f3d2290c1c5b07de7c0530e6db1b1df2a889cf7e` (97,499,934 bytes). SDK 57 iOS/Android bundles fetched over LAN contain the Survey and matching code. Expo, paired inbox and APK server are running locally, with regenerated launch/install QRs in ignored work/phone-test. No installation or physical accuracy success is claimed. Upstream native deprecation/toolchain warnings remain; compilation succeeds. Metro workers capped at two to reduce contention with the native build.

Next action: install Android build 3 and connect both phones, collect separate surveys and held-out recognition tests, label all outcomes after prediction and send records. Evaluate wrong matches, abstentions and map-point error by device/signal method. Only then consider sequence features or automatic fusion. Native compilation and browser checks do not establish physical performance.

## Next milestone research: independent movement evidence

FACT: user reports movement on Pixel and iPhone but compensates for different distance estimates with calibration. This is qualitative improvement; no new build-2 accuracy measurement is established. The engine still uses fixed-stride PDR with unknown uncertainty and no environmental corrections.

PROPOSED: optional camera-assisted room-to-room positioning using ARCore first, then ARKit, followed by verified map constraints and passive BLE/magnetic corrections. [Research, competitor comparison, adapter review and executable handoff](../../../research/HYBRID_POSITIONING_NEXT_STEP_2026_10.md). Pixel-first supersedes the earlier iPhone-first experiment because a local Android native host now exists. ARCore 1.56.0 and ViroReact 3.0.3 revisions/licenses inspected; Viro's public camera event lacks capture timestamps/session epochs, so a narrow native Expo adapter is preferred for the initial experiment. No new dependency or positioning code introduced.

Validation for this research update: Markdown formatting and repository documentation links checked. No native build, new physical test or accuracy result. Exact next action: implement optional timestamped ARCore acquisition, versioned visual-pose/reset contracts and replay, then expose camera-assisted navigation with existing checkpoints/upload. Preserve raw PDR comparison and SDK 57. Gate fusion on held-out physical results; camera-off/repeated-QR-free operation still requires passive venue corrections.

Android acquisition now uses a local buffered sensor module; see [ADR-0006](../../../decisions/0006-android-buffered-motion-acquisition.md) and [mobile status](../mobile/STATUS.md). Recording metadata optionally retains the installed acquisition revision for diagnosis, without changing old schemas/replay or the PDR algorithm. Synthetic raw-batch tests exercise units/frames, walking versus bobbing, full navigation movement and exact replay parity. Physical accuracy remains unvalidated.

Module-boundary fix: `engine.ts` now owns NavigationEngine/recording schema/replay; `index.ts` only exports public APIs. Diagnostics imports the engine directly, removing Metro's observed runtime require cycle. Algorithms and serialized contracts are unchanged; 59 tests/root checks pass.

Navigation now explicitly selects recorded `continuous-test` policy: 30 m drift limit becomes a persistent warning, while sensor failure stops remain. Missing policy preserves historical bounded replay. Unit coverage compares both policies beyond 30 m, replay equality and sensor failure behavior. Android acquisition startup now tolerates partial native frames; normalized displacement math is unchanged.

## Accuracy review after navigation testing

User reports short distance and turns occurring before the mapped doorway. No navigation-tagged runs are in the 23-file local inbox yet. Existing follow-up replay demonstrates brisk-step rejection as well as unresolved count/stride error; route guidance does not correct either. [Evidence, external research and proposed next slice](../../../research/ACCURACY_NEXT_STEP_2026_10.md). Recommend doorway checkpoint evaluation, bounded guard repair and an independent ARKit translation experiment before selecting fusion. Camera-free corrections remain a venue-specific BLE/magnetic or vendor-SDK evaluation. No implementation or physical validation added by this review.

## Versioned motion filtering

New live sessions select `step-yaw-motion-v2`; engine default and historical v1 recordings preserve baseline behavior. Shared core buffers peaks and original headings, accepts at most one per observation, holds ambiguous/missing-data displacement, and exposes assessment separately from unknown pose uncertainty. Anchors/stops reset or discard pending motion. No labels, map geometry or native counts enter the classifier. [Experiment and limits](../../../research/MOTION_GUARD_EXPERIMENT.md). 51 tests/root checks pass; held-out phone behavior is unvalidated.

## Current state / decisions

Pure NavigationEngine accepts validated observations and emits authoritative pose. QR identity is resolved against loaded venue/revision. Anchor establishes position; heading alignment is explicit. Experimental PDR poses are degraded with unknown uncertainty. Re-anchor resets detector/heading/history. Stop on timing gaps/reversals, stale heading, tilt, jumps, impacts, lifecycle interruption or 30 m tracking limit.

Live Expo DeviceMotion and JSON replay share observations/engine. Native seconds are rebased per capture; repeated native fields are deduplicated. UI owns lifecycle/permissions but no navigation math. [ADR-0004](../../../decisions/0004-anchored-pdr-evaluation-baseline.md).

## Validation / limitations

Unit tests cover QR revision/identity failures, replay equality, stationary/turning behavior, missing heading and failure recovery. Android/iOS exports pass; no phone execution claimed. No fusion, map constraints, radio fallback, floor inference or calibrated covariance.

## Next action

Checkpoint evaluation is implemented: optional versioned-recording annotations retain node ID, native-session time and exact observation count. Replay evaluates map discrepancy and motion counts without feeding annotations into the estimator; malformed references/boundaries yield unavailable results. Arrival and still-check taps allow delay comparison. Historical recordings remain compatible and motion thresholds are unchanged. Synthetic tests verify round-trip persistence, replay independence and invalid-reference/timestamp handling; these do not establish physical accuracy.

Obtain paired normal/brisk navigation recordings through the existing inbox, checking actual door geometry. Follow the current hybrid-positioning handoff above; preserve failed runs and hashes. SDK 57 remains pinned. Native VIO candidate review is recorded, but compatibility and timestamp/reset behavior still need an executable spike before adopting an adapter.
