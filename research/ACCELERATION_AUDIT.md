# TURN Acceleration Audit
Status: COMPLETE (desk audit; no TURN device or venue measurement)
Audit date: 2026-09-12
Plan: [completed plan 001](../plans/completed/001-acceleration-audit.md)

## Method and evidence boundary

**FACT (this audit):** The checkout was clean on branch `work`, then work moved to
`audit/first-acceleration-audit`. HTTPS GETs returned HTTP 200 from GitHub, Android
Developers, and Apple Developer. Git smart-HTTP clones of external repositories
returned HTTP 403 because this environment permits GET/HEAD/OPTIONS, not the POSTs
used by Git. Repository metadata, default-branch commits, README files, and license
files were therefore inspected through GitHub's read-only REST API. Details are in
[the cloud setup record](../docs/CODEX_CLOUD_SETUP.md).

**FACT (evidence boundary):** No TURN dataset, private floor plan, target venue,
phone matrix, numeric acceptance threshold, beacon budget, or prior measurement was
available. Repository activity and upstream examples show maintenance or
reproducibility affordances; they do not demonstrate TURN accuracy, battery use, or
venue suitability. All repository revisions below are immutable commit IDs observed
through the GitHub API on the audit date. Source snapshots can change after that ID.

## Executive recommendation

**PROPOSED (high confidence):** Take the shortest credible path as a *replay-first,
single-floor baseline*: manually review one legally usable floor plan into a small
metric walkable graph; capture synchronized Android and iOS IMU/magnetic logs with
surveyed checkpoints; establish step/heading PDR; then add map constraints and only
then test magnetic or BLE corrections. Keep Wi-Fi an Android-only optional channel.
Use MapLibre Native for display only after the venue-map contract is exercised, and
NetworkX for offline graph validation/routing oracle. Do not begin with automatic
floor-plan extraction, a generic navigation backend, or radio fingerprint ML: the
missing ground truth and cross-device data dominate those choices.

**PROPOSED (staffing):** Use **one capable agent as the integrator**, with short,
bounded specialist tasks for (1) native Android/iOS acquisition review, (2) survey
and ground-truth design, and (3) replay/statistics review. Do **not** start a daily
automation loop. The real bottlenecks are team-supplied devices, data rights,
venue ground truth, targets, and empirical results; unattended research would
multiply documents without resolving them. Reconsider automation only after a
versioned dataset and deterministic replay command exist; then a daily/CI replay
could detect metric regressions.

## Subsystem decisions

Labels classify the next TURN action, not an upstream project's overall quality.
Effort is an engineering estimate in person-days after inputs are available and is
**HYPOTHESIS**, not measured elapsed time.

| Subsystem | Classification | Sourced basis and alternatives | Bounded next action / estimated adaptation |
|---|---|---|---|
| Floor-plan ingestion, scale, alignment | **IMPLEMENT** | **FACT:** CVAT is an actively maintained MIT annotation platform at commit [`1d0c395`](https://github.com/cvat-ai/cvat/tree/1d0c39576c3239dcaf8ba7baee71a1b8de496c0e), but its stated purpose is image/video annotation, not creation of metric indoor topology ([README](https://github.com/cvat-ai/cvat/blob/1d0c39576c3239dcaf8ba7baee71a1b8de496c0e/README.md), [license](https://github.com/cvat-ai/cvat/blob/1d0c39576c3239dcaf8ba7baee71a1b8de496c0e/LICENSE)). | Define a project-specific, reviewed transform and topology export (2–4 d). **ADOPT** CVAT only if bulk image annotation becomes a measured bottleneck; do not infer scale or doors automatically. |
| Automatic floor-plan extraction | **EXPERIMENT** | **FACT:** no candidate reviewed here provides verified rights to suitable weights/data plus metric topology and door connectivity. **HYPOTHESIS:** manual tracing is faster for the first venue. | Defer. Later compare manual time/error with one separately licensed model on public/authorized plans (3–5 d evaluation, excluding labeling). |
| Venue-map schema, POIs, floors/connectors | **IMPLEMENT** | **FACT:** MapLibre renders maps but does not define TURN's venue semantics. **PROPOSED:** retain the explicit metric contract in [architecture](../docs/ARCHITECTURE.md). | Small versioned schema and validators, including accessible edges and floor connectors (2–4 d after product fields are known). |
| Map rendering/UI | **ADAPT** | **FACT:** MapLibre Native supports Android and iOS and uses BSD-2-Clause at [`9ee6f1c`](https://github.com/maplibre/maplibre-native/tree/9ee6f1c3b5b97fc2cba1c1042cadef87fa158476) ([platform README](https://github.com/maplibre/maplibre-native/blob/9ee6f1c3b5b97fc2cba1c1042cadef87fa158476/README.md), [license](https://github.com/maplibre/maplibre-native/blob/9ee6f1c3b5b97fc2cba1c1042cadef87fa158476/LICENSE.md)). | Prove local coordinate transform, floor switching, pose/uncertainty overlays, and offline packaging before adoption (3–6 d). Native-vs-cross-platform UI remains open. |
| Routing and graph validation | **ADOPT** (offline oracle); **IMPLEMENT** (mobile boundary) | **FACT:** NetworkX supplies graph algorithms and a BSD license at [`4e74880`](https://github.com/networkx/networkx/tree/4e74880b0da01977da79915167c64e5c2af38b47) ([README](https://github.com/networkx/networkx/blob/4e74880b0da01977da79915167c64e5c2af38b47/README.rst), [license](https://github.com/networkx/networkx/blob/4e74880b0da01977da79915167c64e5c2af38b47/LICENSE.txt)). **FACT:** OSRM/Valhalla are maintained road-routing engines, substantially broader than a first indoor graph. | Use NetworkX in research tooling to test reachability and shortest-path fixtures (1–2 d); define a portable graph/query contract and implement the minimal on-device solver later (2–4 d). |
| Native sensor acquisition/logging | **IMPLEMENT** | **FACT:** Android sensor availability varies and event timestamps are nanoseconds since boot ([Android sensor overview](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview)). **FACT:** Apple's Core Motion says availability must be checked, rates are hardware-dependent, and push delivery can preserve samples during brief app work ([Core Motion](https://developer.apple.com/documentation/coremotion/getting-raw-accelerometer-events)). | Thin native adapters plus immutable session manifest, monotonic clocks, units, frames, calibration and drop counters (4–8 d/platform). Use phyphox as an independent logger, not copied app code. |
| Reference sensor logger | **ADOPT** (experiment tool only) | **FACT:** phyphox has current Android and iOS repositories, both GPL-3.0, at [`45fa55a`](https://github.com/phyphox/phyphox-android/tree/45fa55a0727653ccce439b86acb69c00cf435436) and [`b7558d6`](https://github.com/phyphox/phyphox-ios/tree/b7558d64b2bc7963bfe9e6c9f7ff67b6e3dfcecf) ([Android license](https://github.com/phyphox/phyphox-android/blob/45fa55a0727653ccce439b86acb69c00cf435436/LICENSE), [iOS license](https://github.com/phyphox/phyphox-ios/blob/b7558d64b2bc7963bfe9e6c9f7ff67b6e3dfcecf/LICENSE)). | Use the released apps to sanity-check sensor availability/export during experiments (0.5–1 d setup). Do not incorporate GPL code into an undecided product licensing model. Verify export clocks/units in every manifest. |
| Deterministic replay/preprocessing | **IMPLEMENT** | **FACT:** no TURN data schema or replay implementation exists. Existing app demos couple acquisition and algorithms. | Build only after a real sample establishes fields; hash input/config/output and preserve raw data (3–6 d). This is the integration spine. |
| Step detection and stride model | **EXPERIMENT** | **FACT:** `Indoor-Localization-PDR` contains Android PDR/activity code and data at [`9292476`](https://github.com/ahmadabdelqader/Indoor-Localization-PDR/tree/92924760d43fedde06e7d3792fb87ed84fe570e9), but no repository license was present and its last observed commit was 2021-04-26 ([README](https://github.com/ahmadabdelqader/Indoor-Localization-PDR/blob/92924760d43fedde06e7d3792fb87ed84fe570e9/README.md)). | Reimplement a cited threshold/peak baseline; test pocket/hand/bag and multiple users before selecting adaptive or learned approaches (2–4 d baseline). No code/data/weights may be copied from the unlicensed lead. |
| Heading / attitude | **ADAPT** | **FACT:** xioTechnologies Fusion is MIT-licensed C with Python bindings, examples and data at [`9325424`](https://github.com/xioTechnologies/Fusion/tree/9325424011892abacc0ce42b8bb1a8ae20264b9b) ([README](https://github.com/xioTechnologies/Fusion/blob/9325424011892abacc0ce42b8bb1a8ae20264b9b/README.md), [license](https://github.com/xioTechnologies/Fusion/blob/9325424011892abacc0ce42b8bb1a8ae20264b9b/LICENSE.md)). | Replay it against platform attitude and a gyro-only baseline; adapt coordinate frames and disturbance rejection only if it wins (2–4 d). Magnetic indoor heading remains empirical. |
| PDR composition | **IMPLEMENT** after component experiments | **FACT:** PositionMe describes Android PDR/GNSS/Wi-Fi particle fusion and map constraints at [`d247ca8`](https://github.com/jagsnapuri/positionme-indoor-positioning/tree/d247ca88d57911197e4b9a6f342849129d375fae), but its public tree has no detected license ([README](https://github.com/jagsnapuri/positionme-indoor-positioning/blob/d247ca88d57911197e4b9a6f342849129d375fae/README.md)). | Treat both named leads as design evidence only. Compose TURN's measured step, stride and heading baselines behind replay interfaces (2–4 d after those baselines). |
| Magnetic fingerprints | **EXPERIMENT** | **FACT:** Core sensors expose magnetic observations, but no reviewed candidate closes venue survey, device/session transfer, and iOS/Android integration with verified license. | Measure repeatability, spatial separability, orientation/carry-mode effect, and device transfer before choosing kNN/particle likelihood (3–5 d analysis plus team collection). |
| BLE acquisition / corrections | **EXPERIMENT**; Android library **ADAPT** only if selected | **FACT:** Android requires runtime Bluetooth permissions by target/version and recommends time-limited BLE scans ([permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions), [scan guidance](https://developer.android.com/develop/connectivity/bluetooth/ble/find-ble-devices)). **FACT:** Android Beacon Library is Apache-2.0 at [`aca69f9`](https://github.com/AltBeacon/android-beacon-library/tree/aca69f9bc7f3526032e6e5fcc3593a3259c7d2d4) and reports approximately 1 Hz ranging ([README](https://github.com/AltBeacon/android-beacon-library/blob/aca69f9bc7f3526032e6e5fcc3593a3259c7d2d4/README.md), [license](https://github.com/AltBeacon/android-beacon-library/blob/aca69f9bc7f3526032e6e5fcc3593a3259c7d2d4/LICENSE)). | First test raw advertisement availability, IDs, RSSI variance, background/foreground behavior and battery on both platforms (2–4 d plus devices/beacons). Do not interpret RSSI as distance without calibration. Use native CoreBluetooth on iOS. |
| Optional Wi-Fi observations | **EXPERIMENT** (Android only); absent on iOS | **FACT:** Android scanning has permissions, location-state requirements and foreground/background throttles ([official scan guide](https://developer.android.com/develop/connectivity/wifi/wifi-scan)). **FACT:** Apple states iOS has no general-purpose Wi-Fi scanning API; current-network access is constrained ([TN3111](https://developer.apple.com/documentation/technotes/tn3111-ios-wifi-api-overview), [`fetchCurrent`](https://developer.apple.com/documentation/networkextension/nehotspotnetwork/fetchcurrent(completionhandler:))). | If Android value is still desired, log scan age/status and compare added correction value; core replay and acceptance must work without it (2–3 d plus collection). Never design iOS fingerprints around nearby AP scans. |
| Fusion and uncertainty | **EXPERIMENT** | **FACT:** Fusion library is attitude-focused, while PositionMe's application fusion is unlicensed and Android-specific. **HYPOTHESIS:** a particle filter is promising for multimodal likelihoods and wall constraints but could be unnecessary for the first baseline. | Compare deterministic PDR, constrained hypotheses/particles, and correction ablations on held-out paths; require calibrated uncertainty and lost/recovery states (4–8 d). |
| Map constraints / floor inference | **EXPERIMENT** | **FACT:** the strongest reviewed demo is unlicensed and not a TURN measurement. **FACT:** pressure hardware is not universal (see [platform constraints](../docs/PLATFORM_CONSTRAINTS.md)). | Implement replay-only wall-crossing rejection/projection and report wall violations plus recovery; test floor transitions separately with and without pressure (3–6 d). |
| Cross-device/session calibration | **EXPERIMENT** | **FACT:** no TURN multi-device data exists. **HYPOTHESIS:** fixed magnetometer/RSSI/stride calibration will not transfer reliably. | Leave-one-device and leave-one-session-out evaluation; compare no calibration, simple normalization/bias, and per-device calibration (3–5 d analysis after data). |
| Trajectory evaluation | **ADAPT** | **FACT:** evo is a maintained GPL-3.0 trajectory evaluation tool at [`bc52497`](https://github.com/MichaelGrupp/evo/tree/bc52497d7f403bf2afb25be3f760f3d6be1432c1) and supports CSV/TUM-style trajectory inputs ([README](https://github.com/MichaelGrupp/evo/blob/bc52497d7f403bf2afb25be3f760f3d6be1432c1/README.md), [license](https://github.com/MichaelGrupp/evo/blob/bc52497d7f403bf2afb25be3f760f3d6be1432c1/LICENSE)). | Use as a separate research process or adapt metric definitions without copying code. Add indoor metrics: checkpoint error, drift/distance, heading, floor accuracy, wall crossings, completion and recovery (2–4 d). |

The exact candidate inventory, observed maintenance, compatibility, and licensing
disposition is in the [reuse registry](REUSE_REGISTRY.md).

## Critical path and dependencies

1. **Team input:** choose one legal, non-sensitive floor plan and record a measured
   dimension, walkable areas, checkpoints, stairs/lifts, and survey method.
2. **Team input:** agree minimum Android/iOS versions, 2+ representative phones per
   platform if available, carrying modes, privacy handling, and provisional accuracy,
   latency, battery, and survey-effort targets.
3. **Engineering:** finalize a session manifest and capture/export capability probe;
   raw logs remain immutable and outside Git, with hashes in results.
4. **Engineering:** deterministic replay plus PDR baselines; only then map constraints
   and radio/magnetic ablations.
5. **Product/engineering:** select UI stack and deployable routing only after the
   metric map/pose/route contracts are proven.

## Next three reproducible team experiments

These are **PROPOSED**, not completed or validated. Full pre-registration summaries
also appear in the [experiment log](../experiments/EXPERIMENT_LOG.md).

### E001 — Cross-platform acquisition and clock integrity

- **Question:** Can target phones capture complete, correctly framed, monotonically
  timestamped IMU/magnetic/pressure (when present) and foreground BLE observations?
- **Hardware/team:** at least one Android and one iPhone (preferably two of each), a
  fixed table, stopwatch/video time cue, and optionally one known BLE beacon. Record
  exact model/OS/app state; do not collect identifiers or venue traces.
- **Protocol:** 60 s stationary, six face-up/device-axis orientations, ten deliberate
  rotations, and a 2-minute repeat; feature-detect each sensor/permission. Export raw
  samples once, hash them, and replay twice from the same immutable input.
- **Ground truth:** known stationary intervals, counted rotations/orientation script,
  OS permission state, and external video timestamps (not claimed as sub-frame truth).
- **Metrics/pass gate:** sample count/rate/jitter, non-monotonic timestamps, gaps,
  duplicate timestamps, replay byte/result determinism, axis/gravity sanity, missing
  capabilities and denial behavior. Gate: zero unexplained clock reversals; identical
  replay output; every unavailable/denied input is explicit. Numeric rate/gap targets
  are set from observed devices, not invented here.

### E002 — Surveyed single-floor PDR baseline

- **Question:** Which simple step/stride/heading baseline is stable enough to anchor
  later map and radio comparisons?
- **Hardware/team:** E001 phones, two or more walkers, hand/pocket/bag modes, and a
  measured 30–100 m indoor route with turns and at least six surveyed checkpoints.
- **Protocol:** pre-register route and start pose; each device/user/mode repeats both
  directions at least three times. Freeze algorithm/config before scoring held-out
  repetitions. Compare counted-step + fixed stride + gyro heading, threshold step
  detector, and Fusion/platform attitude variants.
- **Ground truth:** tape/laser-measured segment lengths, marked checkpoints, known turn
  directions/angles where geometry supports them, manual step count from video.
- **Metrics:** precision/recall of steps, endpoint and checkpoint median/p95 error,
  drift/distance, heading error at turns, failures by device/user/mode. Report paired
  traces and confidence intervals; no publication number is a pass threshold.

### E003 — Constraint and correction ablation

- **Question:** Do map constraints and one optional observation type improve held-out
  localization without harmful lock-in or failed recovery?
- **Hardware/team:** E002 setup and metric map; choose magnetic first because it needs
  no installed radio hardware, or BLE only if beacon placement/budget is supplied.
- **Protocol:** freeze E002 PDR. Split collection by session and device. Replay the
  exact same held-out walks as PDR-only, PDR+map, PDR+observation, and full system.
  Include a deliberately wrong initial pose and a corridor ambiguity. Never use
  Android Wi-Fi in the cross-platform core arm.
- **Ground truth:** surveyed checkpoints and floor/wall topology; beacon coordinates
  if BLE; separate survey and test sessions.
- **Metrics:** median/p95 checkpoint error, wall crossings, route completion, floor
  errors, time-to-recover, lost-state coverage/calibration and compute latency. A
  correction advances only if held-out improvement is consistent across devices and
  failure/recovery are explicit; team sets the numeric minimum before collection.

## Unresolved decisions and uncertainty

- **UNKNOWN:** venue, floor-plan rights/format, team/device inventory, minimum OS,
  initial-position UX, accessibility rules, offline requirement, targets and budget.
- **UNKNOWN:** whether previous local experiments can be legally and reproducibly
  imported; their existence is not evidence of performance.
- **UNCERTAINTY (high):** magnetic/BLE repeatability, carrying mode, floor inference,
  map extraction effort and cross-device transfer until E001–E003 are run.
- **UNCERTAINTY (medium):** MapLibre offline/local-coordinate ergonomics and native
  package integration; verify against chosen minimum OS before architecture decision.
- **DECISION:** no production app scaffold and no recurring automation were created
  in this audit. No candidate was silently made a product dependency.
